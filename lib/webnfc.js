
// ===================== Web NFC implementation ==============================

var Promise = require("native-promise-only");
var backend = require('./neard');
var util = require('./nfc-util');
var log = require('./nfc-log')("[WebNFC] ", "error");

/**
 * Implements the API of the W3C Web NFC API: https://w3c.github.io/web-nfc
 * with the following differences for Node.js:
 * - Only one slot for pushing NFCPushMessage, either 'tag', or 'peer', or 'any'.
 * - Canceling a puch rejects previous push invocation(s).
 * - Web NFC tag format is not mandatory (neard does not support it yet).
 * - Secure context is not required.
 * - No suspend and resume required (no explicit background page case handling).
 * - The URI in an NFCMessage is not updated by the user agent when pushing.
 */

// Internal slots.
var slots = {
  push: {
    promise: null
  },

  watch: {
    list: {},
    count: 0,
    id: 0
  },

  incoming: {
    data: [],
    url: null
  }
};

// ~~~~~~~~~~~~~~~~~~~~~ Web NFC push ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// https://w3c.github.io/web-nfc/#steps-push
function push(message, options) {
  log.debug("push called with message: ", message);
  return new Promise(function(resolve, reject) {
    if (!obtainPushPermission()) {
      return reject(new Error('SecurityError'));
    }

    if (backend.pushInProgress()) {
      return reject(new Error('NoModificationAllowedError'));
    }

    var records = preparePushRecords(message);
    if (!records) {
      return reject(new Error('SyntaxError'));
    }

    var target = options && options.target ? options.target : "any";
    var timeout = options && options.timeout ? options.timeout : 0;
    var ignoreRead = options && options.ignoreRead ? options.ignoreRead : true;

    if (slots.push.promise instanceof Promise) {
      slots.push.promise.reject(new Error('AbortError'));
    }
    slots.push.promise = this;

    backend.setPush(records, target, timeout, ignoreRead,
        function(err, target) {
          if (err) {
            backend.resetPush(function(err){
              reject(new Error('NetworkError'));
            });
          }
          resolve();
        });
  });
};

// cancels a push message, unless transfer has already started
function cancelPush() {
  return new Promise(function(resolve, reject) {
    // the client calls on .then() or .catch() define 'resolve' and 'reject'
    if (!obtainPushPermission()) {
      return reject(new Error('SecurityError'));
    }

    if (backend.pushInProgress()) {
      log.error("cancelWatch: push in progress.");
      return reject(new Error('NoModificationAllowedError'));
    }

    backend.resetPush(function(err) {
      if (err) {
        log.error("cancelWatch: cannot cancel NFC push.");
        reject(new Error('NoModificationAllowedError'));
      }

      if (slots.push.promise) {
        slots.push.promise.reject(new Error('AbortError'));
        slots.push.tag.promise = null;
      }

      if (slots.watch.count == 0) {
        backend.setPolling('none', function(err) {
          if (err) {
            log.error("cancelWatch: cannot disable NFC polling.");
            // not an error to reject;
          }
        });
      }
      resolve();
    });
  });
};

// @message := DOMString or ArrayBuffer or NFCMessage
function preparePushRecords(message) {
  if (!message)
    return null;

  var records = [];

  backend.addWebNfcRecord(records);

  if (typeof message == 'string' || message instanceof String) {
    if (util.isURL(message)) {
      backend.addUriRecord(records, message);
      return records;
    }

    backend.addTextRecord(records, message);
    return records;
  }

  if (message instanceof ArrayBuffer) {
    backend.addMediaRecord(records, message, "application/octet-stream");
    return records;
  }

  if (message instanceof Array && util.isNumber(message.data[0])) {
    for (i = 1; i < message.data.length; i++) {
      if (!isNumber(message.data[i]))
        return null;
    }
    backend.addTextRecord(records, JSON.stringify(message));
    return records;
  }

  // It must be an NFCMessage then.
  if (!message.data || !message.url || !(message.data instanceof Array))
    return null;

  for (i = 0; i < message.data.length; i++) {
    if (!isValidRecord(message.data[i]))
      return null;
    addRecord(records, message.data[i]);
  }

  return records;
}

function addRecord(to, record) {
  switch (record.recordType) {
    case 'text':
      backend.addTextRecord(to, record.data);
      break;
    case 'url':
      backend.addUriRecord(to, record.data);
      break;
    case 'json':
      backend.addMediaRecord(to, record.data, "application/json");
      break;
    case 'opaque':
      backend.addMediaRecord(to, record.data, "application/octet-stream");
      break;
  }
};

function isValidRecord(record) {
  if (record instanceof Object && record.recordType && record.data) {
    if (record.recordType == 'text' && util.isString(record.data))
      return true;
    if (record.recordType == 'url' && util.isURL(record.data))
      return true;
    if (record.recordType == 'json' && (util.isString(record.data) ||
                                        util.isDictionary(record.data)))
      return true;
    if (record.recordType == 'opaque' && record.mediaType &&
        util.isString(record.mediaType))  // could do further checks
      return true;
  }
  return false;
}

