/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

Components.utils.import("resource://gre/modules/Services.jsm");

var commands = ["fromtranslit", "totranslit", "togglemode"];
var stringBundle = Services.strings.createBundle("chrome://transliterator/locale/prefs.properties");

function setUnicodePref(prefName,prefValue,prefBranch) {
  var sString = Components.classes["@mozilla.org/supports-string;1"].createInstance(Components.interfaces.nsISupportsString);
  sString.data = prefValue;
  prefBranch.setComplexValue(prefName,Components.interfaces.nsISupportsString,sString);
}

function getUnicodePref(prefName, prefBranch) {
  return prefBranch.getComplexValue(prefName, Components.interfaces.nsISupportsString).data;
}

function getBoolPref(prefName, prefBranch) {
  try {
    return prefBranch.getBoolPref(prefName);
  } catch (e) {
    //silence the exception
   return false;
  }
}

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
    var currentLabel = getUnicodePref("commands." + command + ".label", pref);
    document.getElementById(command + "-default").value = defaultLabel;
    document.getElementById(command + "-label").value = currentLabel || defaultLabel;
    setShortcutValue(document.getElementById(command + "-shortcut"), pref.getCharPref("commands." + command + ".shortcut").split(/\s+/));
  }

  var childCount = new Object();
  var list = pref.getChildList("layouts.", childCount);
  var fullList = new Array();
  for (var i = 0; i < childCount.value; i++) {
    if (list[i].search(/layouts\.[^\.]+$/i) == 0) {
      var desc = list[i];
      var value = desc.replace(/layouts\./i, "");
      try {
        desc = getUnicodePref(list[i] + ".description", pref);
      } catch (e) {
      }
      fullList[fullList.length] = [desc,value];
      //menulist.appendItem(desc, value, "");
    }
  }
  //menulist.selectedIndex = 0;
  fullList.sort();
  var menulist = document.getElementById("layout-select");
  for (var i = 0; i < fullList.length; i++) {
    menulist.appendItem(fullList[i][0], fullList[i][1], "");
  }

  menulist.value = pref.getCharPref("layout");

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

function objToString(obj) {
  var s = "";
  for(var i in obj)
    //if ( ("" + i != ("" + i).toUpperCase()) &&
    //  !(obj[i] instanceof Function))
    //if (obj[i] instanceof Function)
    //  s += i + ": function\n";
    //else
      s += i + " = " + obj[i] + "\n";
  return s;
}

function onAccept() {
  //save new settings

  var pref = Services.prefs.getBranch("extensions.transliterator.");

  for (var i = 0; i < commands.length; i++) {
    var command = commands[i];
    var defaultLabel = stringBundle.GetStringFromName(command + ".label");
    var currentLabel = document.getElementById(command + "-label").value;
    setUnicodePref("commands." + command + ".label", currentLabel != defaultLabel ? currentLabel : "", pref);

    var shortcut = getShortcutValue(document.getElementById(command + "-shortcut"));
    pref.setCharPref("commands." + command + ".shortcut", shortcut);
  }

  if (document.getElementById("layout-select").value != pref.getCharPref("layout"))
    pref.setCharPref("layout", document.getElementById("layout-select").value);

  return true;
}

function openViewer() {
  var pref = Services.prefs.getBranch("extensions.transliterator.");

  var layoutName = document.getElementById("layout-select").value;

  var layout = getUnicodePref("layouts." + layoutName, pref);
  var layoutDesc = getUnicodePref("layouts." + layoutName + ".description", pref);
  var caseSensitive = getBoolPref("layouts." + layoutName + ".case_sensitive", pref);

  window.openDialog("chrome://transliterator/content/layout-viewer.xul", "dlgview", "chrome,dialog,centerscreen,resizeable=no", {
    layout: JSON.parse(layout),
    name: layoutName,
    description: layoutDesc,
    caseSensitive: caseSensitive
  });
}
