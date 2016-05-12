
//"use strict";

function invoke(callback) {  // first param is an error, the rest for success
  if ( !(callback instanceof Function) )
    return null;

  var err = arguments[1];
  if (err) {
    return callback(err);
  }

  var rest = Array.prototype.slice.call(arguments, 2);
  return callback(null, rest);
};

function isNumber(data) {
  return (typeof data == 'number');
};

function isString(data) {
  return (typeof data == 'string' || data instanceof String);
};

function isDictionary(data) {
  if (!(data instanceof Object))
    return false;
  if (data instanceof Array)
    return false;
  for (p in data) {
    if (p instanceof Function)
      return false;
  }
};

function isURL(data) {
  if (typeof data != 'string' && !(data instanceof String)) {
    log ("isURL: not string");
    return false;
  }

  var url = new RegExp(
    /^https?:\/\/[\w-]+(\.\w[\w-]+)*(:[\d]{2,5}){0,1}(\/[\w.,:;`|%~#=^?@&<>\-\{\}!]*)?$/);

  return url.test(data);
};

function matchURL(url, pattern) {
  log.debug("matchURL checking: " + url + " to: " + pattern);
  if (!url && !pattern || pattern == '*' || pattern == '*://*')
    return true;

  var splitURL = url.split("://");
  if (splitURL.length != 2)
    return false;

  var splitPattern = pattern.split("://");
  switch (splitPattern[0]) {
    case '*':
      break;
    case 'https':
      if (splitURL[0] != 'https')
        return false;
      break;
    case 'http':  // allow http for experimental purposes
      if (splitURL[0] != 'http')
        return false;
      break;
  }

  var hostPattern = splitPattern[1].split('/')[0];
  if (hostPattern == '*')
    return restOf(splitURL[1], '/') == restOf(splitPattern[1], '/');

  if (hostPattern.indexOf('*.') == 0)
    return restOf(splitURL[1], '.', 0, true) == restOf(splitPattern[1], '.');

  var host = splitURL[1].split('/')[0];
  if (host != hostPattern)
    return false;

  var path = restOf(splitURL[1], '/');
  pathPattern = restOf(splitPattern[1], '/');

  return  path == pathPattern;
};

function restOf(str, ch, offset, last) {
  var index = (last ? str.lastIndexOf(ch) : str.indexOf(ch)) + 1;
  return str.slice(index + (offset || 0), str.length);
};

module.exports = {
  invoke: invoke,
  isURL: isURL,
  matchURL: matchURL,
  isNumber: isNumber,
  isString: isString,
  isDictionary: isDictionary
};
