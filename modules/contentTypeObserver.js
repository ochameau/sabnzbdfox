/* ***** BEGIN LICENSE BLOCK *****
# Copyright 2009 Alexandre Poirot
#
# Contributor(s):
#   Alexandre poirot <poirot.alex@gmail.com>
# 
# 
# This library is free software; you can redistribute it and/or
# modify it under the terms of the GNU Lesser General Public
# License as published by the Free Software Foundation; either 
# version 2.1 of the License, or (at your option) any later version.
# 
# This library is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
# Lesser General Public License for more details.
# 
# You should have received a copy of the GNU Lesser General Public 
# License along with this library.  If not, see <http://www.gnu.org/licenses/>.
#
# ***** END LICENSE BLOCK *****/

var EXPORTED_SYMBOLS = ["contentTypeObserver"];

/***********************

### User documentation :

var contentTypeObserver = {};

// Tell if we must catch requests with this content-type
// requestInfo is an object with 3 attributes : contentType, contentLength and fileName.
contentTypeObserver.getRequestListener = function (requestInfo) {
  // Return a new instance of nsIWebProgressListener
  // (a new instance to avoid conflicts with multiple simultaneous downloads)
  return {
    onStartRequest : function (request, context) {

    },
    onStopRequest : function (request, context, statusCode) {

    },
    onDataAvailable : function (request, context, inputStream, offset, count) {

    }
  };
  // There is an helper function that allow to automatically save this request to a file,
  // you just have to pass destinationFile argument which hold a nsIFile instance :
  return createSaveToFileRequestListener(requestInfo, destinationFile, function () { dump("file : "+destinationFile.spec+" downloaded!\n"); }
}

addContentTypeObserver(contentTypeObserver);


### Internal work documentation :

Mozilla internal dark wizardry fix ...

There is a common way to listen to all URI loaded by Mozilla/Firefox
  Components.classes["@mozilla.org/uriloader;1"].getService(Components.interfaces.nsIURILoader).registerContentListener( ...nsIURIContentListener... );
but unfortunately these listeners are bypassed in some cases

Here in the mozilla universe : http://mxr.mozilla.org/mozilla-central/source/uriloader/base/nsURILoader.cpp#403
Our nsIURIContentListener is not called because some requests have data in their Content-disposition header
So we need to go deeper in library and intercept all http requests before nsURILoader gets called :/

Here is the work's done :
 1) We intercept all HTTP requests with "http-on-examine-response" event 
 2) Then we trace each of them with a new specific instance of TracingListener
 3) Finally, when the request starts, check if the content type is relevant and if it is :
  3.1) don't call original listener (disable all classic mozilla behavior)
  3.2) instead, call user specific listener

***********************/

function createSaveToFileRequestListener(requestInfo, file, onFileDownloaded) {
// Initialize xpcom stuff for writing to a file
  var output = Components.classes["@mozilla.org/network/file-output-stream;1"]
                    .createInstance(Components.interfaces.nsIFileOutputStream);
  var buffer = Components.classes["@mozilla.org/network/buffered-output-stream;1"]
                    .createInstance(Components.interfaces.nsIBufferedOutputStream);
  output.init(file, 0x02 | 0x08 | 0x20, 0664, null);
  buffer.init(output, 8192);
  
  // Initialize xpcom stuff in order to appear in download manager
  var transfert = Components.classes["@mozilla.org/transfer;1"].createInstance(Components.interfaces.nsITransfer);
  
  var progress = 0;
  var contentLength = requestInfo.contentLength;
  
  return {
    onStartRequest : function (request, context) {
      var ioService = Components.classes["@mozilla.org/network/io-service;1"]
                              .getService(Components.interfaces.nsIIOService);
      var fileUri=ioService.newFileURI(file);
      var mimeService = Components.classes["@mozilla.org/mime;1"].getService(Components.interfaces.nsIMIMEService);
      var mimeInfo = mimeService.getFromTypeAndExtension(requestInfo.contentType, null);
      
      transfert.init(request.URI, fileUri, file.leafName,
            mimeInfo,
            new Date() /* start time */,
            null /* temp file */,
            this);
    },
    onStopRequest : function (request, context, statusCode) {
      // Download is finished, flush et close nicely our file
      buffer.flush();
      buffer.close();
      
      // Notify download manager that's download is finished
      transfert.onProgressChange64(null, request, progress, contentLength, progress, contentLength);
      transfert.onStateChange(null, null,
          Components.interfaces.nsIWebProgressListener.STATE_STOP |
          Components.interfaces.nsIWebProgressListener.STATE_IS_REQUEST |
          Components.interfaces.nsIWebProgressListener.STATE_IS_NETWORK, 0);
      
      // Finally pass this new file to upper layer
      if (typeof onFileDownloaded=="function")
        onFileDownloaded(file);
    },
    onDataAvailable : function (request, context, inputStream, offset, count) {
      progress += count;
      // Save incoming data into our file
      while(count > 0)
        count -= buffer.writeFrom(inputStream, count);
      transfert.onProgressChange64(null, request, progress, contentLength, progress, contentLength);
    }
  };
}

