/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

// commandKey : the key of the command to pass back to the service
// type is one of : none, batch, map
// label is menu label. no label = no menu
// keycode + modifiers is the shortcut key code. no keycode = no shortcut
// converter
var EndPoint = exports.EndPoint = function EndPoint(commandKey, menuLabel, keycode, modifiers, actionType, converter ) {
    this.menuLabel = menuLabel;
    this.keyCode = keycode;
    this.modifiers = modifiers;
    this.actionType = actionType;
    this.commandKey = commandKey;
    this.converter = converter;
}

EndPoint.MAP = "map";
EndPoint.BATCH = "batch";
EndPoint.NONE = "none";

