/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */


Components.utils.import("resource://gre/modules/Services.jsm");

function require(module)
{
  var result = {};
  result.wrappedJSObject = result;
  Services.obs.notifyObservers(result, "transliterator-require", module);
  return result.exports;
}

var {TransliteratorLayoutLoader} = require("layoutLoader");
var {PrefUtils} = require("prefUtils");
var {Constants} = require("constants");

var commands = ["fromtranslit", "totranslit", "togglemode"];
var stringBundle = Services.strings.createBundle("chrome://transliterator/locale/prefs.properties");



function setShortcutValue(element, shortcut) {
  // Store original shortcut value so that it can be retrieved later
  element.setAttribute("data-keyval", shortcut.join(" "));

  // Produce a nicer representation of the shortcut to be displayed
  var mapping = {
    "alt": "Alt",
    "control": "Ctrl",
    "shift": "Shift",
    "meta": "Meta"
  };
  for (var i = 0; i < shortcut.length - 1; i++)
    shortcut[i] = (mapping.hasOwnProperty(shortcut[i]) ? mapping[shortcut[i]] : shortcut[i]);
  if (shortcut.length)
    shortcut[shortcut.length - 1] = shortcut[shortcut.length - 1].replace(/^VK_/, "");
  element.value = shortcut.join("+");
}

function getShortcutValue(element) {
  return element.getAttribute("data-keyval");
}

function onLoad() {
  // load settings
  var pref = Services.prefs.getBranch("extensions.transliterator.");

  for (var i = 0; i < commands.length; i++) {
    var command = commands[i];
    var defaultLabel = stringBundle.GetStringFromName(command + ".label");
    var currentLabel = PrefUtils.getUnicodePref("commands." + command + ".label", pref);
    document.getElementById(command + "-default").value = defaultLabel;
    document.getElementById(command + "-label").value = currentLabel || defaultLabel;
    setShortcutValue(document.getElementById(command + "-shortcut"), pref.getCharPref("commands." + command + ".shortcut").split(/\s+/));
  }

    
  var menulist = document.getElementById("layout-select");
  var layouts = TransliteratorLayoutLoader.getLayoutList();
  menulist.removeAllItems();
  for (var i = 0; i < layouts.length; i++) {
   	menulist.appendItem(layouts[i].description, layouts[i].name);
  }

  menulist.value = pref.getCharPref("layout");

  
  document.getElementById("overrideConflicts").checked = PrefUtils.getBoolPref(Constants.OVERRIDE_SHORTCUTS, pref);
  
  window.sizeToContent();

}


function shortcutKeyPress(event) {
  // Ignore key presses that have special meaning in dialogs unless a modifier key is pressed
  if (event.keyCode == event.DOM_VK_RETURN || event.keyCode == event.DOM_VK_ESCAPE || event.keyCode == event.DOM_VK_TAB)
    if (!event.altKey && !event.ctrlKey && !event.metaKey)
      return;

  event.preventDefault();

  var mods = [];
  if (event.altKey)
    mods.push("alt");
  if (event.ctrlKey)
    mods.push("control");
  if (event.shiftKey)
    mods.push("shift");
  if (event.metaKey)
    mods.push("meta");

  var code = "";
  if (event.keyCode) {
    // figure out the vk_ code
    for (var i in event) {
      if (/^DOM_VK_/.test(i)) {
        if (event[i] == event.keyCode) {
          code = i.replace(/^DOM_/, "");
            break;
        }
      }
    }
  }
  else if (event.charCode)
    code = String.fromCharCode(event.charCode).toLocaleUpperCase();

  if (!code)
    return;

  setShortcutValue(event.target, mods.concat([code]));
}


function onAccept() {
  //save new settings

  var pref = Services.prefs.getBranch("extensions.transliterator.");

  for (var i = 0; i < commands.length; i++) {
    var command = commands[i];
    var defaultLabel = stringBundle.GetStringFromName(command + ".label");
    var currentLabel = document.getElementById(command + "-label").value;
    PrefUtils.setUnicodePref("commands." + command + ".label", currentLabel != defaultLabel ? currentLabel : "", pref);

    var shortcut = getShortcutValue(document.getElementById(command + "-shortcut"));
    pref.setCharPref("commands." + command + ".shortcut", shortcut);
  }

  if (document.getElementById("layout-select").value != pref.getCharPref("layout"))
    pref.setCharPref("layout", document.getElementById("layout-select").value);

  var override = document.getElementById("overrideConflicts").checked;
  if (override != PrefUtils.getBoolPref(Constants.OVERRIDE_SHORTCUTS, pref))
    PrefUtils.setBoolPref(Constants.OVERRIDE_SHORTCUTS, !!override, pref);
    
  return true;
}

function openViewer() {

  var layoutName = document.getElementById("layout-select").value;
  var layout = TransliteratorLayoutLoader.loadLayout(layoutName);

  window.openDialog("chrome://transliterator/content/layouts/layout-viewer.xul", "dlgview", "chrome,dialog,centerscreen,resizeable=yes", layout); 
}
