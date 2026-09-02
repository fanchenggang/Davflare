"use strict";

importScripts("url.js");

chrome.action.onClicked.addListener(function () {
  chrome.storage.sync.get(["instanceUrl", "newTab"], function (stored) {
    var target = resolveToolbarTarget(mergeSettings(stored));
    if (target.action === "open") {
      chrome.tabs.create({ url: target.url });
      return;
    }
    chrome.runtime.openOptionsPage();
  });
});
