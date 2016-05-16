//"use strict";

var DBus = require('dbus');
var dbus = new DBus();
var util = require('./nfc-util');
var log = require('./nfc-log')("[neard] ", "error");

var exports = module.exports = {
// Main client callbacks.
  onreceive: null,  // For dispatching received NFCMessage.

  // Low level callbacks (mainly for debugging or special use cases).
  onadapterenabled: null,
  onadapterdisabled: null,
  ontagadded: null,
  ontagremoved: null,
  ondeviceadded: null,
  ondeviceremoved: null,
  onrecordadded: null,

  // Expose logging for changing log levels.
  _log: log
};

var neard = {
  // private properties
  bus: null,
  manager: null,
  adapter: null,
  adapterName: null,
  enabled: false,
  device: null,  // DBUS interface of current device in proximity.
  tag: null,  // DBUS interface of current tag in proximity.

  polling: null,  // null, 'tag', 'peer', 'any'
  tagPollCount: 0,  // number of clients on tags
  peerPollCount: 0,  // number of clients on peers

  inbox: {
    message: {
      data: [],
      url: ""
    },
    timeout: 0,  // 0 means no timer is used in receiveRecord()
    timer: null
  },

  outbox: {
    records: null,  // in neard format
    target: 'any',
    ignoreRead: false,
    timeout: 5000,
    timer: null,
    callback: null,
    pushInProgress: false
  }
};

/**
 * Register callbacks.
 */
exports.configure = function(options) {
  if (!options)
    return;

  if (options.onreceive instanceof Function)
    exports.onreceive = options.onreceive;

  if (options.onadapterenabled instanceof Function)
    exports.onadapterenabled = options.onadapterenabled;

  if (options.onadapterdisabled instanceof Function)
    exports.onadapterdisabled = options.onadapterdisabled;

  if (options.ontagadded instanceof Function)
    exports.ontagadded = options.ontagadded;

  if (options.ondeviceadded instanceof Function)
    exports.ondeviceadded = options.ondeviceadded;

  if (options.ondeviceremoved instanceof Function)
    exports.ondeviceremoved = options.ondeviceremoved;

  if (options.onrecordadded instanceof Function)
    exports.onrecordadded = options.onrecordadded;

};

exports.pushInProgress = function() {
  return neard.outbox.pushInProgress;
}

exports.setPush = function(records, target, timeout, ignoreRead, callback) {
  log.debug("setPush called");

  if (neard.outbox.records && neard.outbox.target) {
    log.debug("Replacing previous push.");
    // Just untick, no poll check yet.
    decrementPollCount(neard.outbox.target, callback);
  }

  neard.outbox.records = records;
  neard.outbox.target = target;
  neard.outbox.timeout = timeout || 0;
  neard.outbox.ignoreRead = ignoreRead;
  neard.outbox.callback = callback;

  incrementPollCount(target);
  updatePolling(callback);
};

exports.resetPush = function(callback) {
  log.debug("resetPush called");
  neard.outbox.records = null;
  neard.outbox.timeout = 0;
  neard.outbox.ignoreRead = false;
  neard.outbox.callback = null;
  exports.untickPolling(neard.outbox.target);
  neard.outbox.target = null;
  util.invoke(callback);
}

exports.addTextRecord = function(records, data) {
  var record = {
    Type: 'Text',
    Encoding: 'UTF-8',
    Language: 'enUS',
    Representation: data
  };

  log.debug("Adding text record: ", record);
  records.unshift(record);

  return records;
};

exports.addUriRecord = function(records, data) {
  var record = {
    Type: 'URI',
    URI: data
  };

  log.debug("Adding URI record: ", record);
  records.unshift(record);

  return records;
};

exports.addMediaRecord = function(records, data, type) {
/*
  var record = {
    Type: "MIME",
    MIME: type
  };
  log.debug("Adding media record..."); log.debug(record);
  records.unshift(record);
  return records;
*/
  // neard doesn't support media tags yet, use text tags
  return addTextRecord(records, JSON.stringify(message));
};

exports.addWebNfcRecord = function(records, url) {
  // External type records are not supported by neard. Do nothing.
  log.debug("Adding Web NFC record. (none)");
  return records;
};


// ~~~~~~~~~~~~~~~~~~~~~~~~~~ Polling ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

 exports.tickPolling = function(target, callback) {
  incrementPollCount(target);
  updatePolling(callback);
};

