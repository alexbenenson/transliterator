/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

CU.import("resource://gre/modules/XPCOMUtils.jsm");
CU.import("resource://gre/modules/Services.jsm");

var uuidGenerator = CC["@mozilla.org/uuid-generator;1"].getService(Components.interfaces.nsIUUIDGenerator);

var {Converter, ConverterLazyWrapper} = require("converter");
var {TransliteratorWindowDelegate} = require("delegate");
var {EndPoint} = require("endPoint");
var {PrefObserver} = require("prefObserver");
var {TransliteratorLayoutLoader} = require("layoutLoader");
var {PrefUtils} = require("prefUtils");
var {Constants} = require("constants");

var TransliteratorService = exports.TransliteratorService = {
  //method of nsISupports interface
  QueryInterface: XPCOMUtils.generateQI([CI.nsIObserver, CI.nsISupportsWeakReference]),


  getUniqueID: function() {
    return uuidGenerator.generateUUID().toString();
  },

  init: function(bootstrapData) {
	 
    this.bootstrapData = bootstrapData;
	
    //init variables
    this.delegates = []; // list of adapters
    this.prefsConverted = false;


    // attach to preferences
    this.prefBranch =  Services.prefs.getBranch("extensions.transliterator.");

    //install pref observer
    this.prefObserver = new PrefObserver(this.prefBranch, this);

    // etc
    //this.initEndPoints();

    // Attach to any windows already open
    let enumerator = Services.ww.getWindowEnumerator();
    while (enumerator.hasMoreElements())
      this.attachToWindow(enumerator.getNext());

    // register observers
    Services.obs.addObserver(this, "domwindowopened", true);
    Services.obs.addObserver(this, "domwindowclosed", true);
  },


  cleanup: function() {
    // unregister observers
    Services.obs.removeObserver(this, "domwindowopened");
    Services.obs.removeObserver(this, "domwindowclosed");

    //detach from prefs
    if (this.prefObserver)
      this.prefObserver.unregister();

    // detach from windows
    for (var i = 0; i < this.delegates.length; i++)
      this.delegates[i].detach();
    // etc
  },


  log: function(value) {
    Services.console.logStringMessage("Transliterator: " + value);
    //Services.console.logStringMessage("Transliterator: " + value);
  },

  // nsIObserver implementation
  observe: function(aSubject, aTopic, aData) {
    if (aTopic == "domwindowopened") {
      this.attachToWindow(aSubject);
    }
    else if (aTopic == "domwindowclosed") {
      this.detachFromWindow(aSubject);
    }
  },

  attachToWindow: function(wnd) {
    this.delegates.push(new TransliteratorWindowDelegate(this, wnd));
  },

  detachFromWindow: function(wnd) {
    var delegate = wnd.transliterator;
    var i = this.delegates.indexOf(delegate);
    if (i >= 0)
      this.delegates.splice(i, 1);

  },

  // call this when menus or shortcuts change
  updateEndPoints: function() {
	  
    this._options = null;
	  
    // nothing to update yet
    if (!this._endPoints || this._endPoints.length == 0)
      return;

    //this.initEndPoints();
    this._endPoints = null; // cleared endpoints

    // save a copy of the list before calling reconfigure to avoid concurrent mod
    var delegatesToReconfigure = [];
    for (var i = 0; i < this.delegates.length; i++)
      delegatesToReconfigure.push(this.delegates[i]);

    for (var i = 0; i < delegatesToReconfigure.length; i++)
      delegatesToReconfigure[i].reconfigure();

  },

  getPreferredLayout: function() {
    var layout = PrefUtils.getCharPref("layout", this.prefBranch);
    if (layout == "")
      layout = null;
    return layout;
  },

  // return {key, modifiers}
  parseKeyString: function(keyString) {
    keyString = keyString.toLowerCase();

    var parts = keyString.split(/\s+/);
    var key = parts.pop();
    var modifiers = parts;

    // Validate key
    if (!key || (key.length > 1 && !/^vk_/.test(key)))
      return null;
    if (key.length == 4)  // vk_a and such
      key = key.substr(3);

    // Replace ctrl modifier by control
    var i = modifiers.indexOf("ctrl");
    if (i >= 0)
      modifiers[i] = "control";

    // Validate modifiers
    modifiers = modifiers.filter(function(mod) {
      return ["accel", "alt", "control", "meta", "shift"].indexOf(mod) >= 0;
    });

    return {key: key, modifiers: modifiers.join(", ")};
  },

  createConverter: function(layoutName, reversed) {
	  
  	return new ConverterLazyWrapper(function() {
  		// create converter on demand
  		var layout = TransliteratorLayoutLoader.loadLayout(layoutName);
  		return new Converter(layout.layout, layout.caseSensitive, reversed);
  		
  	})
  },

  /** this now serves as initConfig - initializes endpoints and other options */
  initEndPoints: function() {

    //instead of one converter for all, place converter selection into commands

    var converter = this.createConverter(this.getPreferredLayout() || "default", false)
    var reverseConv = this.createConverter(this.getPreferredLayout() || "default", true);

    var endPoints = [
      {cmd: "fromtranslit", type: EndPoint.BATCH, conv: converter},
      {cmd: "totranslit", type: EndPoint.BATCH, conv: reverseConv},
      {cmd: "togglemode", type: EndPoint.MAP, conv: converter},
      {cmd: "togglemodeall", type: EndPoint.MAP_ALL, conv: converter}
    ];

    this._endPoints = [];
    var stringBundle = Services.strings.createBundle("chrome://transliterator/locale/prefs.properties");

   
    for (var i = 0; i < endPoints.length; i++) {

      var label = PrefUtils.getUnicodePref("commands." + endPoints[i].cmd + ".label", this.prefBranch) || stringBundle.GetStringFromName(endPoints[i].cmd + ".label");
      var shortcut = this.parseKeyString(PrefUtils.getCharPref("commands." + endPoints[i].cmd + ".shortcut", this.prefBranch));
      if (!shortcut)
        shortcut = {key: "", modifiers: ""};

      this._endPoints.push(
        new EndPoint("cmd_" + endPoints[i].cmd, label, shortcut.key, shortcut.modifiers, endPoints[i].type, endPoints[i].conv)
      );
    }

    /*
    this._endPoints = [
      //EndPoint(commandKey, menuLabel, keycode, modifiers, actionType, converter )
      new EndPoint("cmd_transliterator_toggle", "Cyrillic Mode", "VK_F2", "", EndPoint.MAP, converter),
      new EndPoint("cmd_transliterator_fwd", "To Cyrillic", "VK_Q", "control shift", EndPoint.BATCH, converter),
      new EndPoint("cmd_transliterator_back", "To Translit", "VK_Q", "control alt shift", EndPoint.BATCH, reverseConv),
    ];
    */

    // get other options
    this._options = {}; 
    this._options[Constants.OVERRIDE_SHORTCUTS] = PrefUtils.getBoolPref(Constants.OVERRIDE_SHORTCUTS, this.prefBranch);
    this._options[Constants.BORDER_COLOR] = PrefUtils.getCharPref(Constants.BORDER_COLOR, this.prefBranch) || "#3399FF";
    this._options[Constants.BORDER_STYLE] = PrefUtils.getCharPref(Constants.BORDER_STYLE, this.prefBranch) || "dotted";
    this._options[Constants.BORDER_WIDTH] = PrefUtils.getCharPref(Constants.BORDER_WIDTH, this.prefBranch) || "2px";
    
    console.debug(this._options);
  },
  
  /*
   * misc options, such as 
   * overrideShortcuts: true/false
   */
  getOptions: function() {
	
    if (!this._options)
	   this.initEndPoints();
    
    
    return this._options;
		  
  },

  // return array of entry points
  getEndPoints: function() {

    if (!this._endPoints)
      this.initEndPoints();

    return this._endPoints;
  }

};
