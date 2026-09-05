"use strict";

var COPY = {
  en: {
    title: "Davflare options",
    tagline: "Open the drive you deployed. No built-in host.",
    urlLabel: "Instance URL",
    urlHint: "Paste the Pages or custom-domain URL of your own Davflare instance.",
    pathLabel: "Bookmark directory",
    pathHint:
      "Relative to /webdav/. Default is \"bookmarks\"; use e.g. \"qa/bookmarks\" to isolate test data. HamHome import always reads /HamHomeSync/bookmarks/meta.json + categories.json.",
    modeLabel: "Default toolbar view",
    modeDrive: "Drive (embedded in extension)",
    modeBookmarks: "Bookmark library",
    modeHint: "Both open the extension page; right-click the toolbar icon to switch anytime.",
    davLabel: "WebDAV credentials",
    userLabel: "Username",
    passLabel: "Password",
    davHint:
      "Stored only on this device. Same values as your deployment's WEBDAV_USERNAME / WEBDAV_PASSWORD.",
    save: "Save",
    testConn: "Test connection",
    testing: "Testing…",
    saved: "Saved.",
    savedNoGrant:
      "Saved, but access to this site was not granted — bookmark features will not work.",
    cleared: "Saved. Toolbar click will open this page until you add a URL.",
    invalid: "Enter an http(s) URL, or leave the field empty.",
    probeOk: "Connected. WebDAV is enabled.",
    probeDisabled: "WebDAV is disabled on this instance (feature switch off).",
    probeNotConfigured: "The server has no WebDAV credentials configured.",
    probeUnauthorized: "Wrong WebDAV username or password.",
    probeNetwork: "Cannot reach the instance. Check the URL.",
    probeOther: "The instance returned an unexpected response.",
  },
  zh: {
    title: "Davflare 选项",
    tagline: "打开你自己部署的网盘。扩展不内置任何站点。",
    urlLabel: "实例地址",
    urlHint: "粘贴你自己的 Pages 或自定义域名。",
    pathLabel: "书签目录",
    pathHint:
      "相对 /webdav/ 的路径。默认为 bookmarks；可填如 qa/bookmarks 隔离测试数据。HamHome 导入固定读 /HamHomeSync/bookmarks/meta.json + categories.json。",
    modeLabel: "工具栏默认视图",
    modeDrive: "网盘（扩展内嵌）",
    modeBookmarks: "书签库",
    modeHint: "两种模式都打开扩展页，只是默认视图不同；随时右键工具栏图标切换。",
    davLabel: "WebDAV 凭据",
    userLabel: "用户名",
    passLabel: "密码",
    davHint: "仅保存在本设备。与你部署时配置的 WEBDAV_USERNAME / WEBDAV_PASSWORD 一致。",
    save: "保存",
    testConn: "测试连接",
    testing: "测试中…",
    saved: "已保存。",
    savedNoGrant: "已保存，但未授权访问该站点，书签功能将不可用。",
    cleared: "已保存。未填写地址时，工具栏点击会打开本页。",
    invalid: "请填写 http(s) 地址，或留空。",
    probeOk: "连接成功，WebDAV 已开启。",
    probeDisabled: "该实例已关闭 WebDAV（功能开关）。",
    probeNotConfigured: "服务端未配置 WebDAV 凭据。",
    probeUnauthorized: "WebDAV 用户名或密码错误。",
    probeNetwork: "无法连接实例，请检查地址。",
    probeOther: "实例返回了未预期的响应。",
  },
};

var PROBE_COPY = {
  disabled: "probeDisabled",
  notConfigured: "probeNotConfigured",
  unauthorized: "probeUnauthorized",
  network: "probeNetwork",
};

