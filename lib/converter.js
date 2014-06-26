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
var MappingState = exports.MappingState = function MappingState(node, commandKey, keyHandler, removeHandler, stateID) {
  this.node = node;
  this.convertedBuffer = "";
  this.sourceBuffer    = "";
  this.position = new MappingPosition(this.node);

  //this.reset();
  this.keyHandler = keyHandler; // the handler for keypress event
  this.removeHandler = removeHandler.bind(null, this.node);
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

  //set a unique id of the node
  node.setAttribute(Constants.NODE_ID_ATTRIBUTE, stateID);

  // set event handler
  node.addEventListener("keypress", this.keyHandler, false);
  node.ownerDocument.defaultView.addEventListener("unload", this.removeHandler, false);
}

MappingState.prototype = {
  style : "dotted 1px blue",

  reset : function() {
    this.convertedBuffer = "";
    this.sourceBuffer = "";
    this.position = new MappingPosition(this.node);
  },

  clear: function() {
    this.node.removeEventListener("keypress", this.keyHandler, false);
    this.node.ownerDocument.defaultView.removeEventListener("unload", this.removeHandler, false);

    //restore visuals
    if (this.node == this.node.ownerDocument.documentElement)
      this.node.style.border = this.outline;
    else
      this.node.style.outline = this.outline;

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
