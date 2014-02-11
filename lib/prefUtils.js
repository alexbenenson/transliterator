/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */


Components.utils.import("resource://gre/modules/Services.jsm");


/** pref utility functions, loaders/savers, etc */
var PrefUtils = exports.PrefUtils = {
    
    getBoolPref: function(prefName, prefBranch) {
      try {
        return prefBranch.getBoolPref(prefName);
      } catch (e) {
        //silence the exception
       return false;
      }
    },
    
    getUnicodePref: function(prefName, prefBranch) {
      try {
        return prefBranch.getComplexValue(prefName, Components.interfaces.nsISupportsString).data;
      } catch (e) {
        // suppress
        return null;
      }
    },

    getCharPref: function(prefName, prefBranch) {
      try {
        return prefBranch.getCharPref(prefName);
      } catch (e) {
        return null;
      }
    },
    

    setUnicodePref: function (prefName,prefValue,prefBranch) {
      var sString = Components.classes["@mozilla.org/supports-string;1"].createInstance(Components.interfaces.nsISupportsString);
      sString.data = prefValue;
      prefBranch.setComplexValue(prefName,Components.interfaces.nsISupportsString,sString);
    },

    setCharPref: function(prefName, prevValue, prefBranch) {
      prefBranch.setCharPref(prefName, prefValue);
    },
    
    setBoolPref: function(prefName, prevValue, prefBranch) {
      prefBranch.setBoolPref(prefName, prefValue);
    },
    
    getBranch: function(name) {
      return Services.prefs.getBranch(name);      
    },
    
    getPrefList: function(name, prefBranch) {
      return prefBranch.getChildList(name);
    }
    
};