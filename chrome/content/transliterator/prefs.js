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

    var btnApply = document.documentElement.getButton("extra1");
    btnApply.label = "Apply";
    btnApply.addEventListener("click", onAccept, false);

    // load settings
    var pref = Components.classes['@mozilla.org/preferences-service;1'].getService(Components.interfaces.nsIPrefService).getBranch("extensions.transliterator.");   
    
    document.getElementById("fromtranslit-label").value = getUnicodePref("commands.fromtranslit.label", pref);
    document.getElementById("totranslit-label").value = getUnicodePref("commands.totranslit.label", pref);
    document.getElementById("togglemode-label").value = getUnicodePref("commands.togglemode.label", pref);
    
    //document.getElementById("fromtranslit-shortcut").value = pref.getCharPref("commands.fromtranslit.shortcut");
    //document.getElementById("totranslit-shortcut").value = pref.getCharPref("commands.totranslit.shortcut");
    //document.getElementById("togglemode-shortcut").value = pref.getCharPref("commands.togglemode.shortcut");
    setShortcutValue(document.getElementById("fromtranslit-shortcut"), pref.getCharPref("commands.fromtranslit.shortcut"));
    setShortcutValue(document.getElementById("totranslit-shortcut"), pref.getCharPref("commands.totranslit.shortcut"));
    setShortcutValue(document.getElementById("togglemode-shortcut"), pref.getCharPref("commands.togglemode.shortcut"));
    
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
        //    !(obj[i] instanceof Function))
        //if (obj[i] instanceof Function)
        //  s += i + ": function\n";
        //else
            s += i + " = " + obj[i] + "\n";
    return s;
}

function onAccept() {
    //save new settings

    var pref = Components.classes['@mozilla.org/preferences-service;1'].getService(Components.interfaces.nsIPrefService).getBranch("extensions.transliterator.");   

    if (document.getElementById("fromtranslit-label").value != getUnicodePref("commands.fromtranslit.label", pref))
        setUnicodePref("commands.fromtranslit.label", document.getElementById("fromtranslit-label").value, pref);
    
    if (document.getElementById("totranslit-label").value != getUnicodePref("commands.totranslit.label", pref))
        setUnicodePref("commands.totranslit.label", document.getElementById("totranslit-label").value, pref);
        
    if (document.getElementById("togglemode-label").value != getUnicodePref("commands.togglemode.label", pref))
        setUnicodePref("commands.togglemode.label", document.getElementById("togglemode-label").value, pref);
    
    var scFrom = getShortcutValue(document.getElementById("fromtranslit-shortcut"));
    //if (document.getElementById("fromtranslit-shortcut").value != pref.getCharPref("commands.fromtranslit.shortcut"))
    //    pref.setCharPref("commands.fromtranslit.shortcut", document.getElementById("fromtranslit-shortcut").value);
    if (scFrom != pref.getCharPref("commands.fromtranslit.shortcut"))
        pref.setCharPref("commands.fromtranslit.shortcut", scFrom);
    
    var scTo = getShortcutValue(document.getElementById("totranslit-shortcut"));
    
    if (scTo != pref.getCharPref("commands.totranslit.shortcut"))
        pref.setCharPref("commands.totranslit.shortcut", scTo);
    //if (document.getElementById("totranslit-shortcut").value != pref.getCharPref("commands.totranslit.shortcut"))
    //    pref.setCharPref("commands.totranslit.shortcut", document.getElementById("totranslit-shortcut").value);

    var scToggle = getShortcutValue(document.getElementById("togglemode-shortcut")); 
    if (scToggle != pref.getCharPref("commands.togglemode.shortcut"))
        pref.setCharPref("commands.togglemode.shortcut", scToggle);
    //if (document.getElementById("togglemode-shortcut").value != pref.getCharPref("commands.togglemode.shortcut"))
    //    pref.setCharPref("commands.togglemode.shortcut", document.getElementById("togglemode-shortcut").value);
        
    if (document.getElementById("layout-select").value != pref.getCharPref("layout"))
        pref.setCharPref("layout", document.getElementById("layout-select").value);
    
    return true;
}

function openViewer() {
    var pref = Components.classes['@mozilla.org/preferences-service;1'].getService(Components.interfaces.nsIPrefService).getBranch("extensions.transliterator.");   

    var layoutName = document.getElementById("layout-select").value;
    
    var layout = getUnicodePref("layouts." + layoutName, pref);
    var layoutDesc = getUnicodePref("layouts." + layoutName + ".description", pref);
    var caseSensitive = getBoolPref("layouts." + layoutName + ".case_sensitive", pref);
    
    window.openDialog("chrome://transliterator/content/layout-viewer.xul", "dlgview", "chrome,dialog,centerscreen,resizeable=no", {
        layout: window.JSON ? window.JSON.parse(layout) : eval(layout),
        name:   layoutName,
        description: layoutDesc,
        caseSensitive: caseSensitive
    });
}