function chromeArea(name, seed) {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage[name]) {
    return chrome.storage[name];
  }
  var memory = Object.assign({}, seed);
  return {
    get: function (keys, cb) {
      var out = {};
      (Array.isArray(keys) ? keys : []).forEach(function (key) {
        out[key] = memory[key];
      });
      cb(out);
    },
    set: function (values, cb) {
      Object.assign(memory, values);
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
  document.getElementById("pathLabel").textContent = t.pathLabel;
  document.getElementById("pathHint").textContent = t.pathHint;
  document.getElementById("modeLabel").textContent = t.modeLabel;
  document.getElementById("modeDriveText").textContent = t.modeDrive;
  document.getElementById("modeBookmarksText").textContent = t.modeBookmarks;
  document.getElementById("modeHint").textContent = t.modeHint;
  document.getElementById("davLabel").textContent = t.davLabel;
  document.getElementById("userLabel").textContent = t.userLabel;
  document.getElementById("passLabel").textContent = t.passLabel;
  document.getElementById("davHint").textContent = t.davHint;
  document.getElementById("save").textContent = t.save;
  document.getElementById("testConn").textContent = t.testConn;
  return t;
}

var strings = applyCopy();
var syncStore = chromeArea("sync", { instanceUrl: "", toolbarMode: "drive", bookmarkPath: "bookmarks" });
var localStore = chromeArea("local", { davUsername: "", davPassword: "" });
var form = document.getElementById("form");
var urlInput = document.getElementById("instanceUrl");
var pathInput = document.getElementById("bookmarkPath");
var modeDrive = document.getElementById("modeDrive");
var modeBookmarks = document.getElementById("modeBookmarks");
var userInput = document.getElementById("davUser");
var passInput = document.getElementById("davPass");
var statusEl = document.getElementById("status");
var probeEl = document.getElementById("probeStatus");

function setStatus(message, kind) {
  statusEl.textContent = message || "";
  statusEl.className = "status" + (kind ? " " + kind : "");
}

function setProbe(message, kind) {
  probeEl.textContent = message || "";
  probeEl.className = "status" + (kind ? " " + kind : "");
}

function loadSettings() {
  syncStore.get(["instanceUrl", "toolbarMode", "bookmarkPath"], function (stored) {
    var merged = mergeSettings(stored);
    urlInput.value = merged.instanceUrl;
    pathInput.value = merged.bookmarkPath;
    (merged.toolbarMode === "bookmarks" ? modeBookmarks : modeDrive).checked = true;
  });
  localStore.get(["davUsername", "davPassword"], function (stored) {
    userInput.value = typeof stored.davUsername === "string" ? stored.davUsername : "";
    passInput.value = typeof stored.davPassword === "string" ? stored.davPassword : "";
  });
}

function selectedMode() {
  return modeBookmarks.checked ? "bookmarks" : "drive";
}

async function ensureOriginPermission(instanceUrl) {
  if (!instanceUrl || typeof chrome === "undefined" || !chrome.permissions) {
    return { granted: true, skipped: true };
  }
  var origin;
  try {
    origin = new URL(instanceUrl).origin + "/*";
  } catch (err) {
    return { granted: true, skipped: true };
  }
  try {
    if (await chrome.permissions.contains({ origins: [origin] })) {
      return { granted: true };
    }
    var granted = await chrome.permissions.request({ origins: [origin] });
    return { granted: Boolean(granted) };
  } catch (err) {
    return { granted: false };
  }
}

form.addEventListener("submit", function (event) {
  event.preventDefault();
  var raw = urlInput.value;
  var normalized = normalizeInstanceUrl(raw);
  if (raw.trim() && !normalized) {
    setStatus(strings.invalid, "err");
    urlInput.focus();
    return;
  }
  syncStore.set(
    {
      instanceUrl: normalized,
      toolbarMode: selectedMode(),
      bookmarkPath: sanitizeBookmarkPath(pathInput.value),
    },
    function () {
      localStore.set(
        { davUsername: userInput.value.trim(), davPassword: passInput.value },
        async function () {
          urlInput.value = normalized;
          pathInput.value = sanitizeBookmarkPath(pathInput.value);
          var perm = await ensureOriginPermission(normalized);
          if (!normalized) setStatus(strings.cleared, "ok");
          else if (perm.granted) setStatus(strings.saved, "ok");
          else setStatus(strings.savedNoGrant, "err");
        }
      );
    }
  );
});

document.getElementById("testConn").addEventListener("click", async function () {
  var url = normalizeInstanceUrl(urlInput.value);
  if (!url) {
    setStatus(strings.invalid, "err");
    urlInput.focus();
    return;
  }
  setProbe(strings.testing);
  var client = DavflareDav.createDavClient({
    instanceUrl: url,
    username: userInput.value.trim(),
    password: passInput.value,
  });
  var res = await client.probe();
  if (res.ok) {
    setProbe(strings.probeOk, "ok");
    return;
  }
  var key = PROBE_COPY[res.kind];
  setProbe(key ? strings[key] : strings.probeOther, "err");
});

loadSettings();