exports.untickPolling = function(target, callback) {
  decrementPollCount(target);
  updatePolling(callback);
};

function incrementPollCount(target) {
  if (target == 'tag' || target == 'any') {
    neard.tagPollCount++;
  }

  if (target == 'peer' || target == 'any')
    neard.peerPollCount++;
}

function decrementPollCount(target) {
  if ((target == 'tag' || target == 'any') && neard.tagPollCount > 0)
    neard.tagPollCount--;

  if ((target == 'peer' || target == 'any') && neard.peerPollCount > 0)
    neard.peerPollCount--;
}

function updatePolling(callback) {
  var oldValue = neard.polling;

  if (neard.tagPollCount > 0 && neard.peerPollCount > 0)
    neard.polling = 'any';
  else if (neard.tagPollCount > 0)
    neard.polling = 'tag';
  else if (neard.peerPollCount > 0)
    neard.polling = 'peer';
  else
    neard.polling = 'none';

  log.debug("neard.tagPollCount: " + neard.tagPollCount);
  log.debug("neard.peerPollCount: " + neard.peerPollCount);

  if(neard.polling != oldValue) {
    log.debug("update neard.polling from: '" + oldValue + "' to: " + neard.polling);
    checkPolling(callback);
  }
};

// neard cancels polling after reading a tag or a device; re-enable is needed
function checkPolling(callback) {
  log.debug("checkPolling called, neard.polling = " + neard.polling);

  if (neard.enabled) {
    setPolling(neard.polling, callback);
    return;
  }

  enableAdapter(function(err) {
    if (err) {
      util.invoke(callback, err);
      return;
    }
    setPolling(neard.polling, callback);
  });
};

// @mode can be "none" or null, tag", "peer", or "any" (default)
function setPolling(mode, callback) {
  if (!neard.adapter) {
    log.error("setPolling: no NFC adapter.");
    return;
  }

  // The 'Polling' property is only valid for Initiator mode.
  // So check the NFC radio Mode: Initiator, Target, or Idle.
  neard.adapter.getProperty('Mode', function(err, value) {
    if (err) {
      log.error("setPolling: could not get NFC adapter polling mode.")
      util.invoke(callback, err);
      return;
    }

    var on = mode && (mode != 'none');

    if (on == (value != 'Idle')) {  // do nothing
      log.debug("NFC polling is already " + (on ? "on." : "off."));
      util.invoke(callback);
      return;
    }

    if (!on && value != 'Idle') {  // stop polling
      neard.adapter.StopPollLoop['timeout'] = 5000;

      neard.adapter.StopPollLoop['error'] = function(err) {
        if (err) {
          log.error("setPolling: stopping polling failed: ", err);
          util.invoke(callback, err);
        }
      };

      neard.adapter.StopPollLoop['finish'] = function() {
        neard.polling = null;
        log.debug("NFC polling stopped.");
        util.invoke(callback);
      };

      neard.adapter.StopPollLoop();
    }

    // Otherwise (on && value == 'Idle') is true, so switch on polling.
    neard.adapter.StartPollLoop['timeout'] = 5000;

    neard.adapter.StartPollLoop['error'] = function(err) {
      if (err) {
        log.error("setPolling: starting polling failed: ", err);
        util.invoke(callback, err);
      }
    };

    neard.adapter.StartPollLoop['finish'] = function() {
      neard.polling = mode;
      log.debug("NFC polling started in '" + mode + "' mode.");
      util.invoke(callback);
    };

    // TODO: set the exact polling mode. For always now use 'Dual'.
    neard.adapter.StartPollLoop('Dual');
    return;
  });
};

// ~~~~~~~~~~~~~~~~ Initializing, signal handling ~~~~~~~~~~~~~~~~~~~~~~~~~~~~

function init(callback) {
  if (neard.bus && neard.manager) {
    log.debug("neard already initialized.");
    util.invoke(callback);
    return;
  }

  neard.bus = dbus.getBus('system');

  neard.bus.getInterface(
    'org.neard',
    '/',
    'org.freedesktop.DBus.ObjectManager',
    function(err, iface) {
      if (err) {
        log.error("Could not get NFC Manager.");
        log.debug(err);
        util.invoke(callback, err);
        return;
      }
      log.debug("NFC Manager found.");
      neard.manager = iface;
      onsignal();
      util.invoke(callback);
    });
};

