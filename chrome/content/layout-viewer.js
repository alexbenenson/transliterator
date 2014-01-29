/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

function onLoad() {
  var s = "";
  window.translitLayout = window.arguments[0];

  document.getElementById("description").value = window.translitLayout.description;
  document.getElementById("case-sensitivity").value = window.translitLayout.caseSensitive ? "(case-sensitive)" : "";

  document.getElementById("inverse").checked = false;

  showLayout();
}

function setInverse() {
  showLayout();
}

function underline(s) {

  return "<span style='text-decoration:underline;'>" + s + '</span>';

}

function showLayout() {
  var inverse = document.getElementById("inverse").checked;
  var caseSensitive = window.translitLayout.caseSensitive;

  // [[source, target]]
  var convCase = function(s, t) {
    if (caseSensitive || (t && t.toLocaleUpperCase() == t.toLocaleLowerCase()))
      return s;
    else
      return s.toLocaleUpperCase();
  }

  var headerOne = document.getElementById("header-one");
  var headerTwo = document.getElementById("header-two");
  var labelAttr = (inverse ? "data-invlabel" : "data-stdlabel");
  headerOne.setAttribute("label", headerOne.getAttribute(labelAttr));
  headerTwo.setAttribute("label", headerTwo.getAttribute(labelAttr));

  var layout = window.translitLayout.layout;

  var listBox = document.getElementById("layoutGrid");

  while (listBox.getRowCount() > 0)
    listBox.removeItemAt(listBox.getRowCount() - 1);


  var targetSet = {};

  for (var i = 0; i < layout.length; i++) {
    var src = convCase(layout[i][0]);
    var trg = convCase(layout[i][1], src);

    if (src == "" || trg == "")
      continue;

    //replace backspaces with \u2190
    trg = trg.replace("\x08", "\u2190");

    if (inverse)
      targetSet[src] = trg;
    else {
      if (!targetSet.hasOwnProperty(trg))
        targetSet[trg] = [];
      targetSet[trg].push(src);
    }
  }

  var targetList = Object.keys(targetSet).sort(function(s1, s2) {return s1.localeCompare(s2)});
  var underlined = false;

  for (var i = 0; i < targetList.length; i++) {
    var li = document.createElement("listitem");
    var lct = document.createElement("listcell");
    var lcs = document.createElement("listcell");

    li.appendChild(lct);
    li.appendChild(lcs);
    lct.setAttribute("label", targetList[i]);

    if (inverse)
      lcs.setAttribute("label", targetSet[targetList[i]]);
    else
      lcs.setAttribute("label", targetSet[targetList[i]].join(", "));

    if (targetList[i].match(/\s/)) {
      lct.setAttribute("style", "text-decoration: underline");
      underlined = true;
    }


    var srcMatch = false;
    var arr = targetSet[targetList[i]];
    for (var j = 0; j < arr.length; j++) {
      if (arr[j].match(/\s/)) {
        srcMatch = true;
        break;
      }
    }

    if (srcMatch) {
      lcs.setAttribute("style", "text-decoration: underline");
      underlined = true;
    }


    listBox.appendChild(li);
  }

  var lblUnderlined = document.getElementById("underlined");

  if (underlined)
    lblUnderlined.removeAttribute("style");
  else
    lblUnderlined.setAttribute("style", "display: none");
}
