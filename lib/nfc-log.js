/*
 * A temporary small log utility. To be removed later.
 */

//"use strict";
// var util = require('./nfc-util');

function toPrintableString(txt) {
  return (txt instanceof Object ? formatPrintableString(txt) : (txt || 'null'));
}

function formatPrintableString(o, indent) {
  if (!o)
    return "";

  var ind = indent || 1;
  var spaces = "";

  for (var i = ind; i > 0; i--)
    spaces += '\t';

  if (!(o instanceof Object) && !(o instanceof Array))
    return spaces + o;

  var out = spaces + '{\n';
  for (i in o) {
    var tuple = i + ': ' + toPrintableString(o[i], ind + 1);
    out += spaces + '\t' + tuple + ', \n';
  }

  return out + spaces + '}';
};

module.exports = function (prefix, level) {
  var log = { _level: "error" };
  log.prefix = prefix || "";

  log.setLevel = function (level) {
    if (level == "debug" || level == "warning" || level == "error"
        || level == "info" || level == "none")
      log._level = level;
    console.log(`Log level for ${log.prefix}: ${log._level}`);
  };

  log.setLevel(level);

  log.error = function() {
    if (log._level == 'none')
      return;

    var args = [...arguments].map(s => toPrintableString(s));
    console.log(`[Error] ${log.prefix} ${args}`);
  };

  log.warning = function() {
    if (log._level == 'error' || log._level == "none")
      return;

    var args = [...arguments].map(s => toPrintableString(s));
    console.log(`[Warning] ${log.prefix} ${args}`);
  };

  log.info = function() {
    if (log._level == 'warning' || log._level == 'error' || log._level == "none")
      return;

    var args = [...arguments].map(s => toPrintableString(s));
    console.log(`[Info] ${log.prefix} ${args}`);
  };

  log.debug = function() {
    if (log._level == "info" || log._level == 'warning'
        || log._level == 'error' || log._level == "none")
      return;

    var args = [...arguments].map(s => toPrintableString(s));
    console.log(`[Debug] ${log.prefix} ${args}`);
  };

  return log;
};