// When a device comes up, check if push was requested and if yes, flush.
// If ignoreRead is on, don't dispatch the read content.
function ondevice(objPath, callback) {
  neard.bus.getInterface('org.neard', objPath, 'org.neard.Device',
    function(err, iface) {
      if (err) {
        log.error("ondevice: could not get Device interface " + objPath);
        util.invoke(callback, err);
        return;
      }
      neard.device = iface;
      iface.getProperties(function(err, props) {
        if (!err) {
          log.debug('Device properties:', props);
          util.invoke(callback, null, props);
        }
      });
      flush();
    });
};

function ontag(objPath, callback) {
  neard.bus.getInterface('org.neard', objPath, 'org.neard.Tag',
    function(err, iface) {
      if (err) {
        log.error("ontag: could not get Tag interface " + objPath);
        util.invoke(callback, err);
        return;
      }
      neard.tag = iface;
      iface.getProperties(function(err, props) {
        if (!err) {
          util.invoke(callback, null, props);
        }
      });
      flush();
    });
};


function onrecord(objPath, callback) {
  neard.bus.getInterface('org.neard', objPath, 'org.neard.Record',
    function(err, iface) {
      if (err) {
        log.error("Could not get Record interface ", objPath, "; ", err);
        return util.invoke(callback, err);
      }

      if (neard.outbox.pushInProgress && neard.outbox.ignoreRead) {
        log.info("NFC record read ignored.");
        return;
      }

      iface.getProperties(function(err, props) {
        if(err) {
          log.error("Could not get record properties.");
          return util.invoke(callback, err);
        }
        var record = processRecord(props, objPath);
        receiveRecord(record);
        util.invoke(callback, null, record);
      });
    });
};

function onsignal() {
  if (!neard.manager) {
    log.error("onsignal: no NFC manager.")
    return;
  }

  neard.manager.on('InterfacesAdded', function(iface) {
    if (matchAdapterInterface(iface)) {
      enableAdapter(exports.onadapterenabled);
      return;
    }

    if (iface.match('^\/org\/neard\/nfc[0-9]+\/device[0-9]+\/tag[0-9]+$')) {
      log.debug("Pushed tag path found: " + iface);
      ontag(iface, exports.ontagadded);
      return;
    }

    if (iface.match('^\/org\/neard\/nfc[0-9]+\/device[0-9]+$')) {
      log.debug("Device path found: " + iface);
      ondevice(iface, exports.ondeviceadded);
      return;
    }

    if (iface.match('^\/org\/neard\/nfc[0-9]+\/tag[0-9]+\/record[0-9]+$')) {
      log.debug("Record path found: " + iface);
      onrecord(iface, exports.onrecordadded);
      return;
    }

    if (iface.match('^\/org\/neard\/nfc[0-9]+\/tag[0-9]+$')) {
      log.debug("Tag path found: " + iface);
      ontag(iface, exports.ontagadded);
      return;
    }

    log.debug("neard interface added: " + iface);
  });

  neard.manager.on('InterfacesRemoved', function(iface) {
    if (matchAdapterInterface(iface)) {
      log.debug("NFC adapter removed: " + iface);
      if (iface == neard.adapterName) {
        neard.adapter = null;
        neard.adapterName = null;
        util.invoke(exports.onadapterdisabled);
      }
      return;
    }

    if (iface.match('^\/org\/neard\/nfc[0-9]+\/device[0-9]+\/tag[0-9]+$')) {
      log.debug("Pushed tag path removed: " + iface);
      neard.tag = null;
      checkPolling(function(err) {
          util.invoke(exports.ondeviceremoved);
      });
    }

    if (iface.match('^\/org\/neard\/nfc[0-9]+\/device[0-9]+$')) {
      log.debug("Device path removed: " + iface);
      neard.device = null;
      checkPolling(function(err) {
          util.invoke(exports.ondeviceremoved);
      });
      return;
    }

    if (iface.match('^\/org\/neard\/nfc[0-9]+\/tag[0-9]+\/record[0-9]+$')) {
      log.debug("Record path removed: " + iface);
      return;
    }

    if (iface.match('^\/org\/neard\/nfc[0-9]+\/tag[0-9]+$')) {
      log.debug("Tag path removed: " + iface);
      neard.tag = null;
      checkPolling(function(err) {
          util.invoke(exports.ontagremoved);
      });
      return;
    }

    log.debug("neard interface removed: " + iface);
  });
};