function getRequestInfo(request) {
  var requestInfo = {
    get contentType() {
      var contentType;
      try {
        contentType = request.getResponseHeader("Content-Type").toLowerCase();
      } catch(e) {}
      return contentType;
    },
    get contentLength() {
      var contentLength = -1;
      try {
        request.QueryInterface(Components.interfaces.nsIPropertyBag2);
        contentLength = request.getPropertyAsInt64("content-length");
      } catch(e) {
        try {
          contentLength = request.contentLength ;
        } catch(e) {}
      }
      return contentLength;
    },
    _fileName : null,
    get fileName() {
      if (this._fileName) return this._fileName;
      var fileName = "";
      // Try to get name from Content-Disposition header
      var contentDisposition;
      try {
        contentDisposition = request.getResponseHeader("Content-Disposition");
      } catch(e) {}
      const mhp = Components.classes["@mozilla.org/network/mime-hdrparam;1"].getService(Components.interfaces.nsIMIMEHeaderParam);
      var dummy = { value: null }; // To make JS engine happy.
      var charset = "UTF-8";
      try {
        fileName = mhp.getParameter(contentDisposition, "filename", charset, true, dummy);
      } catch (e) {}
      if (!fileName) {
        try {
          fileName = mhp.getParameter(contentDisposition, "name", charset, true, dummy);
        } catch (e) {}
      }
      if (fileName)
        fileName = fileName.replace(/^"|"$/g, "");
      // Content-Disposition doesn't contains any file name
      // try to guess filename from the URL
      if (!fileName) {
        request.URI.QueryInterface(Components.interfaces.nsIURL);
        fileName = request.URI.fileName;
      }
      this._fileName = fileName;
      return fileName;
    }
  }
  return requestInfo;
}

function TracingListener(contentTypeObserver, requestListener, requestInfo, channel) {
  this._contentTypeObserver = contentTypeObserver;
  this._requestListener = requestListener;
  this._requestInfo = requestInfo;
  this._channel = channel;
}
TracingListener.prototype.onStartRequest = function (request, context) {
try {
  request.QueryInterface(Components.interfaces.nsIRequest);
  if (!(request.loadFlags & Components.interfaces.nsIHttpChannel.LOAD_DOCUMENT_URI))
    return this.originalListener.onStartRequest(request, context);
  request.QueryInterface(Components.interfaces.nsIHttpChannel);
  
  // Re-check if we watch this Content-type/file
  // Now we must have receive headers!
  if (!this._requestListener)
    this._requestListener = this._contentTypeObserver.getRequestListener(this._requestInfo);
  
  // We don't want to catch this request
  if (!this._requestListener) {
    this.originalListener.onStartRequest(request, context);
    return;
  }
  
  // We do want! So trap all next calls
  return this._requestListener.onStartRequest(request, context);
}catch(e){Components.utils.reportError(e);}
}
TracingListener.prototype.onStopRequest = function (request, context, statusCode) {
try {
  if (!this._requestListener)
    return this.originalListener.onStopRequest(request, context, statusCode);
  this._requestListener.onStopRequest(request, context, statusCode);
  this.clean();
}catch(e){Components.utils.reportError(e);}
}
TracingListener.prototype.onDataAvailable = function (request, context, inputStream, offset, count) {
try {
  if (!this._requestListener)
    return this.originalListener.onDataAvailable(request, context, inputStream, offset, count);
  return this._requestListener.onDataAvailable(request, context, inputStream, offset, count);
}catch(e){Components.utils.reportError(e);}
}
TracingListener.prototype.clean = function () {
  try {
    this._channel.setNewListener(this.originalListener);
  } catch(e) {}
  this._contentTypeObserver = null;
  this._requestListener = null;
  this.originalListener = null;
  this._requestInfo = null;
}
TracingListener.prototype.QueryInterface = function (aIID) {
  if (aIID.equals(Components.interfaces.nsIStreamListener) ||
    aIID.equals(Components.interfaces.nsIRequestObserver) ||
    aIID.equals(Components.interfaces.nsISupports)) {
    return this;
  }
  throw Components.results.NS_NOINTERFACE;
}


function addContentTypeObserver(contentTypeObserver) {
  var observerService = Components.classes["@mozilla.org/observer-service;1"]
    .getService(Components.interfaces.nsIObserverService);
  
  var internalHttpResponseObserver = {
    observe : function(channel) {
      channel.QueryInterface(Components.interfaces.nsIHttpChannel);
      
      var requestListener = null;
      
      // Check if we watch this Content-type/filename
      // but we don't necessary have headers set at this point
      // some requests are still in progress ...
      var requestInfo = getRequestInfo(channel);
      if (requestInfo.contentType) {
        requestListener = contentTypeObserver.getRequestListener(requestInfo);
        // We don't want to catch this request:
        if (!requestListener) return;
      }
      
      // We don't get Content-Type or observer want to watch this request
      channel.QueryInterface(Components.interfaces.nsITraceableChannel);
      var newListener = new TracingListener(contentTypeObserver,requestListener,requestInfo,channel);
      newListener.originalListener = channel.setNewListener(newListener);
    }
  };
  observerService.addObserver(internalHttpResponseObserver, "http-on-examine-response", false);
  
  // Return an obset with a stop method 
  // which allow to stop all observers
  return {
    stop : function () {
      observerService.removeObserver(internalHttpResponseObserver, "http-on-examine-response");
    }
  }
}


const contentTypeObserver = {
  addObserver : addContentTypeObserver,
  createSaveToFileRequestListener : createSaveToFileRequestListener
}