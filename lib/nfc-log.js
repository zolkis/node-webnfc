/*
 * A temporary small log utility. To be removed later.
 */

"use strict";
// var util = require('./nfc-util');

function toPrintableString(txt) {
  return (txt instanceof Object ? formatPrintableString(txt) : (txt || 'null'));
}

function indent(str, timesToRepeat, fillString) {
  let stringFiller = fillString.repeat(timesToRepeat)
  return str.split('\n')
    .map(line => stringFiller + line)
    .join('\n');
};

function formatPrintableString(o) {
  if (o instanceof Object) {
    let str = '';
    for (prop in o) {
      if (str.length)
        str += '\n';
      str += `${prop}: ${formatPrintableString(o[prop])}`;
    }
    return `{\n${indent(str, 1, '\t')}\n}`;
  }
  return String(o);
}

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

    var args = Array.from(arguments).map(s => toPrintableString(s));
    console.log(`[Error] ${log.prefix} ${args}`);
  };

  log.warning = function() {
    if (log._level == 'error' || log._level == "none")
      return;

    var args = Array.from(arguments).map(s => toPrintableString(s));
    console.log(`[Warning] ${log.prefix} ${args}`);
  };

  log.info = function() {
    if (log._level == 'warning' || log._level == 'error' || log._level == "none")
      return;

    var args = Array.from(arguments).map(s => toPrintableString(s));
    console.log(`[Info] ${log.prefix} ${args}`);
  };

  log.debug = function() {
    if (log._level == "info" || log._level == 'warning'
        || log._level == 'error' || log._level == "none")
      return;

    var args = Array.from(arguments).map(s => toPrintableString(s));
    console.log(`[Debug] ${log.prefix} ${args}`);
  };

  return log;
};