// ~~~~~~~~~~~~~~~~~~~~~~~~~~ Adapter ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

function getAdapter(callback) {
  if (neard.adapter) {
    util.invoke(callback);
    return;
  }

  if (!neard.manager || !neard.bus) {
    log.error("getAdapter(): no NFC manager.");
    util.invoke(callback, new Error('NotFoundError'));
    return;
  }

  neard.adapterName = null;

  neard.manager.GetManagedObjects['timeout'] = 5000;
  neard.manager.GetManagedObjects['error'] = function(err) {
    if (err) {
      log.error("getAdapter: GetManagedObjects failed.");
      log.debug(err);
      util.invoke(callback, err);
      return;
    }
  };

  neard.manager.GetManagedObjects['finish'] = function(objects) {
    for (var name in objects) {
      if (!matchAdapterInterface(name) || !objects[name]) {
        continue;
      }

      neard.adapterName = name;

      neard.bus.getInterface('org.neard', name, 'org.neard.Adapter',
        function(err, iface) {
          if (err) {
            log.error("getAdapter: could not get interface for " + name);
            neard.adapterName = null;
            util.invoke(callback, err);
            return;
          }
          log.debug("NFC adapter found: " + name);
          neard.adapter = iface;
          neard.adapterName = name;
          util.invoke(callback);
        });
    }

    if (!neard.adapterName) {
      log.error("getAdapter: could not find NFC adapters.")
      util.invoke(callback, new Error('NotFoundError'));
    }
  };

  neard.manager.GetManagedObjects();
};

function matchAdapterInterface(name) {
  return name.match('^\/org\/neard\/nfc[0-9]+$');
}

function enableAdapter(callback) {
  if (neard.adapter && neard.enabled) {
    log.debug("NFC adapter already enabled.");
    util.invoke(callback);
    return;
  }

  if (neard.adapter) {
    setAdapterEnabled(true, callback);
    return;
  }

  if (!neard.bus || !neard.manager || !neard.adapter) {
    init(function(err) {
      if (err) {
        log.debug("Cannot initialize neard: " + err);
        util.invoke(callback, err);
        return;
      }

      getAdapter(function(err) {
        if (err) {
          log.error("enableAdapter: cannot get NFC adapter: " + err);
          util.invoke(callback, err);
          return;
        }

        setAdapterEnabled(true, callback);
      });
    });
  }
};

function disableAdapter(callback) {
  if (neard.adapter && !neard.enabled) {
    log.debug("NFC adapter already disabled.");
    return;
  }

  if (neard.adapter) {
    setAdapterEnabled(false, callback);
    return;
  }

  util.invoke(callback, "disableAdapter: no NFC adapter started yet.");
  return;
};

function setAdapterEnabled(on, callback) {
  neard.adapter.getProperty('Powered', function(err, value) {
    if (err) {
      log.error("setAdapterEnabled: could not get NFC adapter power state.")
      util.invoke(callback, err);
      return;
    }
    neard.adapter.powered = value;
    if (value == on) {
      log.debug("NFC adapter already " + (on ? "on." : "off."));
      neard.enabled = on;
      util.invoke(callback);
      return;
    }
    neard.adapter.setProperty('Powered', (on ? true : false), function(err) {
      if (err) {
        log.error("setAdapterEnabled: could not power " +
            (on ? "on " : "off ") + " adapter.");
        util.invoke(callback, err);
        return;
      }
      neard.enabled = on;
      log.debug("NFC adapter " + (on ? "enabled." : "disabled."));
      util.invoke(callback);
    });
  });
};

// ~~~~~~~~~~~~~~~~~~~~~~~~~ Push ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// Gets called by neard layer when a tag or device is in proximity range.
function flush(callback) {
  if (!neard.adapter) {
    log.error("flush: no NFC adapter.");
    util.invoke(callback, new Error('NotFoundError'));
    return;
  }

  var neardMethod = null;
  if (neard.tag && neard.outbox.records) {
    neardMethod = writeTag;
  }

  if (neard.device && neard.outbox.records) {
    neardMethod = peerPush;
  }

  if (!(neardMethod instanceof Function) ||
      !neard.outbox.records ||
      !(neard.outbox.records instanceof Array) ||
      neard.outbox.records.length < 1) {
    log.debug("Nothing to send.");
    util.invoke(neard.outbox.callback, new Error(""));
    util.invoke(callback);
    return;
  }

  neard.outbox.pushInProgress = true;
  neardMethod(neard.outbox.records, callback);
}

