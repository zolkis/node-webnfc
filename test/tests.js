
//"use strict";

var util = require('../lib/nfc-util');
var log = require('../lib/nfc-log')("[test] ", "info");
var nfc = require('../index');

function watchTest(timeout) {
  var watchId = null;

  var timer = setTimeout(function() {
    if (watchId) {
      nfc.cancelWatch(watchId).then(function() {
        log.info("Watch '" + watchId + "' canceled.");
        process.exit();
      }).catch(function(err) {
        log.error("Cannot cancel watch " + watchId);
      });
    }
  }, timeout);

  installWatch("text").then(function(id){
    watchId = id;
    log.info("Watch '" + id + "' installed.");
  }).catch(function(err) {
    log.error("Could not install watch. " + err);
  });
};

function installWatch(recordType, mediaType) {
  var watchOptions = {
    mode: "any",
    recordType: recordType,
    mediaType: mediaType
  };

  return nfc.watch(function(message) {
      log.info("Received NFC message : "); log.info(message);
    }, watchOptions);
};

const pushTestText = [
  'Text 1 from neard',  // becomes Text tag
  '{ prop1: "value1", prop2: 10 }',  // becomes Text tag
  'http://www.w3.org',  // becomes URI tag
  'http://www.intel.com'  // becomes URI tag
];

function pushTest(data, mode, ignoreRead) {
  if (!data) {
    var i = Math.floor(Math.random() * pushTestText.length);
    data = pushTestText[i];
  }

  log.info("Push test: '" + data + "'");

  nfc.push(data, { target: mode, ignoreRead: ignoreRead }).then(function() {
    log("Push finished.");
  }, function(err) {
    log.error("Push failed: " + err);
  });
};


nfc._log.setLevel('debug');
nfc._backend._log.setLevel('debug');

watchTest(60000);

// pushTest(null, 'any', true);  // push randomly selected data to tag or peer

// override the previous
// pushTest('http://www.npmjs.org', 'tag', true);  // becomes URI record
