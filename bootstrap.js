/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

const CC = Components.classes;
const CI = Components.interfaces;
const CU = Components.utils;

CU.import("resource://gre/modules/Services.jsm");

CU.import("resource://gre/modules/XPCOMUtils.jsm");

var RequireObserver = {
  observe: function(subject, topic, data) {
    if (topic == "transliterator-require")
      subject.wrappedJSObject.exports = require(data);
  },

  QueryInterface: XPCOMUtils.generateQI([CI.nsISupportsWeakReference, CI.nsIObserver])
};


var addonData = null;

function startup(data, reason) {

  try {
    addonData = data;

    Services.obs.addObserver(RequireObserver, "transliterator-require", true);  
    
    
    var {TransliteratorService} = require("service");
    var {PrefUtils} = require("prefUtils");

    // Set up default preferences
    var defaultBranch = Services.prefs.getDefaultBranch("");
    var scope = {
      pref: function(pref, value) {
        switch (typeof value) {
          case "string":
            PrefUtils.setUnicodePref(pref, value, defaultBranch);
            break;
          case "boolean":
            defaultBranch.setBoolPref(pref, value);
            break;
          default:
            CU.reportError("Unknown value type in default preference " + pref);
            break;
        }
      }
    };
    Services.scriptloader.loadSubScript(data.resourceURI.spec + "defaults/prefs.js", scope, "utf-8");

  
    // Now the usual initialization
    TransliteratorService.init();
 
   } catch (e) {
    console.log(e.message);
    throw e;
   }
  
}

function shutdown(data, reason) {
  try {
    var {TransliteratorService} = require("service");

    TransliteratorService.cleanup();
    
    // clean up loaded js modules
    Services.obs.removeObserver(RequireObserver, "transliterator-require");  
  } catch (e) {
    console.log(e.message);
    throw e;
  }
}

function install(data, reason) {}
function uninstall(data, reason) {}

// This implements CommonJS modules: http://wiki.commonjs.org/wiki/Modules/1.1
var scopes = {};
function require(module) {
  if (!(module in scopes)) {
    var url = Services.io.newURI("lib/" + module + ".js", null, addonData.resourceURI);
    scopes[module] = new CU.Sandbox(Services.scriptSecurityManager.getSystemPrincipal(), {
      sandboxName: url.spec,
      sandboxPrototype: {
        CC: CC,
        CI: CI,
        CU: CU,
        require: require,
        exports: {},
        console: console
      },
      wantXrays: false
    });

    try {
      Services.scriptloader.loadSubScript(url.spec, scopes[module], "utf-8");

    } catch (e) {
      console.log(module + ": " + e.message);
      throw(e);
    }
  }

  return scopes[module].exports;
}


var console = null;


(function() {

  prefBranch =  Services.prefs.getBranch("extensions.transliterator.");
  var  DEBUG = false;
  try {
        DEBUG= prefBranch.getBoolPref("console.debug");
  } catch (e) {}


  console = {
    log: function(message) {
      if (message && (typeof(message) == "object") ) 
        message = JSON.stringify(message);
      else if (typeof(message) != "undefined" && message != null && message.toString) {
        message = message.toString();
      }
      Services.console.logStringMessage("Transliterator: " + message);
    },
    info: function(message) {
      this.log(message);
    },
    debug: function(message) {
      if (DEBUG)
        this.log(message);
    }

  };

})();



//TODO richedit documentelement in iframe in gecko 1.9 accessible via commandDispatcher.focusedElement : see if that helps clean up getActiveNode
//TODO - cleanup getActiveNode, isEditor, isContentEditable, etc - htmlhtmlelement vs htmlbodyelement, etc. support new input types.

//TODO context-sensitive mapping: a-> [x, y, z] depending on position in a word : [beginning, middle, end]
//TODO track word position : decide if default is middle unless followed by non-con or default is end until followed by con


//TODO revise chunks, etc in converter & processChar - store objects with in/out strings, drop them into state obj --- DONE? also do something about backspaces in mappings, e.g. hindi
//TODO store past 2 chunks in state as {in, out}, use for lookbehind -- DONE?

//TODO add menu items to popup with class=textbox-contextmenu (overkill?)
//TODO add something to the popup menu in instantbird (maybe textbox-contextmenu will give it to me for free)

//TODO thunderbird search input can't do border (the parent hbox can) but can do outline - 
//     find out when outline is more appropriate than border, maybe a way to choose based on gecko version and type of control (input/document/contenteditable chunk)

