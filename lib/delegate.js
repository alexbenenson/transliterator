/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

var {MappingPosition, MappingState} = require("converter");
var {EndPoint} = require("endPoint");
var {RangeConverter} = require("rangeConverter");
var {Constants} = require("constants");

Components.utils.import("resource://gre/modules/Services.jsm");

var TransliteratorWindowDelegate = exports.TransliteratorWindowDelegate = function TransliteratorWindowDelegate(service, wnd) {
  this._service = service;
  this._window  = wnd;

  this._createdElements = new Array();
  this._createdListeners = new Array(); // [{element, eventType, listener, capture}]
  this._removedElements = [];

  this._endPoints = [];
  this.endPointMap = {};
  this.mappingStates = {};

  // creating and destroying keys does not work. will have to reuse...
  this.keys = [];
  this.keyset = null;

  this.attach = this.attach.bind(this);
  this.detach = this.detach.bind(this);

  this.init();
}

TransliteratorWindowDelegate.prototype = {

  init: function() {
    this.reconfTimeout = 0;

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


  addMappingState: function(state, uniqueID) {
    this.mappingStates[uniqueID] = state;
  },

  getNodeID: function(node) {
    if (node == null)
      return null;

    var id = node.getAttribute(Constants.NODE_ID_ATTRIBUTE);

    if (!id)
      return null;
    else
      return id;
  },

  getMappingState: function(node) {

    var id = this.getNodeID(node);
    if (!id)
      return null;

    var state = this.mappingStates[id];
    if (!state)
      return null; // don't need undefineds or any other falsies
    else
      return state;

  },

  removeMappingState: function(node) {

    var id = this.getNodeID(node);
    if (!id)
      return null;

    var state = this.mappingStates[id];
    delete this.mappingStates[id];

    if (state)
      state.clear();
    return state;
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
    this.reconfTimeout = this.getWindow().setTimeout(this.reconfigureImpl.bind(this), 100);
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

    this.removeDynamicNodes();
    this.removeMappingStates();
  },

  removeMappingStates: function () {

    for (var id in this.mappingStates)
        this.mappingStates[id].clear();
    this.mappingStates = {};
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

    // reattach removed nodes (keys to keysets)
    for (var i = this._removedElements.length - 1; i>= 0; i--)
    	this._removedElements[i].parent.appendChild(this._removedElements[i].node);
    this._removedElements = [];
  },

  addNode: function(node) {
    this._createdElements.push(node);
  },

  addListener: function (element, eventType, listener, capture) {
    element.addEventListener(eventType, listener, capture);
    this._createdListeners.push({element: element, eventType : eventType, listener: listener, capture: capture});
  },

  addCommand: function(id, label, commandset) {
    var doc = this.getWindow().document;

    var cmd = doc.createElement("command");
    this.addNode(cmd);
    commandset.appendChild(cmd);
    cmd.id= Constants.NODE_PFX + id;
    cmd.setAttribute("label", label);
    cmd.setAttribute("oncommand", "//");
    cmd.addEventListener("command", this.processCommand.bind(this, id), false);
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
      this.addCommand(endPoints[i].commandKey, endPoints[i].menuLabel, cmdSet);
  },

  addShortcuts: function() {

    var win = this.getWindow();
    var doc = win.document;

    // Create keyset
    if (this.keyset && this.keyset.parentNode)
      this.keyset.parentNode.removeChild(this.keyset);

    this.keyset = doc.createElement("keyset");
    //doc.documentElement.appendChild(this.keyset);
    if (doc.documentElement.firstChild )
    	doc.documentElement.insertBefore(this.keyset, doc.documentElement.firstChild);
    else
    	doc.documentElement.appendChild(this.keyset);

    this.addNode(this.keyset);

    var endPoints = this.getEndPoints();


    var nsResolver = function(pfx) {
    	if (pfx == "xul")
    		return "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
    	else
    		return null;
    }

    var addedKeys = [];

    // create keys
    for (var i = 0; i < endPoints.length; i++) {
      var endPoint = endPoints[i];
      if (endPoint.keyCode && endPoint.keyCode != "") {
        var key = doc.createElement("key");

        key.setAttribute("id",      Constants.NODE_PFX + "key_" + endPoint.commandKey);
        key.setAttribute("command", Constants.NODE_PFX + endPoint.commandKey);

        if (endPoint.keyCode.length == 1)
          key.setAttribute("key", endPoint.keyCode);
        else
          key.setAttribute("keycode", endPoint.keyCode.toLocaleUpperCase());

        if (endPoint.modifiers)
          key.setAttribute("modifiers", endPoint.modifiers);

        this.keyset.appendChild(key);
        addedKeys.push(key);

      }
    }


    if (this._service.getOptions()[Constants.OVERRIDE_SHORTCUTS])
      try {
  	    // find all conflicting keys, remove them
      	// TODO: add a pref to control this behavior?
  	    var iterator = doc.evaluate("/xul:window/xul:keyset/xul:key", doc, nsResolver, win.XPathResult.UNORDERED_NODE_ITERATOR_TYPE, null );
  	    var keysToRemove = [];
  	    var node = null;
  	    while (node = iterator.iterateNext()) {

  	    	for (var i = 0; i < addedKeys.length; i++) {
  	    		var key = addedKeys[i];
  		    	if (node == key)
  		    		continue;

  		    	// if key/keycode and modifiers match, it's a conflict. compare modifiers as strings but sort them first (split->sort->join)
  		    	if (node.getAttribute("key") == key.getAttribute("key") &&
  		    		node.getAttribute("keycode") == key.getAttribute("keycode") &&
  		    		(node.getAttribute("modifiers") || "").split(" ").sort().join(" ") ==
  		    			(key.getAttribute("modifiers") || "").split(" ").sort().join(" ")
  		    		)
  		    		keysToRemove.push(node);
  	    	}
  	    }

  	    for (var i = 0; i < keysToRemove.length; i++) {
  	    	var k = keysToRemove[i];
      		var p = k.parentNode;

      		this._removedElements.push({node: k, parent: p});

      		p.removeChild(k);
  	    }
      }
      catch (e) {}

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
    mi.setAttribute("oncommand", "//");
    mi.addEventListener("command", this.processCommand.bind(this, "transliterator_options"));

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
        //this.getService().debug("item: " + item.nodeName);
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
      sep.setAttribute("id", Constants.NODE_PFX + "sep-tools");
      sep.setAttribute("hidden", true);

      var endPoints = this.getEndPoints();
      for (var j = 0; j < endPoints.length; j++) {
        var mi = doc.createElement("menuitem");
        this.addNode(mi);
        mi.setAttribute("command",  Constants.NODE_PFX + endPoints[j].commandKey);
        mi.setAttribute("key",      Constants.NODE_PFX + "key_" + endPoints[j].commandKey);
        mi.setAttribute("id",       Constants.NODE_PFX + "menu_" + endPoints[j].commandKey + "_" + i);
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
          if (separators.item(k).getAttribute("id") == (Constants.NODE_PFX + "sep-tools")) {
              separator = separators.item(k);
              break;
          }


        // find menu items - no more than one for each entry point
        // map key->item
        var theItems = {};
        var menuItems = target.getElementsByTagName("menuitem");
        for (var k = 0; k < menuItems.length; k++) {
          var cmd = menuItems.item(k).getAttribute("command");
          
          //convert from command node id back to commandkey (remove prefix)
          if (cmd) {
              cmd = cmd.substring(Constants.NODE_PFX.length);
          }
          
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
    this.getWindow().openDialog("chrome://transliterator/content/prefs/prefs.xul", "dlg", "chrome,dialog,centerscreen,resizeable=no");
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

    var state = this.getMappingState(node);


    if (state && state.key == endPoint.commandKey) {
      // toggle off
      // state.clear();  // clear in now in removeMappingState()
      this.removeMappingState(node);

    }
    else if (state && state.key != endPoint.commandKey) {
      // switch
      state.key = endPoint.commandKey;
      state.reset();
    }
    else {
      // toggle on
      var newID = this.getService().getUniqueID();
      state = new MappingState(node, endPoint.commandKey, this.keypressMappingHandler.bind(this), this.removeMappingState.bind(this), newID);
      this.addMappingState(state, newID); 
    }


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

      var nodeLocalName = node.localName;

      // Blacklist a few input types, see https://developer.mozilla.org/en-US/docs/Web/HTML/Element/Input#attr-type
      // for the complete list. Note that this has to be a blacklist, the
      // browser will treat unknown types like "text".
      var ignoredTypes = {
        button: true,
        checkbox: true,
        color: true,
        hidden: true,
        image: true,
        number: true,
        radio: true,
        range: true,
        reset: true,
        submit: true
      };
      if (nodeLocalName == "textarea" || (nodeLocalName == "input" && !ignoredTypes.hasOwnProperty(node.type.toLowerCase())) || nodeLocalName == "textbox") {
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



    // ignore if no charCode (e.g. arrows) or if modifiers are pressed
    if (event.charCode > 0 && !event.ctrlKey && !event.altKey && !event.metaKey) {

      var node = this.getActiveNode();
      if (!node)
        return;


      // initialize state
      state = this.getMappingState(node);
      if (!state) {
        throw "MappingState for current node not found";
          return; // redundant
      }

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

        if (event.target == event.target.ownerDocument.documentElement) // (event.target.tagName == "HTML" || (event.target.contentEditable == true))
          event.target.ownerDocument.dispatchEvent(evt);
        else
          event.target.dispatchEvent(evt);

      }

      state.position = new MappingPosition(node);

    }

  }


} // end of window delegate
