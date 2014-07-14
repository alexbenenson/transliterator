/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */


var {Constants} = require("constants");

var Converter = exports.Converter = function Converter(conversionTable, caseSensitive, reverse) {
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
  // chunks receives a new entry for each conversion in the form of {src: <input>, out: <output>, converted: <true/false>} 
  // MAYBE/FUTURE - send in chunks instead of backbuffer 
  // MAYBE/FUTURE - return only chunks?
  convert: function(src, output, chunks) {

    if (src == undefined || src == "" || src == null)
      return src;

    if (output == undefined)
      output = "";

    //if (typeof(chunks) == "undefined")
    //  chunks = [];

    // in case chunks array was not empty... - not needed at this point
    var inputChunksLength = 0;
    if (typeof(chunks) != "undefined")
      inputChunksLength = chunks.length; 

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


      var result = sub;


      if (!entry) {
        // no match found, copy input to output
        result = sub;
        len = sub.length;
      }
      else {
        result = entry.value;

        if (!this.caseSensitive) {
          // case analysis
          if (sub.toLocaleLowerCase() == sub.toLocaleUpperCase() && entry.specialCase && (result.toLocaleUpperCase() != result.toLocaleLowerCase())) {
            // source is caseless, target is not caseless, guess case set to true - going to figure out the desired case for newStr

            // need translit hash to determine if previous character (and possibly the one before it)
            // were converted and are in upper case

            // set prevDud to true previous is not a translated character or simply a blank
            // set prevCap to true if previous was translated and was upper case

            // MAYBE/FUTURE: use chunks for look-behind. OR just leave it alone...


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
      }

      output += result;
      location += len;


      // need this for translit on the fly
      // add a chunk
      if (typeof(chunks) != "undefined") {
        chunks.push({
          src       : sub, 
          out       : result, 
          converted : (!!entry)
        });
      }    
      
      
    }

    if (inputChunksLength > 0) {
      // remove incoming chunks from resulting chunks
      chunks = chunks.slice(inputChunksLength);
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
    // state.convertedBuffer contains the output matching state.sourceBuffer. excluding it here because contents of sourceBuffer will be reprocessed
    // 2x because current lookbehind requires 2 characters beyond what's currently in the translit buffer for case calculations

    var backBuffer = "";

    // if state.backBuffer does has enough, use it
    if (state.backBuffer.length >= 2)
      backBuffer = state.backBuffer.map(function(chunk) {
                      return chunk.out;
                    }).join(""); // concatenate all "out" strings from chunks in backbuffer
    else
      //  if state.backBuffer does not have enough chunks, get the text from active node at cursor
      //  don't need maxSourceLength - just one char per position is enough (commented out)
      backbuffer = windowAdapter.getBackBuffer(state.node, state.convertedBuffer.length, 2  /** this.maxSourceLength*/);

    var chunks = [];

    // append new character to input buffer
    state.sourceBuffer = state.sourceBuffer + c;


    // convert the entire input buffer
    // conversion results are appended to backbuffer - so str is a combination of backbuffer and new results
    var str = this.convert(state.sourceBuffer, backbuffer, chunks);

    // remove backbuffer from output
    str = str.substr(backbuffer.length);
    result.out = str;

    /* str is now left alone - it has the output matching contents of chunks and
       will be used to reinitialize sourceBuffer and convertedBuffer in state
       
       str is equal to chunks.map(function(chunk){return chunk.out}).join("");
    */


    // figure out the difference the prefix difference between new result and previous state.convertedBuffer
    // difference will need to be replaced 
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

    // reduce state.sourceBuffer to maxSourceLength and state.convertedBuffer to corresponding output
    while (state.sourceBuffer.length > this.maxSourceLength) {

      var chunk = chunks[0];

      //dump("next chunk: " + JSON.stringify(chunk) + "\n");
      // each chunk contains {src: <source>, out: <result>, converted: <result != source (source was mapped)>}
      // from first chunk - remove chunk.in from sourceBuffer and chunk.out from convertedBuffer
      state.sourceBuffer = state.sourceBuffer.substr(chunk.src.length);
      str = str.substr(chunk.out.length);

      state.backBuffer.push( chunks.shift() ); // append removed chunk to backbuffer
    }

    state.convertedBuffer = str;

    // NEW/EXPERIMENTAL
    state.currentBuffer = chunks; // remaining chunks;
    if (state.backBuffer > 2)
      state.backBuffer = state.backBuffer.slice(state.backBuffer.length - 2); // reduce to last 2 conversions - don't need more than that.

    return result;

  }

}

// keep the current position of the cursor during on the fly translation
var MappingPosition = exports.MappingPosition = function MappingPosition(node) {
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
    return node && (node == node.ownerDocument.documentElement || require("delegate").TransliteratorWindowDelegate.prototype.checkContentEditable(node));//node.tagName == "HTML"; //((node.getEditor != undefined) || (node.contentDocument != undefined));
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
/**
  node - the node for which this state is maintained
  commandKey - the unique string identifying the command (one of EndPoint.XXX constants)
  keyHandler - the event listener to be installed for node.keypress event - will handle key mapping
  removeHandler - the handler to be installed for document.defaultView.unload events - will remove the mapping  state on doc.unload (see the binding below)
  stateID - unique id to be set on the node - it will be used to associate nodes and mapping states. generated uuid
  
*/
var MappingState = exports.MappingState = function MappingState(node, commandKey, keyHandler, removeHandler, stateID) {
  this.node = node;

  //if true, do not install key handler, do not change decorations - this state is for all-window mapping mode
  this.lightweight  = !(keyHandler);

  this.init(); // initialize buffers and position
  /*
  this.convertedBuffer = "";
  this.sourceBuffer    = "";

  //EXPERIMENTAL
  this.currentBuffer = []; // chunks with src adding up to max length of input
  this.backBuffer    = []; // chunks for up to 2 conversions before currentBuffer - to be used for automatic case inference where needed
                           // currently this is the backbuffer extracted from active node at cursor
                           // chunks originate in converter.convert in the form of {src: <input string>, out: <output string>, converted: true/false}
                           // the order of strings in back buffer and current buffer is straight-through - bb[0], bb[1], cb[0], cb[1], etc. (bb is not a stack)

  this.position = new MappingPosition(this.node);
  */


  this.keyHandler = keyHandler; // the handler for keypress event
  this.removeHandler = removeHandler.bind(null, this.node);
  this.key = commandKey; // the key to converter, etc

  // save and set visuals

  if (!this.lightweight) {
    if (node == node.ownerDocument.documentElement) {
      //TODO - prefer outline if possible (research!)
      this.outline = node.style.border;
      node.style.border = this.style;
    }
    else {
      this.outline = node.style.outline;
      node.style.outline = this.style;
    }
  }

  //set a unique id of the node
  node.setAttribute(Constants.NODE_ID_ATTRIBUTE, stateID);

  // set event handler
  if (!this.lightweight) {
    node.addEventListener("keypress", this.keyHandler, false);
  }
  node.ownerDocument.defaultView.addEventListener("unload", this.removeHandler, false);
}

MappingState.prototype = {
  style : "dotted 1px #3399FF", 
    //TODO - get style from config

  init : function() {
    this.convertedBuffer = "";
    this.sourceBuffer = "";
    this.currentBuffer = [];
    this.backBuffer = [];

    this.position = new MappingPosition(this.node);
  },

  reset: function() {
    this.init();
  },

  clear: function() {
    this.reset();

    if (!this.lightweight)
      this.node.removeEventListener("keypress", this.keyHandler, false);
    this.node.ownerDocument.defaultView.removeEventListener("unload", this.removeHandler, false);

    if (!this.lightweight) {
      //restore visuals
      if (this.node == this.node.ownerDocument.documentElement)
        this.node.style.border = this.outline;
      else
        this.node.style.outline = this.outline;
    }

    this.node.removeAttribute(Constants.NODE_ID_ATTRIBUTE);
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

/** lazy initialization wrapper for converter. will request an instance of converter from the factory method when the instance is needed, and will store this instance for future use
 */
var ConverterLazyWrapper = exports.ConverterLazyWrapper = function(factoryFunction) {
	this.factoryFunction = factoryFunction;

	// call factory first time, return the created object all subsequent times
	this.getConverter = function() {
		var converter = this.factoryFunction();

		this.getConverter = function() { // rewrite self
			return converter;
		}
		return this.getConverter();
	};

	// facade methods
	this.convert_string = function (string) {
		return this.getConverter().convert_string(string);
	};

	this.convert = function(src, output, chunks) {
		return this.getConverter().convert(src, output, chunks);
	};

	this.convertSkipMarkup = function(str) {
		return this.getConverter().convertSkipMarkup(str);
	};

	this.splitHtmlString = function(str) {
		return this.getConverter().splitHtmlString(str);
	};

	this.processNextChar = function(delegate, state, c) {
		return this.getConverter().processNextChar(delegate, state, c);
	}

}