// In the node runtime it is OK to use NFC via the request mechanism.
// Other eventual criteria come here.
function obtainPushPermission() {
  return true;
};

// ~~~~~~~~~~~~~~~~~~~~~ Web NFC watch ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

function obtainWatchPermission() {
  return true;
};

function watch(callback, options) {
  return new Promise(function(resolve, reject) {
    // the client calls on .then() or .catch() define 'resolve' and 'reject'
    if (!obtainWatchPermission()) {
      log.warning("watch: no permission");
      return reject(new Error('SecurityError'));
    }

    var mode = options && options.mode ? options.mode : 'any';
    var recordType = options && options.recordType ? options.recordType : '';
    var mediaType = options && options.mediaType ? options.mediaType : '';
    var urlPattern = options && options.url ? options.url : '';

    if (!(callback instanceof Function) ||
         (!validWatchMode(mode) ||
          !validUrlPattern(urlPattern) ||
          !validMediaType(mediaType) ||
          !validRecordType(recordType))) {
      log.warning("watch: callback not a function or options not valid");
      return reject(new Error('SyntaxError'));
    }

    var id = "watch" + slots.watch.id++;
    slots.watch.count++;
    slots.watch.list[id] = {
      id: id,
      callback: callback,
      options: {
        mode: mode,
        mediaType: mediaType,
        recordType: recordType,
        url: urlPattern
      }
    };

    // Increment polling refcount on both tag and peer
    backend.tickPolling('any', function(err) {
      if (err) {
        log.debug("watch: cannot enable NFC polling.");
        return reject(new Error("Cannot use NFC."));
      }
      return resolve(id);
    });
  });
};

// cancels one or all watches
function cancelWatch(id) {
  return new Promise(function(resolve, reject) {
    log.debug("Canceling " + (id ? "watch " + id : "all watches"));
    if (!obtainWatchPermission()) {
      return reject(new Error('SecurityError'));
    }

    // cancel all watches
    if (!id) {
      slots.watch.list = {};
      for (var i = 0; i < slots.watch.count; i++) {
        backend.untickPolling('any');
      }
      slots.watch.count = 0;
      return resolve();
    }

    if (slots.watch.list[id]) {
      delete slots.watch.list[id];
      backend.untickPolling('any');
      slots.watch.count--;
      return resolve();
    }

    log.error("Could not find watch: " + id);
    log.debug(slots.watch.list);
    return reject(new Error('NotFoundError'));
  });
};

//  url-pattern = scheme "://" host path
//          scheme      = "*" / "https"
//          host        = "*" / "*." <VCHAR except "/" and "*">
//          path        = "/" <VCHAR>
function validUrlPattern(pattern) {
  log.debug("validUrlPattern checking: " + pattern);
  if (!pattern)
    return true;
  var urlPattern = new RegExp(
    /^(\*|https?):\/\/(\*|\*.[\w-.]+|[\w-.]+)(\/[\w-]*)*$/);
  return urlPattern.test(pattern);
};

function validRecordType(type) {
  log.debug("validRecordType checking: " + type);
  if (!type)
    return true;
  return (type == 'empty' || type == 'text' || type == 'url' ||
          type == 'json' || type == 'opaque');
};

function validMediaType(type) {
  log.debug("validMediaType checking: " + type);
  if (!type)
    return true;
  // Using a more generic pattern for prevalidation instead of
  // "application/*, image/*, audio/*, text/*, multipart/*, video/*, multipart/*"
  var urlPattern = new RegExp(/^[a-zA-Z]+\/[\w-.+]+$/);
  return urlPattern.test(type);
};

function validWatchMode(mode) {
    log.debug("validWatchMode checking: " + mode);
return (mode == 'any' || type == 'web-nfc-only');
};

// =============== Glue code between backend and slots ================

// Check and notify watches
function dispatch(message) {
  for (var id in slots.watch.list) {
    var w = slots.watch.list[id];

    if (w.mode == "web-nfc-only" &&
        !(util.isURL(message.url) && util.matchURL(message.url, w.url))) {
      log.warning("dispatch skipping: not a Web NFC message.");
      continue;
    }

    if (w.recordType) {
      for (var i = message.records.length; i >= 0; i--)
        if (message.records[i].recordType == w.recordType)
          break;
      if (i < 0) {
        log.warning("dispatch skipping: no record type match.");
        continue;
      }
    }

    if (w.mediaType) {
      for (var i = message.records.length; i >= 0; i--)
        if (message.records[i].mediaType == w.mediaType)
          break;

      if (i < 0) {
        log.warning("dispatch skipping: no media type match.");
        continue;
      }
    }

    // Otherwise dispatch the message.
    log.debug("dispatch: invoking watch callback for watch: " + w.id);
    util.invoke(w.callback, message);
  }
};

// ===================== Backend =============================================

backend.configure({
  onreceive: dispatch
});

// ===================== Exports =============================================

module.exports = {
  push: push,
  cancelPush: cancelPush,
  watch: watch,
  cancelWatch: cancelWatch,
  _slots: slots, // debug only
  _backend: backend, // debug only
  _log: log
};

