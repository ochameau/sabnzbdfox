var EXPORTED_SYMBOLS = ["sabnzbBridge"];

var sabnzbBridge = {};

sabnzbBridge.getSabnzbUrl = function () {
  if (this.prefs.getBoolPref("https")) 
    var url = "https://"
  else
    var url = "http://"
  return url+this.prefs.getCharPref("host")+":"+this.prefs.getIntPref("port")+"/";
}
sabnzbBridge.getSabnzbUrlParams = function () {
  var user = this.prefs.getCharPref("username");
  var password = this.prefs.getCharPref("password");
  var params = "&apikey="+this.prefs.getCharPref("apikey");
  if (user && user.length>0)
    params += "&ma_username="+user;
  if (password && password.length>0) 
    params += "&ma_password="+password;
  return params;
}

sabnzbBridge.sendToSabnzb = function (fileName, data) {
  var xmlhttp = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance();
  xmlhttp.QueryInterface(Components.interfaces.nsIXMLHttpRequest);
  
  var d = new Date();
  var boundary = '--------' + d.getTime();
  var body = '--' + boundary + '\n';
  body += 'Content-Disposition: form-data; name="name"; filename="' + fileName + '"\n';
  body += 'Content-Type: application/octet-stream\n\n' + data + '\n';
  body += '--' + boundary +'--\n';
  
  var url = this.getSabnzbUrl()+"api?mode=addfile&name="+fileName+this.getSabnzbUrlParams();
  xmlhttp.open('POST', url, true);
  xmlhttp.setRequestHeader('Content-Type', 'multipart/form-data; boundary=' + boundary);
  xmlhttp.setRequestHeader('Connection', 'close');
  xmlhttp.setRequestHeader('Content-Length', body.length);
  xmlhttp.send(body);
  //Components.utils.reportError("status:"+xmlhttp.status);
  //Components.utils.reportError("status:"+xmlhttp.responseText);
}

sabnzbBridge._init = function () {
  this.prefs = Components.classes["@mozilla.org/preferences-service;1"].
                        getService(Components.interfaces.nsIPrefService);
  this.prefs = this.prefs.getBranch("extensions.sabnzbfox.");
  this._readPref();
  
  this.prefs.QueryInterface(Components.interfaces.nsIPrefBranch2);
  this.prefs.addObserver("", this, false);
}

sabnzbBridge.observe = function(aSubject, aTopic, aData) {
  if(aTopic != "nsPref:changed") return;
  this._readPref();
}

function setInterval(action, delay) {
  var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator);
  var win = wm.getMostRecentWindow("navigator:browser");
  return win.setInterval(action, delay);
  /* fails on 3.6 nightlies ... only fires two time :(
  return Components.classes['@mozilla.org/timer;1']
      .createInstance(Components.interfaces.nsITimer)
      .initWithCallback({ notify: action }, delay, Components.interfaces.nsITimer.TYPE_REPEATING_PRECISE);
  */
}
 
function clearInterval(timer) {
  var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator);
  var win = wm.getMostRecentWindow("navigator:browser");
  return win.clearInterval(timer);
  //timer.cancel();
}

sabnzbBridge._readPref = function () {
  if (sabnzbBridge.isEnabled()) {
    if (!this._updateInterval) {
      this._updateInterval = setInterval(function () {
        sabnzbBridge._updateStatus();
      }, 5000);
    }
  } else if (this._updateInterval) {
    clearInterval(this._updateInterval);
    this._updateInterval = null;
  }
}

sabnzbBridge.isEnabled = function () {
  return this.prefs.getBoolPref("enabled") && this.prefs.getCharPref("apikey");
}

var obsService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
var xmlhttp = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance();
xmlhttp.QueryInterface(Components.interfaces.nsIXMLHttpRequest);
xmlhttp.QueryInterface(Components.interfaces.nsIDOMEventTarget);
xmlhttp.addEventListener("load", function(evt) {
    try {
      if (xmlhttp.status < 200 || xmlhttp.status >= 300) return;
      var json = JSON.parse(xmlhttp.responseText);
      //Components.utils.reportError(url+"\n"+xmlhttp.status+"/"+xmlhttp.statusText+"/"+xmlhttp.responseText);
      obsService.notifyObservers(null, "sabnzb-jobs-count", json&&json.jobs?json.jobs.length:0);
    } catch(e) {
      Components.utils.reportError("response:"+xmlhttp.status+" -- "+xmlhttp.responseText);
      Components.utils.reportError(e);
      obsService.notifyObservers(null, "sabnzb-jobs-count", "error");
      Components.utils.reportError(xmlhttp.status+"/"+xmlhttp.statusText+"/"+xmlhttp.responseText);
    }
  }, false);
xmlhttp.addEventListener("error", function(evt) {
    obsService.notifyObservers(null, "sabnzb-jobs-count", "?");
    Components.utils.reportError("sabnzb error : "+xmlhttp.status+"/"+xmlhttp.statusText+"/"+xmlhttp.responseText);
  }, false);

sabnzbBridge._updateStatus = function () {
  try {
    var url = this.getSabnzbUrl()+"api?mode=qstatus&output=json"+this.getSabnzbUrlParams();
    xmlhttp.open("GET", url, true);
    xmlhttp.send(null);
  } catch(e) {
    Components.utils.reportError(e);
    obsService.notifyObservers(null, "sabnzb-jobs-count", "error");
  }
}

sabnzbBridge._init();
