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
	element.value = shortcut.replace(/VK_/i, "");
	element.setAttribute("keyval", shortcut);
}

function getShortcutValue(element) {
	return element.getAttribute("keyval");
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
    setShortcutValue(document.getElementById(command + "-shortcut"), pref.getCharPref("commands." + command + ".shortcut"));
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
  event.preventDefault();

  //if (event.keyCode == 0)
  //  return;

  var mods = "";
  if (event.altKey)
    mods += (mods == "" ? "" : "+") + "Alt";
  if (event.ctrlKey)
    mods += (mods == "" ? "" : "+") + "Ctrl";
  if (event.shiftKey)
    mods += (mods == "" ? "" : "+") + "Shift";
  if (event.metaKey)
    mods += (mods == "" ? "" : "+") + "Meta";

  var keyCode = event.keyCode? event.keyCode : String.fromCharCode(event.charCode).toLocaleUpperCase().charCodeAt(0);
  var code = "";
  //alert(keyCode);

  // figure out the vk_ code
  for (var i in event) {
    if (i.search(/DOM_VK_/i) == 0)
      if (event[i] == keyCode) {
        code = i;
        break;
      }
  }
  code = code.replace(/DOM_/i, "");

  //event.target.value = mods + (mods == "" ? "" : "+") + code;
  setShortcutValue(event.target, mods + (mods == "" ? "" : "+") + code);
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