function writeTag(records, callback) {
  if (!neard.tag) {
    log.error("writeTag: no tag interface.");
    util.invoke(callback, new Error('NotFoundError'));
    return;
  }

  var record = records[0];
  log.debug("Writing tag: ", record);

  neard.outbox.pushInProgress = true;

  neard.tag.Write['timeout'] = 5000;
  neard.tag.Write['error'] = function(err) {
    if (err) {
      log.error("writeTag failed." + err);
      neard.outbox.pushInProgress = false;
      util.invoke(callback, err);
    }
  };

  neard.tag.Write['finish'] = function() {
    log.debug("Writing tag finished.");
    neard.outbox.pushInProgress = false;
    checkPolling(callback);
  };

  neard.tag.Write(record);
};

function peerPush(records, callback) {
  if (!neard.device) {
    log.error("peerPush: no device interface.");
    util.invoke(callback, new Error('NotFoundError'));
    return;
  }

  var record = records[0];
  log.debug("Pushing tag: ", record);

  neard.outbox.pushInProgress = true;

  neard.device.Push['timeout'] = 5000;
  neard.device.Push['error'] = function(err) {
    if (err) {
      log.error("NFC peer push failed." + err);
      neard.outbox.pushInProgress = false;
      util.invoke(callback, err);
    }
  };

  neard.device.Push['finish'] = function() {
    log.debug("Sending tag to peer device finished.");
    neard.outbox.pushInProgress = false;
    checkPolling(callback);
  };

  neard.device.Push(record);
};

// ~~~~~~~~~~~~~~~~~~~~~~~~ Receiving ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

/**
 * Add the record to the message in receiving.
 */
function receiveRecord(record) {
  // TODO: check if it's a Web NFC record, and add receivedMessage.url

  // TODO: check how do we know which is the last record:
  //   when the tag is lost it's a bit late to dispatch

  neard.inbox.message.data.push(record);

  if (!neard.inbox.timer && neard.inbox.timeout) {
    neard.inbox.timer = setTimeout(function() {
      notifyMessage();
      neard.inbox.timer = null;
    }, neard.inbox.timeout);
  } else {
    notifyMessage();
  }
};

function notifyMessage() {
  var message = {
    data: neard.inbox.message.data,
    url: ""
  };

  util.invoke(neard.onreceive, null, message);

  neard.inbox.message.data = [];
};

/**
 * Translate backend records into WebNFC records
 * @recordPath is not used (only one adapter is supported)
 * enum NFCRecordType { "empty", "text", "url", "json", "opaque" };
 * neard only works with Text and URI tags at the moment
 */
function processRecord(props, recordPath) {
  var record = {
    recordType: null,
    mediaType: null,
    data: null
  };
  var encoding, language;
  for (var p in props) {
    switch(p) {
      case 'Type':
        var type = props[p];
        switch(type) {
          case 'Text':
            record.recordType = 'text';
            break;
          case 'URI':
            record.recordType = 'url';
            break;
          case 'MIME':  // RFC 2046
            record.recordType = 'opaque';
            break;
          case 'SmartPoster':
          case 'AAR':  // Android Application Record
          case 'HandoverRequest':
          case 'HandoverCarrier':
          case 'HandoverSelect':
          default:
            record.recordType = 'empty';
        }
        break;
      case 'Encoding':
        encoding = props[p];
        break;
      case 'Language':
        language = props[p];
        break;
      case 'Representation':  // data for text tags
      case 'URI':  // data for URL tags
        record.data = props[p];
        record.mediaType = 'text/plain';
        break;
      case 'MIME':
        record.mediaType = props[p];
        break;
      case 'MIMEPayload':  // data for media tags
        record.data = new Buffer(props[p]);
        break;
      case 'Size':
      case 'Action':
      case 'AndroidPackage':
    }
  }
  log.debug("record processed", record);
  return record;
};
