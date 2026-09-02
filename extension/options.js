"use strict";

var COPY = {
  en: {
    title: "Davflare options",
    tagline: "Open the drive you deployed. No built-in host.",
    urlLabel: "Instance URL",
    urlHint: "Paste the Pages or custom-domain URL of your own Davflare instance.",
    newTabLabel: "Use Davflare as new tab",
    newTabHint: "Off by default. Chrome’s usual new tab stays when this is off.",
    save: "Save",
    saved: "Saved.",
    cleared: "Saved. Toolbar click will open this page until you add a URL.",
    invalid: "Enter an http(s) URL, or leave the field empty.",
  },
  zh: {
    title: "Davflare 选项",
    tagline: "打开你自己部署的网盘。扩展不内置任何站点。",
    urlLabel: "实例地址",
    urlHint: "粘贴你自己的 Pages 或自定义域名。",
    newTabLabel: "用 Davflare 作为新标签页",
    newTabHint: "默认关闭。关闭时仍使用 Chrome 自带的新标签页。",
    save: "保存",
    saved: "已保存。",
    cleared: "已保存。未填写地址时，工具栏点击会打开本页。",
    invalid: "请填写 http(s) 地址，或留空。",
  },
};

function storageArea() {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
    return chrome.storage.sync;
  }
  var memory = { instanceUrl: "", newTab: false };
  return {
    get: function (keys, cb) {
      cb({ instanceUrl: memory.instanceUrl, newTab: memory.newTab });
    },
    set: function (values, cb) {
      if (typeof values.instanceUrl === "string") memory.instanceUrl = values.instanceUrl;
      if (typeof values.newTab === "boolean") memory.newTab = values.newTab;
      if (cb) cb();
    },
  };
}

function applyCopy() {
  var lang = (navigator.language || "en").toLowerCase().indexOf("zh") === 0 ? "zh" : "en";
  var t = COPY[lang];
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.title = t.title;
  document.getElementById("tagline").textContent = t.tagline;
  document.getElementById("urlLabel").textContent = t.urlLabel;
  document.getElementById("urlHint").textContent = t.urlHint;
  document.getElementById("newTabLabel").textContent = t.newTabLabel;
  document.getElementById("newTabHint").textContent = t.newTabHint;
  document.getElementById("save").textContent = t.save;
  return t;
}

var strings = applyCopy();
var store = storageArea();
var form = document.getElementById("form");
var urlInput = document.getElementById("instanceUrl");
var newTabInput = document.getElementById("newTab");
var statusEl = document.getElementById("status");

function setStatus(message, kind) {
  statusEl.textContent = message || "";
  statusEl.className = "status" + (kind ? " " + kind : "");
}

store.get(["instanceUrl", "newTab"], function (stored) {
  var settings = mergeSettings(stored);
  urlInput.value = settings.instanceUrl;
  newTabInput.checked = settings.newTab === true;
});

form.addEventListener("submit", function (event) {
  event.preventDefault();
  var raw = urlInput.value;
  var normalized = normalizeInstanceUrl(raw);
  if (raw.trim() && !normalized) {
    setStatus(strings.invalid, "err");
    urlInput.focus();
    return;
  }
  var next = {
    instanceUrl: normalized,
    newTab: newTabInput.checked === true,
  };
  store.set(next, function () {
    urlInput.value = next.instanceUrl;
    setStatus(next.instanceUrl ? strings.saved : strings.cleared, "ok");
  });
});
