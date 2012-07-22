Components.utils.import("resource://sabnzbdfox/nzbCatcher.js"); 
Components.utils.import("resource://sabnzbdfox/sabnzbBridge.js"); 


var sabnzbfox = {};

sabnzbfox.onLoad = function () {
  this.statusBarLabel = document.getElementById("sabnzbfox-status-label");
  this.prefs = Components.classes["@mozilla.org/preferences-service;1"].
                        getService(Components.interfaces.nsIPrefService);
  this.prefs = this.prefs.getBranch("extensions.sabnzbfox.");
  this.readPref();
  
  this.prefs.QueryInterface(Components.interfaces.nsIPrefBranch2);
  this.prefs.addObserver("", this, false);
  
  this.obsService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
  this.obsService.addObserver(this, "sabnzb-file-downloaded", false);
  this.obsService.addObserver(this, "sabnzb-jobs-count", false);
}

sabnzbfox.onUnload = function () {
  this.prefs.removeObserver("", this);
  this.obsService.removeObserver(this, "sabnzb-file-downloaded");
  this.obsService.removeObserver(this, "sabnzb-jobs-count");
}

sabnzbfox.observe = function(aSubject, aTopic, aData) {
  if(aTopic == "nsPref:changed") {
    this.readPref();
  } else if (aTopic == "sabnzb-file-downloaded") {
    // aSubject = nsIFile or null
    this.blink();
  } else if (aTopic == "sabnzb-jobs-count") {
    if (aData==="0" || aData===0) {
      this.statusBarLabel.hidden=true;
      this.statusBarLabel.value = "";
    } else {
      this.statusBarLabel.hidden=false;
      this.statusBarLabel.value = aData;
    }
  }
}

sabnzbfox.readPref = function () {
  var enabled = this.prefs.getBoolPref("enabled");
  document.getElementById("sabnzbfox-status").setAttribute("off",enabled?"false":"true");
  document.getElementById("sabnzbfox-toggle").setAttribute("checked",enabled?"true":"false");
  document.getElementById("sabnzb-viewtarget").hidden=!this.prefs.getCharPref("target");
  if (!enabled)
    this.statusBarLabel.value = "";
}

sabnzbfox.toggle = function () {
  this.prefs.setBoolPref("enabled",!this.prefs.getBoolPref("enabled"));
}

sabnzbfox.selectTarget = function () {
  var nsIFilePicker = Components.interfaces.nsIFilePicker;
  var fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
  try {
    var file = Components.classes["@mozilla.org/file/local;1"].
                       createInstance(Components.interfaces.nsILocalFile);
    file.initWithPath(this.prefs.getCharPref("target"));
    if (file.exists())
      fp.displayDirectory=file;
  } catch(e){}
  
  fp.init(window, "Select a NZB destination directory", nsIFilePicker.modeGetFolder);
  var res = fp.show();
  if (res == nsIFilePicker.returnOK) {
    this.prefs.setCharPref("target",fp.file.path);
  }
}

sabnzbfox.viewTarget = function () {
  var dir = nzbCatcher.getDestinationDir();
  if (!dir) return;
  dir.reveal();
}

sabnzbfox.viewSabnzb = function () {
  gBrowser.selectedTab = gBrowser.addTab(sabnzbBridge.getSabnzbUrl()+"queue/");
}

sabnzbfox.blink = function () {
  var status = document.getElementById("sabnzbfox-status");
  var startR = 235;
  var startG = 232;
  var startB = 215;
  var diff = 0;
  var direction = 1;
  status.style.MozAppearance = "none";
  status.style.color = "white";
  function flash() {
    diff += direction*5;
    var r = Math.max(0,Math.min(startR-diff,255));
    var g = Math.max(0,Math.min(startG+diff,255));
    var b = Math.max(0,Math.min(startB-diff,255));
    if (b<=0 && r<=0 && g>=255 && direction==1) {
      direction=-1;
      flash();
      return;
    }
    if (b<=startB && g<=startG && r<=startR && direction==-1) {
      status.style.MozAppearance = "";
      status.style.backgroundColor = "";
      status.style.color = "";
      return;
    }
    status.style.backgroundColor="rgb("+(r)+","+(g)+","+(b)+")";
    //dump("rgb("+(r)+","+(g)+","+(b)+")\n");
    window.setTimeout(flash,20);
  }
  flash();
}

window.addEventListener("load",function () {sabnzbfox.onLoad();},false);
window.addEventListener("unload",function () {sabnzbfox.onUnload();},false);
