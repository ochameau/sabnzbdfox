var EXPORTED_SYMBOLS = ["nzbCatcher"];

Components.utils.import("resource://sabnzbdfox/contentTypeObserver.js"); 
Components.utils.import("resource://sabnzbdfox/sabnzbBridge.js"); 

var nzbCatcher = {};

nzbCatcher.getDestinationDir = function () {
  var dirPath = this.prefs.getCharPref("target");
  if (!dirPath) return false;
  
  try {
    var file = Components.classes["@mozilla.org/file/local;1"].
                       createInstance(Components.interfaces.nsILocalFile);
    file.initWithPath(dirPath);
    if (!file.exists()) {
      return false;
    }
  } catch(e) {
    Components.utils.reportError("SabnzbFox : Destination directory is not valid!");
    return false;
  }
  return file;
}

nzbCatcher._init = function () {
  this.prefs = Components.classes["@mozilla.org/preferences-service;1"].
                        getService(Components.interfaces.nsIPrefService);
  this.prefs = this.prefs.getBranch("extensions.sabnzbfox.");
  this._readPref();
  
  this.prefs.QueryInterface(Components.interfaces.nsIPrefBranch2);
  this.prefs.addObserver("", this, false);
}

nzbCatcher.observe = function(aSubject, aTopic, aData) {
  if(aTopic != "nsPref:changed") return;
  this._readPref();
}

nzbCatcher._readPref = function () {
  var enabled = this.prefs.getBoolPref("enabled");
  if (enabled) {
    if (!this._observer)
      this._observer = contentTypeObserver.addObserver(this);
  } else if (this._observer) {
    this._observer.stop();
    this._observer = null;
  }
}

var obsService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
nzbCatcher._onFileDownloaded = function (file) {
  obsService.notifyObservers(file,"sabnzb-file-downloaded",null);
}

nzbCatcher.getRequestListener = function (requestInfo) {
  // First check if this request appear to be a NZB
  var match =
    (typeof requestInfo.contentType=="string" && requestInfo.contentType.match("nzb$"))
    || 
    (typeof requestInfo.fileName=="string" && requestInfo.fileName.match("nzb$"));
  if (!match) return;
  
  var extension = "nzb";
  
  var fileName = requestInfo.fileName;
  // Ensure that our file name contains an extension
  if (fileName.indexOf(extension)!=fileName.length-3)
    fileName = fileName+"."+extension;

  // No way to get a filename, create a unique file name
  if (!fileName)
    fileName = new Date().getTime()+"."+extension;
  
  var action = this.prefs.getCharPref("action");
  
  if (action=="api" && sabnzbBridge.isEnabled()) {
    // Simple listener if we don't need to save to a file
    return {
      data : "",
      onStartRequest : function (request, context) {
      },
      onStopRequest : function (request, context, statusCode) {
        sabnzbBridge.sendToSabnzb(fileName, this.data);
        this.data=null;
        nzbCatcher._onFileDownloaded(null);
      },
      onDataAvailable : function (request, context, inputStream, offset, count) {
        var sstream = Components.classes['@mozilla.org/scriptableinputstream;1'].createInstance (Components.interfaces.nsIScriptableInputStream);
        sstream.init(inputStream);
        this.data += sstream.read(count);
      }
    };
  }
  if (action!="target") return;
  
  // Retrieve destination directory as a nsIFile
  var file = this.getDestinationDir();
  
  // No destination file -> do nothing
  if (!file) return;
  
  // Iterate to the first non-existing file name
  file.append(fileName);
  var i=1;
  while(file.exists()) {
    file = file.parent;
    file.append(fileName.replace(new RegExp("."+extension+"$"),"_"+(i++)+"."+extension));
  }
  
  return contentTypeObserver.createSaveToFileRequestListener(
          requestInfo, 
          file, 
          function () {
            if (sabnzbBridge.isEnabled()) {
              nzbCatcher._onFileDownloaded(file);
            }
          });
}



nzbCatcher._init();
