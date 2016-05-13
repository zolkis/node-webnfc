/*
 * A temporary small log utility. To be removed later.
 */

"use strict";
// var util = require('./nfc-util');

function indent(str, timesToRepeat, fillString) {
  let stringFiller = fillString.repeat(timesToRepeat)
  return str.split('\n')
    .map(line => stringFiller + line)
    .join('\n');
};

function toPrintableString(o) {
  if (o instanceof Error) {
    return o.toString();
  }
  if (o instanceof Object) {
    let str = '';
    for (let prop in o) {
      if (str.length)
        str += '\n';
      str += `${prop}: ${toPrintableString(o[prop])}`;
    }
    return `{\n${indent(str, 1, '\t')}\n}`;
  }
  return String(o);
};

let levels = { none: 0, error: 1, warning: 2, info: 3, debug: 4 };

module.exports = function (prefix, level) {
  var log = { _level: "error" };
  log.prefix = prefix || "";

  log.setLevel = function (level) {
    let value = levels[level];
    if (value) {
      log._level = level;
    }
    console.log(`Log level for ${log.prefix}: ${log._level}`);
  };

  log.setLevel(level);

  log.error = function() {
    if (levels[log._level] < levels.error)
      return;

    var args = Array.from(arguments).map(s => toPrintableString(s));
    console.log(`[Error] ${log.prefix} ${args}`);
  };

  log.warning = function() {
    if (levels[log._level] < levels.warning)
      return;

    var args = Array.from(arguments).map(s => toPrintableString(s));
    console.log(`[Warning] ${log.prefix} ${args}`);
  };

  log.info = function() {
    if (levels[log._level] < levels.info)
      return;

    var args = Array.from(arguments).map(s => toPrintableString(s));
    console.log(`[Info] ${log.prefix} ${args}`);
  };

  log.debug = function() {
    if (levels[log._level] < levels.debug)
      return;

    var args = Array.from(arguments).map(s => toPrintableString(s));
    console.log(`[Debug] ${log.prefix} ${args}`);
  };

  return log;
};