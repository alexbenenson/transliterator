/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

var PrefObserver = exports.PrefObserver = function PrefObserver(prefBranch, translitService) {
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
    var update = false;

    // if current layout is switched, reload
    if (aData == "layout")
      //this.service.updateEndPoints();
    	update = true;

    // if command labels or shortcuts are changed, reload
    if (aData.search("commands") == 0)
      //this.service.updateEndPoints();
    	update = true;

    // if current layout is changed, reload
    if (aData.search("layouts.") == 0)
      if (aData.search("layouts." + this.service.getPreferredLayout()) == 0) {
          //this.service.updateEndPoints();
    	  update = true;
      }
    
    // misc options
    if (aData.search("overrideShortcutConflicts") == 0)
    	update = true;
    
    if (update)
    	this.service.updateEndPoints();

  }
};
