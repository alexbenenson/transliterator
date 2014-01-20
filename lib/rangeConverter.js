/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

var RangeConverter = exports.RangeConverter = function RangeConverter(range, converter) {
  this.range = range;
  this.converter = converter;
  this.started = false;
  this.finished = false;
  /*
  this.toString = function() {
    return "started : " + this.started + ", finished: " + this.finished;
  };
  */
}

RangeConverter.prototype = {
  convertNode : function(node) {
    if (this.started && this.finished)
      return;

    if (!this.started &&
      ( ( (this.range.startContainer.nodeType == node.TEXT_NODE ||
         this.range.startContainer.nodeType == node.PROCESSING_INSTRUCTION_NODE ||
         this.range.startContainer.nodeType == node.COMMENT_NODE  )
          && node == this.range.startContainer)
        ||
        ( this.range.startContainer.childNodes && node == this.range.startContainer.childNodes[this.range.startOffset])
      ))
      this.started = true;

    if (node.nodeType == node.TEXT_NODE || node.nodeType == node.PROCESSING_INSTRUCTION_NODE || node.nodeType == node.COMMENT_NODE) {
      if (this.started && !this.finished) {
        // convert text
        var start = (node == this.range.startContainer) ? this.range.startOffset : 0;
        var end   = (node == this.range.endContainer) ? this.range.endOffset : node.nodeValue.length;
        var remainder = (node == this.range.endContainer) ? node.nodeValue.length - this.range.endOffset : 0;
        var convertedValue = node.nodeValue.substring(0, start) + this.converter.convert_string(node.nodeValue.substring(start, end)) + node.nodeValue.substr(end);

        node.nodeValue = convertedValue;

        if (node == this.range.endContainer) {
          this.range.setEnd(node, node.nodeValue.length - remainder);
        }
        if (node == this.range.startContainer) {
          this.range.setStart(node, start);
        }
      }
    }
    else if (node.childNodes)
      // walk the tree
      for (var i = 0; i < node.childNodes.length; i++) {
        this.convertNode(node.childNodes[i]);
        if (this.started && this.finished)
          break;
      }

    if (!this.finished &&
      ( ((this.range.endContainer.nodeType == node.TEXT_NODE ||
         this.range.endContainer.nodeType == node.PROCESSING_INSTRUCTION_NODE ||
         this.range.endContainer.nodeType == node.COMMENT_NODE  )
           && node == this.range.endContainer)
        ||
        ( (this.range.endContainer.childNodes.length > 0) && node == this.range.endContainer.childNodes[this.range.endOffset - 1])
      ))
      this.finished = true;

  }
} // end of rangeconverter.prototype
