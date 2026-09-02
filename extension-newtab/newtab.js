"use strict";

chrome.storage.sync.get(["instanceUrl"], function (stored) {
  var target = resolveNewTabTarget(mergeSettings(stored));
  location.replace(target.url || DEFAULT_NTP);
});
