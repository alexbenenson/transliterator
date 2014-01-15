/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

const CC = Components.classes;
const CI = Components.interfaces;
const CU = Components.utils;

CU.import("resource://gre/modules/XPCOMUtils.jsm");
CU.import("resource://gre/modules/Services.jsm");

function startup(data, reason) {
  // Set up default preferences
  var defaultBranch = Services.prefs.getDefaultBranch("");
  var scope = {
    pref: function(pref, value) {
      switch (typeof value) {
        case "string":
          TransliteratorService.setUnicodePref(pref, value, defaultBranch);
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
  Services.scriptloader.loadSubScript(data.resourceURI.spec + "defaults/preferences/transliterator.js", scope, "utf-8");

  // Now the usual initialization
  TransliteratorService.init();
}

function shutdown(data, reason) {
  TransliteratorService.cleanup();
}

function install(data, reason) {}
function uninstall(data, reason) {}

var TransliteratorService = {
  //method of nsISupports interface
  QueryInterface: XPCOMUtils.generateQI([CI.nsIObserver, CI.nsISupportsWeakReference]),

  init: function() {
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

  setUnicodePref: function (prefName,prefValue,prefBranch) {
    if (!prefBranch)
      prefBranch = this.prefBranch;

    var sString = CC["@mozilla.org/supports-string;1"].createInstance(CI.nsISupportsString);
    sString.data = prefValue;
    prefBranch.setComplexValue(prefName, CI.nsISupportsString, sString);
  },

  getUnicodePref: function (prefName, prefBranch) {
    if (!prefBranch)
      prefBranch = this.prefBranch;
    try {
      return prefBranch.getComplexValue(prefName, CI.nsISupportsString).data;
    } catch (e) {
      return prefBranch.getCharPref(prefName);
    }
  },

  getCharPref: function(prefName, prefBranch) {
    if (!prefBranch)
      prefBranch = this.prefBranch;
    return prefBranch.getCharPref(prefName);
  },

  getBoolPref: function(prefName, prefBranch) {
    if (!prefBranch)
        prefBranch = this.prefBranch;

    try {
        return prefBranch.getBoolPref(prefName);
    } catch (e) {
        //silence the exception
       return false;
    }
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

  debug: function(value) {
    dump(value + "\n");
  },

  log: function(value) {
    this.debug(value);
    Services.console.logStringMessage("Transliterator: " + value);
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
      var i = -1;
      if (this.delegates.indexOf)
         i = this.delegates.indexOf(delegate);
      else {
         // for old gecko
         for (var j = 0; j < this.delegates.length; j++)
            if (this.delegates[i] == delegate) {
                i = j;
                break;
            }
      }
      if (i >= 0)
        this.delegates.splice(i, 1);

      //TODO: need delegate.detach() here?
  },

  // call this when menus or shortcuts change
  updateEndPoints: function() {
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
    var layout = this.getUnicodePref("layout");
    if (layout == "")
        layout = null;
    return layout;
  },

  // return {key, modifiers}
  parseKeyString: function(keyString) {
    keyString = keyString.toLowerCase();

    var found = keyString.match(/(vk_[A-Z0-9]+)/i);
    if (!found)
        return null;
    var keyCode = found[0];
    var mods = "";


    keyString = keyString.replace(/ctrl/i, "control");
    var stdmods = new Array("accel", "alt", "control", "meta", "shift");
    for (var i = 0; i < stdmods.length; i++) {
        if (keyString.indexOf(stdmods[i]) >= 0)
            mods += (mods == "" ? "" : ", ") + stdmods[i];
    }

    return {key: keyCode.toUpperCase(), modifiers: mods};
  },

  createConverter: function(layoutName, reversed) {
    var layout = this.getUnicodePref("layouts." + layoutName);

    var caseSensitive = this.getBoolPref("layouts." + layoutName + ".case_sensitive");

    var jsonAvailable = false;
    try {
            if (JSON) {
                this.log("will use JSON.parse()");
                jsonAvailable = true;
            }
    }
    catch (error) {}

    var convTable = jsonAvailable ? JSON.parse(layout) : eval(layout);

    return new Converter(convTable, caseSensitive, reversed);

  },

  initEndPoints: function() {
    if (!this.prefsConverted) {
       this.prefsConverted = true;
       this.convertPreferences();
    }

    //instead of one converter for all, place converter selection into commands

    var converter = this.createConverter(this.getPreferredLayout() || "default", false)
    var reverseConv = this.createConverter(this.getPreferredLayout() || "default", true);

    var endPoints = [
        {cmd: "fromtranslit", type: EndPoint.BATCH, conv: converter},
        {cmd: "totranslit", type: EndPoint.BATCH, conv: reverseConv},
        {cmd: "togglemode", type: EndPoint.MAP, conv: converter}
    ];

    this._endPoints = [];
    for (var i = 0; i < endPoints.length; i++) {
        var label = this.getUnicodePref("commands." + endPoints[i].cmd + ".label");
        var shortcut = this.parseKeyString(this.getCharPref("commands." + endPoints[i].cmd + ".shortcut"));
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

  },

  // return array of entry points
  getEndPoints: function() {

      if (!this._endPoints)
        this.initEndPoints();

      return this._endPoints;
  },

  convertPreferences: function() {
     //convert prefs from extensions.tocyrillic to extensions.transliterator
     var converted = this.getBoolPref("prefs_converted");
     if (converted)
        return;

     var oldPrefBranch = Services.prefs.getBranch("extensions.tocyrillic.");
     var childCount = new Object();
     var list = oldPrefBranch.getChildList("", childCount);

     for (var i = 0; i < childCount.value; i++)
        if (oldPrefBranch.prefHasUserValue(list[i])) {

            if (list[i] == "layout")
                this.prefBranch.setCharPref("layout", oldPrefBranch.getCharPref(list[i]));

            else if (list[i].indexOf("labels") == 0) {
                var cmdcode = list[i].substring(7);
                this.setUnicodePref("commands." + cmdcode + ".label", this.getUnicodePref(list[i], oldPrefBranch));
            }

            else if (list[i].indexOf("shortcuts") == 0) {
                var cmdcode = list[i].substring(7);
                this.prefBranch.setCharPref("commands." + cmdcode + ".label", oldPrefBranch.getCharPref(list[i]));
            }

            else {
                // copy layouts
                this.setUnicodePref(list[i], this.getUnicodePref(list[i], oldPrefBranch));
            }

        }

     this.prefBranch.setBoolPref("prefs_converted", true);
  }
};

function PrefObserver(prefBranch, translitService) {
    this.service = translitService;
    this.prefBranch = prefBranch;
    this.pref = prefBranch.QueryInterface(CI.nsIPrefBranchInternal);
    this.pref.addObserver("", this, false);

    //this.service.updateEndPoints();
}

PrefObserver.prototype = {
    unregister: function() {
        if (this.pref)
            this.pref.removeObserver("", this);
    },

    observe: function(aSubject, aTopic, aData) {
        if(aTopic != "nsPref:changed") return;

        //this.service.log(aTopic + " -- " + aData);

        //react to preference changes


        // if current layout is switched, reload
        if (aData == "layout")
            this.service.updateEndPoints();

        // if command labels or shortcuts are changed, reload
        if (aData.search("commands") == 0)
            this.service.updateEndPoints();

        // if current layout is changed, reload
        if (aData.search("layouts.") == 0)
            if (aData.search("layouts." + this.service.getPreferredLayout()) == 0) {
                this.service.updateEndPoints();
            }



    }
}

// commandKey : the key of the command to pass back to the service
// type is one of : none, batch, map
// label is menu label. no label = no menu
// keycode + modifiers is the shortcut key code. no keycode = no shortcut
// converter
function EndPoint(commandKey, menuLabel, keycode, modifiers, actionType, converter ) {
    this.menuLabel = menuLabel;
    this.keyCode = keycode;
    this.modifiers = modifiers;
    this.actionType = actionType;
    this.commandKey = commandKey;
    this.converter = converter;
}

EndPoint.MAP = "map";
EndPoint.BATCH = "batch";
EndPoint.NONE = "none";

function TransliteratorWindowDelegate(service, wnd) {
    this._service = service;
    this._window  = wnd;

    this._createdElements = new Array();
    this._createdListeners = new Array(); // [{element, eventType, listener, capture}]

    this._endPoints = [];
    this.endPointMap = {};
    this.mappingStates = new Array();

    // creating and destroying keys does not work. will have to reuse...
    this.keys = [];
    this.keyset = null;

    this.attach = this.attach.bind(this);
    this.detach = this.detach.bind(this);
    this.detachFromDocument = this.detachFromDocument.bind(this);

    this.init();
}

TransliteratorWindowDelegate.prototype = {

    init: function() {
      var selfRef = this;
      this.reconfTimeout = 0;


      this.executeReconfigureImpl = function() {
        selfRef.reconfigureImpl();
      };

      if (this._window.document.readyState == "complete")
        this.attach();
      else
        this._window.addEventListener("load", this.attach, false);
    },

    getEndPoint: function(cmd) {
        return this.endPointMap[cmd];
    },

    getService: function() {
        return this._service;
    },
    getWindow: function() {
        return this._window;
    },

    getEndPoints : function() {
        return this._endPoints;
    },


    addMappingState: function(state) {
        this.mappingStates.push(state);
    },

    getMappingState: function(node) {
        for (var i = 0; i < this.mappingStates.length; i++) {
            if (this.mappingStates[i].node == node)
                return this.mappingStates[i];
        }
        return null;
    },

    removeMappingState: function(node) {
        for (var i = 0; i < this.mappingStates.length; i++) {
            if (this.mappingStates[i].node == node) {
                var state = this.mappingStates[i];
                this.mappingStates.splice(i, 1);
                return state;
            }
        }
        return null;
    },

    setupEndPoints: function() {
        this._endPoints = this.getService().getEndPoints();
        this.endPointMap = new Object();
        for (var i = 0; i < this.getEndPoints().length; i++)
          this.endPointMap[this.getEndPoints()[i].commandKey] = this.getEndPoints()[i];

    },

    reconfigure: function() {
        // called when preferences changed
        if (this.reconfTimeout)
            this.getWindow().clearTimeout(this.reconfTimeout);
        this.reconfTimeout = this.getWindow().setTimeout(this.executeReconfigureImpl, 100);
    },

    reconfigureImpl: function() {
        this.detach();
        this.attach();
        this.reconfTimeout = 0;
    },

    attach: function() {
      this._window.transliterator = this;

      // Window already loaded, remove listener
      this._window.removeEventListener("load", this.attach, false);

      // Add event listeners
      this._window.addEventListener("unload", this.detach, false);
      this._window.addEventListener("unload", this.detachFromDocument, true);
      if (this._window.gBrowser) {
        // Try to get notified when content documents unload (doesn't work reliably)
        this._window.gBrowser.addEventListener("unload", this.detachFromDocument, true);
      }

      // get end points from the service
      this.setupEndPoints();


      // create commands
      this.addCommands();

      // create shortcuts
      // do it before menu items so menus can have linked shortcuts
      this.addShortcuts();

      // create menuitems &  attach popup listeners to appropriate menus
      this.addMenus();


      // add options menuitem
      this.addOptionsMenu();

      // create status bar notifier?
    },

    detach: function() {
      delete this._window.transliterator;

      this._window.removeEventListener("unload", this.detach, false);
      this._window.removeEventListener("unload", this.detachFromDocument, true);
      if (this._window.gBrowser)
        this._window.gBrowser.removeEventListener("unload", this.detachFromDocument, true);

      this.removeDynamicNodes();
      this.removeMappingStates(null);
    },

    detachFromDocument: function(event) {
      var doc = event.originalTarget;
      if (doc.ownerDocument)
        doc = doc.ownerDocument;
      if (doc instanceof CI.nsIDOMDocument)
        this.removeMappingStates(doc);
    },

    removeMappingStates: function (doc) {
        // if doc, remove from only those nodes that have doc as ownerdocument
        if (doc && !doc.documentElement && doc.wrappedJSObject && doc.wrappedJSObject.documentElement)
            doc = doc.wrappedJSObject;

        for (var i = 0; i < this.mappingStates.length; i++) {
            var state = this.mappingStates[i];

            if (!doc || (doc && state.node.ownerDocument == doc)) {
                state.clear();
                this.mappingStates.splice(i, 1);
            }
        }

        /*
        for (var node in this.mappingStates) {
            if (!doc || (doc && node.ownerDocument == doc)) {
                this.mappingStates[node].clear();
                delete this.mappingStates[node];
            }
        }
        */
    },

    removeDynamicNodes: function() {
      for (var i = this._createdElements.length - 1; i >= 0; i--) {
        var element = this._createdElements[i];
        var p = element.parentNode;
        if (p)
          p.removeChild(element);
      }
      this._createdElements = [];

      for (var i = 0; i < this._createdListeners.length; i++) {
        var l = this._createdListeners[i];
        l.element.removeEventListener(l.eventType, l.listener, l.capture);
      }
      this._createdListeners = [];
    },

    addNode: function(node) {
      this._createdElements.push(node);
    },

    addListener: function (element, eventType, listener, capture) {
        element.addEventListener(eventType, listener, capture);
        this._createdListeners.push({element: element, eventType : eventType, listener: listener, capture: capture});
    },

    addCommand: function(id, label, command, commandset) {
      var doc = this.getWindow().document;

      var cmd = doc.createElement("command");
      this.addNode(cmd);
      commandset.appendChild(cmd);
      cmd.id=id;
      cmd.setAttribute("oncommand",  command);
      cmd.setAttribute("label",  label);
    },

    addCommands: function() {
      //this.getService().debug(this.getWindow());
      var doc = this.getWindow().document;
      // find window to insert to
      var element = doc.firstChild;
      while (element && element.tagName != "window" && element.tagName != "dialog")
        element = element.nextSibling;
      if (!element)
        return;

      var cmdSet = doc.createElement("commandset");
      this.addNode(cmdSet);
      element.appendChild(cmdSet);
      //doc.firstChild.appendChild(cmdSet);
      cmdSet.id="transliterator_commandset"

        var endPoints = this.getEndPoints();

        for (var i = 0; i < endPoints.length; i++ )
            this.addCommand(endPoints[i].commandKey, endPoints[i].menuLabel, "transliterator.processCommand('" + endPoints[i].commandKey + "');", cmdSet);
    },

    addShortcuts: function() {

        var win = this.getWindow();
        var doc = win.document;

        // get or create keyset
        if (!this.keyset) {
          this.keyset = doc.createElement("keyset");
          doc.documentElement.appendChild(this.keyset);
          this.addNode(this.keyset);
        }

        var endPoints = this.getEndPoints();


        // create keys
        var keyCounter = 0;
        for (var i = 0; i < endPoints.length; i++) {
            var endPoint = endPoints[i];
            if (endPoint.keyCode && endPoint.keyCode != "") {
                var key;

                if (this.keys.length > keyCounter)
                    key = this.keys[keyCounter];
                else {
                    var key = doc.createElement("key");
                    this.keyset.appendChild(key);
                    this.keys.push(key);
                }
                key.setAttribute("id", "key_" + endPoint.commandKey);

                if (endPoint.keyCode.length == 4)
                    key.setAttribute("key", endPoint.keyCode.substr(3).toLowerCase());
                else {
                    key.setAttribute("keycode", endPoint.keyCode.toLocaleUpperCase());
                }
                //key.setAttribute("keycode", endPoint.keyCode);

                if (endPoint.modifiers)
                    key.setAttribute("modifiers", endPoint.modifiers);
                key.setAttribute("command", endPoint.commandKey);

                //this.addNode(key);
                keyCounter++;
           }
        }

        for (var i = keyCounter; i < this.keys.length; i++) {
            var key = this.keys[i];
            key.removeAttribute("id");
            key.removeAttribute("modifiers");
            key.removeAttribute("key");
            key.removeAttribute("keyCode");
            key.removeAttribute("command");
        }

    },

    addOptionsMenu: function() {
        var win = this.getWindow();
        var doc = win.document;
        // searching for //menuseparator, but using //* to avoid having to deal with namespace resolvers
        //var items = doc.evaluate('//*[translate(@command, "ABCDEFGHIJKLMNOPQRSTUVWXYZ-_", "abcdefghijklmnopqrstuvwxyz")="cmdcopy" or (translate(@command, "ABCDEFGHIJKLMNOPQRSTUVWXYZ-_", "abcdefghijklmnopqrstuvwxyz")="cmdeditcopy")]', doc, null, win.XPathResult.ANY_TYPE, null );
        var sep = doc.getElementById("devToolsSeparator");
        var parent = null;
        if (sep)
            parent = sep.parentNode;
        else {
            var popup = doc.getElementById("taskPopup");
            if (!popup)
                popup = doc.getElementById("toolsMenuPopup");
            if (popup) {
                var items = popup.getElementsByTagName("menuitem");
                if (items.length > 0)
                    parent = items[0].parentNode;
            }
        }
        if (!parent)
            return; // sorry, no options menu

        var mi = doc.createElement("menuitem");
        this.addNode(mi);
        mi.setAttribute("label", "Transliterator Options");
        mi.setAttribute("oncommand", "transliterator.processCommand('transliterator_options');");

        parent.appendChild(mi);

    },

    addMenus: function() {


        var win = this.getWindow();
        var doc = win.document;
        var markers = new Array();
    // searching for //menuitem, but using //* to avoid having to deal with namespace resolvers
        // or (translate(@command, "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz")="cmd_editcopy")
        if (doc.evaluate) {

      var items = doc.evaluate('//xul:menuitem[translate(@command, "ABCDEFGHIJKLMNOPQRSTUVWXYZ-_", "abcdefghijklmnopqrstuvwxyz")="cmdcopy" ' +
                           'or translate(@command, "ABCDEFGHIJKLMNOPQRSTUVWXYZ-_", "abcdefghijklmnopqrstuvwxyz")="cmdeditcopy"]',
              doc, function(prefix) {
              var ns = {
                  "xbl" : "http://www.mozilla.org/xbl",
                  "xul" : "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul"
              }
              return ns[prefix];
            }, win.XPathResult.ANY_TYPE, null );

      /*
        function(prefix) {
          var ns = {
              "xbl" : "http://www.mozilla.org/xbl",
              "xul" : "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul"
          }
          return ns[prefix];
        }
       */

      // get all results into an array so that dom mods don't affect the iterator
      var item = items.iterateNext();
      while (item) {
        this.getService().debug("item: " + item.nodeName);
        if (item.tagName == "menuitem")
          markers.push(item);
          item = items.iterateNext();
      }
        }

        if (markers.length == 0) {
            var itemset = {};

            // no xpath or no cmdeditcopy
            var item = doc.getElementById("menu_selectAll");
            if (item && item.tagName == "menuitem")
                itemset[item] = item;

            // songbird
            item = doc.getElementById("menuitem_edit_selall");
            if (item && item.tagName == "menuitem")
               itemset[item] = item;

            var items = doc.getElementsByAttribute("cmd", "cmd_selectAll");
            for (var i = 0; i < items.length; i++)
                if (items[i].tagName == "menuitem")
                    itemset[items[i]] = items[i];

            for (item in itemset)
                markers.push(itemset[item]);

        }
        /*
         // failed attempt to get xbl anonymous nodes
        {
          var items = doc.getAnonymousNodes(doc.documentElement);
            if (items)
              for (var i = 0; i < items.length; i++) {
                var item = doc.getElementByAttribute(items[i], "cmd", "cmd_copy");
                if (item) {
                  this.getService().debug("item: " + item.nodeName);
                  if (item.tagName == "menuitem")
                    markers.push(items[i]);
                }
              }

        }
        */

        var this_ = this;

        // add menu items
    for (var i = 0; i < markers.length; i++) {
      var marker = markers[i];

            // find the popup or menupopup (most likely an ancestor of marker)
            var popup = marker;
        var itemParent = marker.parentNode;
        while (popup && popup.tagName != "popup" && popup.tagName != "menupopup" ) {
        popup = popup.parentNode;
        }


            //add separator & menu items
        var sep = doc.createElement("menuseparator");
        this.addNode(sep);
        itemParent.appendChild(sep);
            sep.setAttribute("id", "sep-transliterator");
            sep.setAttribute("hidden", true);

            var endPoints = this.getEndPoints();
            for (var j = 0; j < endPoints.length; j++) {
                var mi = doc.createElement("menuitem");
                this.addNode(mi);
                mi.setAttribute("command", endPoints[j].commandKey);
                mi.setAttribute("key", "key_" + endPoints[j].commandKey);
                mi.setAttribute("id", "menu_" + endPoints[j].commandKey + "_" + i);
                mi.setAttribute("hidden", true);

                if (endPoints[j].actionType == EndPoint.MAP)
          mi.setAttribute("type", "checkbox");

                itemParent.appendChild(mi);
            }

            //var allItems = otherItems.concat(batchItems, toggleItems);

            var popupHandler = function(event) {
                var target = event.target;
                //this_.getService().debug(event.target.tagName);

                // show & hide items, count visible. show or hide separator if visiblecount > 0

                var visibleMenuItems = 0;
                var node = this_.getActiveNode();
                var isSelectionEmpty = this_.isSelectionEmpty(this_.getSelection());


                // find separators
                var separator = null;
                var separators = target.getElementsByTagName("menuseparator");
                for (var k = 0; k < separators.length; k++)
                    if (separators.item(k).getAttribute("id") == "sep-transliterator") {
                        separator = separators.item(k);
                        break;
                    }


                // find menu items - no more than one for each entry point
                // map key->item
                var theItems = {};
                var menuItems = target.getElementsByTagName("menuitem");
                for (var k = 0; k < menuItems.length; k++) {
                    var cmd = menuItems.item(k).getAttribute("command");
                    if (cmd && this_.getEndPoint(cmd))
                        theItems[cmd] = menuItems.item(k);
                }

                // for all found menu items, apply visibility logic
                for (var cmd in theItems) {
                    var menuItem = theItems[cmd];
                    var endPoint = this_.getEndPoint(cmd);
                    if (endPoint.actionType == EndPoint.MAP) {
                        menuItem.setAttribute("hidden", !node);
                        if (node) {
                          visibleMenuItems ++;
                            var state = this_.getMappingState(node);
                            var toggled = (state && state.key == cmd);
                          //var toggled = (this_.mappingStates[node] && this_.mappingStates[node].key == cmd);
                          menuItem.setAttribute("checked", toggled);
                        }
                    }
                    else if (endPoint.actionType == EndPoint.BATCH) {
                      if (node || !isSelectionEmpty)
                          visibleMenuItems ++;

                      menuItem.setAttribute("hidden", !node && isSelectionEmpty);
                    }
                    else {
                        menuItem.setAttribute("hidden", false);
                        visibleMenuItems ++;
                    }
                }
                if (separator)
                    separator.setAttribute("hidden", visibleMenuItems == 0);

            }

            this.addListener(popup, "popupshowing", popupHandler, false);

    }
    },



    processCommand: function(command) {

        if (command == "transliterator_options") {
            this.showOptionsDialog();
        }
        else {
            var endPoint = this.getEndPoint(command);
            if (!endPoint)
                return;

            if (endPoint.actionType == EndPoint.BATCH)
                this.batchConvert(endPoint.converter);
            else if (endPoint.actionType == EndPoint.MAP)
                this.toggleKeyMapper(endPoint);

        }
    },

    showOptionsDialog: function() {
        //this.getService().log("Requested options dialog");

        //this.getWindow().alert("Requested options dialog")
        this.getWindow().openDialog("chrome://transliterator/content/prefs.xul", "dlg", "chrome,dialog,centerscreen,resizeable=no");
    },

    batchConvert: function(converter) {
    var node = this.getActiveNode();
    if (node != null || !this.isSelectionEmpty(this.getSelection(null))) {
      if (node == null || this.isNodeEditor(node)) {
          this.convertSelection(this.getSelection(node), converter);
      }
      else {
          var str = node.value.substring(node.selectionStart, node.selectionEnd);
          str = converter.convertSkipMarkup(str);
          this.replaceValue(node, str);
      }

    }

    },

    toggleKeyMapper: function(endPoint) {
        var node = this.getActiveNode();
        if (!node)
            return;

        //var state = this.mappingStates[node];
        var state = this.getMappingState(node);


        if (state && state.key == endPoint.commandKey) {
            // toggle off
            state.clear();
            this.removeMappingState(node);
            //delete this.mappingStates[node];
        }
        else if (state && state.key != endPoint.commandKey) {
            // switch
            state.key = endPoint.commandKey;
            state.reset();
        }
        else {
            // toggle on
            var this_ = this;
            state = new MappingState(node, endPoint.commandKey, function(event) {this_.keypressMappingHandler(event);});
            //this.mappingStates[node] = state;
            this.addMappingState(state);
        }

        //this.getService().debug(this.mappingStates.toSource());

    },


  // get selection (in document or text field or rich editor)
  getSelection: function (node) {
    var document = this.getWindow().document;
    if (node == null) {
    if (document.commandDispatcher.focusedWindow && document.commandDispatcher.focusedWindow.getSelection) {
      return document.commandDispatcher.focusedWindow.getSelection();
    }
    else
      return null;
    }
    else {
      return node.getSelection ? node.getSelection() : node.ownerDocument.defaultView.getSelection();//node.contentWindow.getSelection();
    }
  },

  isSelectionEmpty: function(selection) {
    return (selection == undefined || selection == null || selection.toString() == "");
  },

  collapseSelection: function() {
    var node = this.getActiveNode();
    if (node != null || !this.isSelectionEmpty(this.getSelection(null))) {
      if (node == null || this.isNodeEditor(node)) {
        this.getSelection(node).collapseToEnd();
      }
    }
  },


  convertSelection: function(selection, converter) {
    if (selection == null) return;
    for(var i = 0; i < selection.rangeCount; i++) {
      new RangeConverter(selection.getRangeAt(i), converter).convertNode(selection.getRangeAt(i).commonAncestorContainer);
    }

    // calling selection.collapseToEnd() causes a crash when selection ends at is at the end of a text node
    // however, with a timeout it seems to work.
    var this_ = this;
    this.getWindow().setTimeout(function() {this_.collapseSelection()}, 20);

  },


  replaceValue: function(node, value) {
    if (this.isNodeEditor(node)) {
      return; // we don't do that!
    }
    else {
      var scrollTop = node.scrollTop;
      var cursorLoc =  node.selectionStart;
      node.value = node.value.substring(0, node.selectionStart) + value +
                  node.value.substring(node.selectionEnd, node.value.length);
      node.scrollTop = scrollTop;
      node.selectionStart = cursorLoc + value.length;
      node.selectionEnd = cursorLoc + value.length;
    }
  },

  checkContentEditable: function(node) {
        if (!node.contentEditable)
            return false;
        if (typeof(node.contentEditable) == "string")
            return node.contentEditable.toUpperCase() == "TRUE";
        return node.contentEditable == true;
    },

  // get the current focused node - text field or rich text editor
  getActiveNode: function () {
      var document = this.getWindow().document;
      var node = document.commandDispatcher.focusedElement;

      if (!node) {
      if (document.commandDispatcher.focusedWindow) {

        if (document.commandDispatcher.focusedWindow.document ) {
                    //return document.commandDispatcher.focusedWindow.document.documentElement;

                    if (document.commandDispatcher.focusedWindow.document.designMode == "on")
                        return document.commandDispatcher.focusedWindow.document.documentElement;

                    // for thunderbird, nvu, etc
          var editors = document.getElementsByTagName("editor");
          for (var i = 0; i < editors.length; i++)
            if (editors[i].contentWindow == document.commandDispatcher.focusedWindow)
              //return editors[i];
                    return editors[i].contentDocument.documentElement;

                    // for nvu
                    var tabedit = document.getElementById("tabeditor");
                    if (tabedit) {
                        var eelement = tabedit.getCurrentEditorElement();
                        if (eelement.contentWindow && eelement.contentWindow == document.commandDispatcher.focusedWindow ) {
                            return eelement.contentDocument.documentElement;
                        }
                    }
          //return document.commandDispatcher.focusedWindow;

        }

        if (document.commandDispatcher.focusedWindow.frameElement &&
            document.commandDispatcher.focusedWindow.frameElement.contentDocument &&
            document.commandDispatcher.focusedWindow.frameElement.contentDocument.designMode == "on")
            //return document.commandDispatcher.focusedWindow.frameElement; // midas rich text editor in an iframe
            return document.commandDispatcher.focusedWindow.frameElement.contentDocument.documentElement;
      }

      } else {
            if (node == node.ownerDocument.documentElement && node.ownerDocument.designMode == "on")
                return node;


          if (this.checkContentEditable(node))
                return node;

      var nodeLocalName = node.localName.toLocaleUpperCase();

      if ((nodeLocalName == "TEXTAREA") || (nodeLocalName == "INPUT" && (node.type == "text" || node.type == "file")) || nodeLocalName == "TEXTBOX") {
        if (!(node.disabled || node.readOnly))
          return node;
      }

    }
    return null;
  },

  isNodeEditor: function (node) {
    return node == node.ownerDocument.documentElement || this.checkContentEditable(node);// node.tagName == "HTML";//((node.getEditor != undefined) || (node.contentDocument != undefined));
  },
  // get up to count characters from node before offset
  getBackBuffer : function (node, offset, count) {
    if (this.isNodeEditor(node)) { //.tagName.toLocaleUpperCase() == "EDITOR") {
      var selection = this.getSelection(node);

      if (!selection.focusNode.nodeValue)
        return "";

      var result = selection.focusNode.nodeValue.substr(0, selection.focusOffset - offset).substr(-count);
      if (!result)
        result = "";

      return result;
    } else {
      return node.value.substring(0, node.selectionStart - offset).substr(-count);
    }
  },

    keypressMappingHandler: function(event) {



        if ((event.keyCode == 255 && event.charCode > 0) || event.keyCode == 8) {
            // preprocessed event, ignore... except the following hack

            // for some reason the editor won't process the event without this (at least as of ff2.0)
            // as if the event is not properly initialized until accessed
          if (event.target.nodeName == "HTML") {
              var arr = [];
              for (var i in event) {
                  if (("" + i) != ("" + i).toUpperCase()) {
                      arr.push(i + " = " + event[i] + "\n");
                  }
              }
                        //this.getService().debug(s);
          }

        return true;
      }

        var node = this.getActiveNode();
        if (!node)
            return;


      // initialize state
      //var state = this.mappingStates[node];
        state = this.getMappingState(node);
      if (!state) {
          throw "MappingState for current node not found";
            return; // redundant
      }

        // ignore if no charCode (e.g. arrows) or if modifiers are pressed
      if (event.charCode > 0 && !event.ctrlKey && !event.altKey && !event.metaKey) {
          //logMessage("event.which: " + event.which + ", event.keyCode = " + event.keyCode + ", event.charCode = " + event.charCode);
          var c = String.fromCharCode(event.charCode);

          // process input
            var endPoint = this.getEndPoint(state.key);
            if (!endPoint)
                return;

            var result = endPoint.converter.processNextChar(this, state, c);

          // finish up
            event.preventDefault();

            var tosend = new Array(result.replace + result.out.length);
          for (var i = 0; i < result.replace; i++)
              tosend[i] = 8; // send backspace for all those that need to be removed
          for(var i = result.replace; i < tosend.length; i++)
              tosend[i] = result.out.charCodeAt(i - result.replace); // send new characters



            for (var i = 0; i < tosend.length; i++) {
              //var evt = this.getWindow().document.createEvent("KeyboardEvent");
                    var evt = event.target.ownerDocument.createEvent("KeyEvents");

              if (tosend[i] == 8)
                  evt.initKeyEvent(event.type, true, event.cancelable, null, false, false, false, false, 8, 0);
              else
                  // use keyCode 255 as an indicator that the event should be ignored
                  evt.initKeyEvent(event.type, true, event.cancelable, null, false, false, false, false, 255, tosend[i]);

              // handling of rich text editor is different in 1.9+
              if (event.target == event.target.ownerDocument.documentElement && this.getService().isNewGecko()) // (event.target.tagName == "HTML" || (event.target.contentEditable == true)) && this.getService().isNewGecko())
                  event.target.ownerDocument.dispatchEvent(evt);
              else
                        event.target.dispatchEvent(evt);

            }

          state.position = new MappingPosition(node);

      }

    }


} // end of window delegate


function RangeConverter(range, converter) {
  this.range = range;
  this.converter = converter;
  this.started = false;
  this.finished = false;
  /*
  this.toString = function() {
    return "started : " + this.started + ", finished: " + this.finished;
  };
  */
}

RangeConverter.prototype = {
  convertNode : function(node) {
    if (this.started && this.finished)
      return;

    if (!this.started &&
      ( ( (this.range.startContainer.nodeType == node.TEXT_NODE ||
         this.range.startContainer.nodeType == node.PROCESSING_INSTRUCTION_NODE ||
         this.range.startContainer.nodeType == node.COMMENT_NODE  )
          && node == this.range.startContainer)
        ||
        ( this.range.startContainer.childNodes && node == this.range.startContainer.childNodes[this.range.startOffset])
      ))
      this.started = true;

    if (node.nodeType == node.TEXT_NODE || node.nodeType == node.PROCESSING_INSTRUCTION_NODE || node.nodeType == node.COMMENT_NODE) {
      if (this.started && !this.finished) {
        // convert text
        var start = (node == this.range.startContainer) ? this.range.startOffset : 0;
        var end   = (node == this.range.endContainer) ? this.range.endOffset : node.nodeValue.length;
        var remainder = (node == this.range.endContainer) ? node.nodeValue.length - this.range.endOffset : 0;
        var convertedValue = node.nodeValue.substring(0, start) + this.converter.convert_string(node.nodeValue.substring(start, end)) + node.nodeValue.substr(end);

        node.nodeValue = convertedValue;

        if (node == this.range.endContainer) {
          this.range.setEnd(node, node.nodeValue.length - remainder);
        }
        if (node == this.range.startContainer) {
          this.range.setStart(node, start);
        }
      }
    }
    else if (node.childNodes)
      // walk the tree
      for (var i = 0; i < node.childNodes.length; i++) {
        this.convertNode(node.childNodes[i]);
        if (this.started && this.finished)
          break;
      }

    if (!this.finished &&
      ( ((this.range.endContainer.nodeType == node.TEXT_NODE ||
         this.range.endContainer.nodeType == node.PROCESSING_INSTRUCTION_NODE ||
         this.range.endContainer.nodeType == node.COMMENT_NODE  )
           && node == this.range.endContainer)
        ||
        ( (this.range.endContainer.childNodes.length > 0) && node == this.range.endContainer.childNodes[this.range.endOffset - 1])
      ))
      this.finished = true;

  }
} // end of rangeconverter.prototype

// keep the current position of the cursor during on the fly translation
function MappingPosition(node) {
  this.inEditor = this.isEditor(node);
  if (this.inEditor) {
    var selection = this.getSelection(node);
    this.focusNode = selection.focusNode;
    this.focusOffset = selection.focusOffset;
  }
  else {
    this.position = node.selectionStart;
  }
}

MappingPosition.prototype = {
  getSelection: function(node) {
    if (!node)
      return null;
    else
        return node.getSelection ? node.getSelection() : node.ownerDocument.defaultView.getSelection();//node.contentWindow.getSelection();
  },

  isEditor: function(node) {
    return node && (node == node.ownerDocument.documentElement || TransliteratorWindowDelegate.prototype.checkContentEditable(node));//node.tagName == "HTML"; //((node.getEditor != undefined) || (node.contentDocument != undefined));
  },

  equals: function (other) {
    if (this.inEditor != other.inEditor)
      return false;
    if (this.inEditor) {
      return (this.focusNode == other.focusNode && this.focusOffset == other.focusOffset);
    } else {
      return this.position == other.position;
    }
  }
} // end of mappingposition.prototype

// keep the current state during on the fly conversion
function MappingState(node, commandKey, eventHandler) {
  this.node = node;
  this.convertedBuffer = "";
  this.sourceBuffer    = "";
  this.position = new MappingPosition(this.node);

  //this.reset();
  this.handler = eventHandler; // the handler for keypress event
  this.key = commandKey; // the key to converter, etc

  // save and set visuals
  // TODO change this to something more flexible
  //if (MappingPosition.prototype.isEditor(this.node)) {
    if (node == node.ownerDocument.documentElement) {
    this.outline = node.style.border;
        node.style.border = this.style;
    }
  else {
      this.outline = node.style.outline;
        node.style.outline = this.style;
    }

    // set event handler
    node.addEventListener("keypress", eventHandler, false);
}

MappingState.prototype = {
    style : "dotted 1px blue",

  reset : function() {
    this.convertedBuffer = "";
    this.sourceBuffer = "";
    this.position = new MappingPosition(this.node);
  },

    clear: function() {
        this.node.removeEventListener("keypress", this.handler, false);
        //restore visuals
        if (this.node == this.node.ownerDocument.documentElement)
            this.node.style.border = this.outline;
        else
            this.node.style.outline = this.outline;

    }
}


function MappingResult() {
  this.out = "";
  this.replace = 0;
}

function ConversionMapEntry(string, specialCase) {
    this.value = string;
    this.specialCase = specialCase;
}

function Converter(conversionTable, caseSensitive, reverse) {
  this.maxSourceLength = 0;
  this.maxResultLength = 0;
    this.conversionMap = {};
    this.reverseMap    = {};
    this.caseSensitive = false;
    this.hasBackspaces = false;
    this.initConverter(conversionTable, caseSensitive, reverse ? false : true);
}


Converter.prototype = {

    /* initialize maps, lengths, case sensitivity
     *
     * conversionTable is an array of [source, result, special] (3rd value is optional, assumed false if not present)
     * special currently means guess case if source is caseless (e.g. ')
     * see http://www.benya.com/cyrillic/tocyrillic/layout.html
     *
     * caseSensitive means no case conversion, treat source & result literally
     * forward means treat source as source & target as target (reverse if false)
     *
     *  create function convert_string for simple non-keyboard conversions : wrap in applyBackspaces if necessary
     */
    initConverter: function(conversionTable, caseSensitive, forward) {
        this.caseSensitive = caseSensitive;
        var convertCase = function(str, otherStr) {
            if (caseSensitive || (otherStr && otherStr.toLocaleUpperCase() == otherStr.toLocaleLowerCase()))
                return str;
            else
                return str.toLocaleUpperCase();
        };

        var getSource = function(entry) {
            if (forward)
                return entry[0];
            else
                return entry[1];
        };

        var getTarget = function(entry) {
            if (forward)
                return entry[1];
            else
                return entry[0];
        }

        this.maxSourceLength = 0;
        this.maxResultLength = 0;

        var hasBackspaces = false;

        for (var i = 0; i < conversionTable.length; i++) {
            var entry = conversionTable[i];
            var special = forward && entry.length > 2 && entry[2];
            var source = convertCase(getSource(entry));
            var result = convertCase(getTarget(entry), source);
            if (source != "" && !this.conversionMap[source])
                this.conversionMap[source] = new ConversionMapEntry(result, special);
            if (result != "" && !this.reverseMap[result])
                this.reverseMap[result] = source;

            if (!hasBackspaces)
              hasBackspaces = result.indexOf("\u0008") >= 0;

            this.maxSourceLength = Math.max(this.maxSourceLength, source.length);
            this.maxResultLength = Math.max(this.maxResultLength, result.length);
        }


        if (hasBackspaces) {
            this.hasBackspaces = true;
            this.convert_string = function(string) {
              return this.applyBackspaces(this.convert(string));
            };
        }
        else {
          this.convert_string = this.convert;

        }

    },

    // results of conversion are appended to output and returned
    // chunks gets a new entry for each conversion in the form of [source substring, length of result]
    convert: function(src, output, chunks) {

        if (src == undefined || src == "" || src == null)
            return src;
        if (output == undefined)
            output = "";


      var hash = this.conversionMap;

      var location = 0;

      while (location < src.length) {
          var len = Math.min(this.maxSourceLength, src.length - location);
          var entry = null;
          var sub;

            // search for the longest match at this location
          while (len > 0) {
              sub = src.substr(location, len);
                if (this.caseSensitive)
                    entry = hash[sub];
                else
                  entry = hash[sub.toLocaleUpperCase()];
              if (entry)
                  break;
              else
                  len--;
          }

          // need this for translit on the fly
          if (chunks != undefined)
              chunks.push([sub, !entry || len == 0 ? 0 : entry.value.length]);

          if (!entry) {
              output += sub;
              location += sub.length;
          }
          else {
              var result = entry.value;

                if (!this.caseSensitive) {
                  // case analysis
                if (sub.toLocaleLowerCase() == sub.toLocaleUpperCase() && entry.specialCase && (result.toLocaleUpperCase() != result.toLocaleLowerCase())) {
                    // source is caseless, target is not caseless, guess case set to true - going to figure out the desired case for newStr

                    // need translit hash to determine if previous character (and possibly the one before it)
                    // were converted and are in upper case

                    // set prevDud to true previous is not a translated character or simply a blank
                    // set prevCap to true if previous was translated and was upper case

                    var prevCh = output.length == 0 ? null : output.substr(output.length - 1, 1);
                    var prevDud = !prevCh || !this.reverseMap[prevCh.toLocaleUpperCase()];
                    var prevCap = (!prevDud && prevCh == prevCh.toLocaleUpperCase());

                    // sub is caseless but result isn't. case will depend on lookbehind and lookahead
                    if (prevDud || !prevCap) {
                        result = result.toLocaleLowerCase();
                        prevCap = false;
                    }
                    else {
                        var next = " ";
                        if (location + len < src.length)
                            next = src.substr(location + len, 1);

                        if (next != next.toLocaleUpperCase() && next == next.toLocaleLowerCase() ) {
                            //next is lowercase (and not caseless)
                            result = result.toLocaleLowerCase();
                        }
                        else if (next == next.toLocaleUpperCase() && next != next.toLocaleLowerCase() ) {
                            // next is uppercase (and not caseless)
                            result = result.toLocaleUpperCase();
                        }
                        else {
                            // next is caseless. output case determined by the case of output[length - 2]
                            var pprevCh = output.length == 1 ? null : output.substr(output.length - 2, 1);
                            var pprevDud = !pprevCh || !this.reverseMap[pprevCh.toLocaleUpperCase()];
                            if (!pprevDud && (pprevCh == pprevCh.toLocaleUpperCase())) {
                                //pre-prev is in upper case. output is also uppercase
                                result = result.toLocaleUpperCase();
                            }
                            else {
                                result = result.toLocaleLowerCase();
                            }

                        }
                    }

                }
                else if ((sub.toLocaleLowerCase() == sub.toLocaleUpperCase()) && (!entry.specialCase)) {
                    // literal treatment of newStr - source is caseless, no guessing
                    // leave result as is
                }
                else if (sub != sub.toLocaleLowerCase()) {
                    if (result.length > 1 && sub != sub.toLocaleUpperCase()) {
                            // sub not all-lowercase
                        // capitalize first letter of newStr
                        result = result.substr(0, 1).toLocaleUpperCase() + result.substr(1).toLocaleLowerCase();
                    }
                    else {
                        result = result.toLocaleUpperCase();
                    }
                }
                else {
                    // sub is lowercase
                    result = result.toLocaleLowerCase();
                }
                }
                output += result;
              location += len;
          }
      }


        return output;
    },

    convertSkipMarkup: function(str) {
        var arr = this.splitHtmlString(str);

        for (var i = 0; i < arr.length; i++) {
            if ( (i % 2) == 0)
                arr[i] = this.convert_string(arr[i]);
        }

        return arr.join("");
    },

  splitHtmlString: function(string) {
    var re = /<[\/]?[!A-Z][^>]*>/ig;
    var result = new Array();
    var lastIndex = 0;
    var arr = null;
    while ( (arr = re.exec(string)) != null) {
      result.push(string.substring(lastIndex, arr.index));
      result.push(string.substring(arr.index, re.lastIndex));
      lastIndex = re.lastIndex;
    }
    result.push(string.substr(lastIndex));

    return result;
  },

  //process backspace characters in the string
  applyBackspaces: function(string) {
    var regex = /[^\u0008]\u0008/g;
    do {
      var len = string.length;
      string = string.replace(regex, "");
    } while (string.length < len);
    string = string.replace(/\u0008/g, "");
    return string;
  },

  //in: mappingstate for this node & new character
  //out: mappingresult
  processNextChar: function(windowAdapter, state, c) {
    // reset state if position changed
    if (!state.position.equals(new MappingPosition(state.node)))
      state.reset();

    var result = new MappingResult();

    // initial backbuffer. Add to it as characters are converted
        // backbuffer needed for lookbehind
    // 2*maxSourceLength because current lookbehind requires 2 characters beyond what's currently in the translit buffer for case calculations
    var backbuffer = windowAdapter.getBackBuffer(state.node, state.convertedBuffer.length, 2 * this.maxSourceLength);

    var chunks = [];

    state.sourceBuffer = state.sourceBuffer + c;

    var str = this.convert(state.sourceBuffer, backbuffer, chunks);

    // remove backbuffer from output
    str = str.substr(backbuffer.length);
    result.out = str;
    /* str is now left alone - it has the output matching contents of chunks and
       will be used to reinitialize backbuffers, along with chunks and state.sourceBuffer
    */


        if (result.out.length >= state.convertedBuffer.length) {
      // get the difference between state.convertedBuffer and output
      for (var i = 0; i < Math.min(state.convertedBuffer.length, result.out.length); i++) {
        if (state.convertedBuffer.substr(i, 1) != result.out.substr(i, 1)) {
          result.replace = state.convertedBuffer.length - i;
          result.out = result.out.substr(i);
          break;
        }
      }
      if (result.replace == 0) {
        result.out = result.out.substr(Math.min(state.convertedBuffer.length, result.out.length));
      }
        }
        else {
            result.replace = state.convertedBuffer.length;
        }

        while (state.sourceBuffer.length > this.maxSourceLength) {
      state.sourceBuffer = state.sourceBuffer.substr(chunks[0][0].length);
      // chunks[i][1] evaluates to false if no conversion took place, otherwise holds the length of cyr string
      str = str.substr(chunks[0][1] ? chunks[0][1] : chunks[0][0].length);
      chunks.shift();
    }
    state.convertedBuffer = str;

    return result;

  }

}

//TODO richedit documentelement in iframe in gecko 1.9 accessible via commandDispatcher.focusedElement : see if that helps clean up getActiveNode
//TODO context-sensitive mapping: a-> [x, y, z] depending on position in a word : [beginning, middle, end]
//TODO revise chunks, etc in converter & processChar - store objects with in/out strings, drop them into state obj

//TODO add menu items to popup with class=textbox-contextmenu

//TODO thunderbird search input can't do border (the parent hbox can) but can do outline - find out when outline is more appropriate than border, maybe a way to choose based on gecko version and type of control (input/document/contenteditable chunk)

//TODO add something to the popup menu in instantbird (maybe textbox-contextmenu will give it to me for free)

//TODO store past 2 chunks in state as {in, out}, use for lookbehind

//TODO track word position : decide if default is middle unless followed by non-con or default is end until followed by con
