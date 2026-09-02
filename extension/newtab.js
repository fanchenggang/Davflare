"use strict";

chrome.storage.sync.get(["instanceUrl", "newTab"], function (stored) {
  var target = resolveNewTabTarget(mergeSettings(stored));
  location.replace(target.url || DEFAULT_NTP);
});
