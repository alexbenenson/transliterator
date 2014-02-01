/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

EXPORTED_SYMBOLS=["TransliteratorLayoutLoader"]

Components.utils.import("resource://gre/modules/Services.jsm");
var console = Services.console;

/**
 * public functions: 
 * 
 *  TransliteratorLayoutLoader.loadLayout(layoutName) - load the layout, return as a hash {name, description, layout, case_sensitive}
 *  TransliteratorLayoutLoader.getLayoutList() - get the list of all available layouts, return as an array of {name, description}, sorted on description
 * 
 */

var TransliteratorLayoutLoader = {


    /** return an object with {name, layout, description, case_sensitive} or empty object if not available 
        try prefs first, in case there is an override. then data file
    */  
    loadLayout : function(layoutName) {

        /* load layout from pref. if not available, load from file */
        var layout = this.loadLayoutFromPrefs(layoutName);
        if (layout.layout.length == 0 || layout.description == "") 
            layout = this.loadLayoutFromFile(layoutName);
        
        return layout;
        
    },
    
    
    loadLayoutFromPrefs: function(layoutName) {
        var pref = Services.prefs.getBranch("extensions.transliterator.layouts.");

        
        var layoutString = this.getUnicodePref(layoutName, pref) || "";
        var layoutDesc = this.getUnicodePref(layoutName + ".description", pref) || "";
        var caseSensitive = this.getBoolPref(layoutName + ".case_sensitive", pref) ;
        
        var layout = [];
        if (layoutString)
            try {
                layout = JSON.parse(layoutString);
            } catch (e) {
                console.logStringMessage(e.toString());
            }
        
        return {
            layout: layout,
            description: layoutDesc,
            caseSensitive: caseSensitive,
            name: layoutName
        };
    },
    
    loadLayoutFromFile: function(layoutName) {
        var lines = this.getFile();

        var searchResult = {};
        var keys = ["description", "case_sensitive", "layout"];
        
        /*
         * scan through all lines of the file, matching keys 
         * ( the file looks like layoutName.valueKey=value )
         * hopefully it will remain small enough to not need an indexed database :)
         * to avoid scanning the entire file every time, all 3 values need to be present, case_sensitive is no longer optional
         * having the most popular layouts near the top would help too
         * 
         * json would've been cleaner, but this should be a bit faster than parsing the entire file into json every time or keeping it in memory...  
         */
        
        for (var i = 0; i < lines.length; i++) {
            
            var line = lines[i];
            if (line.substring(0,  layoutName.length + 1) == layoutName+ ".") {
                
                for (var j = 0; j < keys.length; j++) {
                    if (line.substr(layoutName.length + 1, keys[j].length + 1) == (keys[j] + "="))
                        searchResult[keys[j]] = line.substring( layoutName.length + keys[j].length + 2 );
                }
                
                var done = true;
                for (var j = 0; j < keys.length; j++) {
                    if (!searchResult.hasOwnProperty[keys[j]]) {
                        done = false;
                        break;
                    }
                }
                
                if (done)
                    break; // all required lines found.
            }
        }
        
        var layout = [];
        if (searchResult["layout"])
            try {
                layout = JSON.parse(searchResult["layout"]);
            } catch (e) {
                console.logStringMessage(e.toString());
            }
            
        var caseSensitive = false;
        if (searchResult.hasOwnProperty("case_sensitive"))
            try {
                caseSensitive = JSON.parse(searchResult["case_sensitive"]);
            } catch (e) {
                console.logStringMessage(e.toString());
            }
        
        return {
            layout:  layout,
            description: searchResult["description"] || "",
            caseSensitive: caseSensitive,
            name: layoutName
        };
    },
    
    /** get the list of layouts as an array of {name, description} objects */
    getLayoutList: function() {
        // start with file
        // override with prefs

        var fileList = this.getListFromFile();
        var prefList = this.getListFromPrefs();
        var mergedList = this.mergeLayoutLists(fileList, prefList);
        
        // sort
        mergedList.sort(function(a, b){
            if (a.description < b.description)
                return -1;
            else if (a.description > b.description)
                return 1;
            else 
                return 0
        });
        
        return mergedList;
    },
    
    
    getListFromFile: function() {
        var lines = this.getFile();
        
        var result = [];
        var regex = /^([^\.]+)\.description=/;
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            
            if (!line)
                continue;
            
            line = line.trim();
            if (!(line) || line.substring(0, 1) == "#") // skip comments
                 continue;
            
             
            var found = null;
            if ( (found = line.match(regex)) && found.length > 1) 
                result.push({
                        name        : found[1], 
                        description : line.substring(found[0].length)
                    });
        }
        
        return result;
    },
    
    getListFromPrefs: function() {
        var pref = Services.prefs.getBranch("extensions.transliterator.layouts.");
        var list = pref.getChildList("");
        
        var result = new Array();
        for (var i = 0; i < list.length; i++) {
            if (list[i].search(/^[^\.]+$/) == 0) {
                var name = list[i];
                var desc = this.getUnicodePref(list[i] + ".description", pref);
                result.push({
                        name        : name, 
                        description    : desc
                    });
            }
        }
        return result;
        
    },
    
    mergeLayoutLists: function(source, overrides) {
        
        if (!source)
            return overrides;
        if (!overrides)
            return source;
        
        omap = {};
        //put overrides in a map
        for (var i = 0; i < overrides.length; i++)
            omap[overrides[i].name] = overrides[i].description;
        
        for (var i = 0; i < source.length; i++) 
            if (omap.hasOwnProperty(source[i].name)) {
                source[i].description = omap[source[i].name];
                delete omap[source[i].name];
            }
        
        // add remainder and return
        for (var name in omap)
            source.push({
                    name        : name, 
                    description    : omap[name]
                });
        
        return source;
    },
    
    /** return an array of lines*/
    getFile: function() {
        var xhr = this.getXHR();
        
        // synchronous because needs to return the result... ideally this would be an asynchronous call, but that requires a bit of refactoring
        xhr.open("GET", "chrome://transliterator/content/layouts.data", false);
        xhr.overrideMimeType("text/plain; charset=UTF-8")
        xhr.send();
        
        return xhr.responseText.split(/\r?\n/);
    } ,
    

    getUnicodePref: function(prefName, prefBranch) {
        try {
            return prefBranch.getComplexValue(prefName, Components.interfaces.nsISupportsString).data;
        } catch (e) {
            // suppress
            return null;
        }
    },
    
    getBoolPref: function(prefName, prefBranch) {
        try {
            return prefBranch.getBoolPref(prefName);
        } catch (e) {
            //silence the exception, default to false
           return false;
        }
    },
    
      getCharPref: function(prefName, prefBranch) {
        return prefBranch.getCharPref(prefName);
      },
    
    
    isBlank: function(string) {
        return ( string == null || string == "");
    },
    
    getXHR: function() {
        return Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);    
    }
    
};
