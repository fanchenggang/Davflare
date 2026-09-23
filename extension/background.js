"use strict";

importScripts("url.js", "bookmarks.js", "dav.js", "quickSave.js");

var MENU_SAVE = "davflare-save-page";
var MENU_MODE = "davflare-toggle-mode";
var CACHE_KEY = "bookmarksCache";

var MESSAGES = {
  en: {
    appTitle: "Davflare",
    errTitle: "Davflare — action failed",
    saveOk: "Bookmark saved to your library.",
    saveExists: "This page is already in your library.",
    skipPage: "Only http(s) pages can be saved.",
    needConfig: "Configure your instance URL and WebDAV credentials in settings first.",
    modeTitle: "Default home view switched",
    modeDrive: "The home page will open your drive.",
    modeBookmarks: "The home page will open your bookmark library.",
  },
  zh: {
    appTitle: "Davflare",
    errTitle: "Davflare — 操作失败",
    saveOk: "已收藏到书签库。",
    saveExists: "该页面已在书签库中。",
    skipPage: "只能收藏 http(s) 页面。",
    needConfig: "请先在设置里配置实例地址与 WebDAV 凭据。",
    modeTitle: "主页默认视图已切换",
    modeDrive: "插件主页将打开网盘。",
    modeBookmarks: "插件主页将打开书签库。",
  },
};

var ERROR_COPY = {
  disabled: { en: "WebDAV is disabled on this instance.", zh: "该实例已关闭 WebDAV。" },
  notConfigured: {
    en: "The server has no WebDAV credentials configured.",
    zh: "服务端未配置 WebDAV 凭据。",
  },
  unauthorized: {
    en: "Wrong WebDAV username or password. Check the settings view in the library page.",
    zh: "WebDAV 用户名或密码错误，请在书签库的设置里检查。",
  },
  network: { en: "Cannot reach the instance.", zh: "无法连接实例。" },
  timeout: {
    en: "The instance timed out (large library or slow network). Try again.",
    zh: "实例响应超时（库较大或网络慢），请重试。",
  },
  conflict: {
    en: "The library changed elsewhere. Please retry.",
    zh: "书签库已在别处更新，请重试。",
  },
  unexpected: {
    en: "Something went wrong while saving. Please retry.",
    zh: "收藏时出错，请重试。",
  },
};

function pickLang() {
  return (navigator.language || "en").toLowerCase().indexOf("zh") === 0 ? "zh" : "en";
}

function t() {
  return MESSAGES[pickLang()];
}

function errorText(kind, detail) {
  var known = ERROR_COPY[kind];
  var base;
  if (known) {
    base = known[pickLang()];
  } else if (kind && String(kind).indexOf("http") === 0) {
    var code = String(kind).slice(4);
    base =
      pickLang() === "zh"
        ? "实例返回了未预期的响应（HTTP " + code + "）。"
        : "Unexpected response from the instance (HTTP " + code + ").";
  } else {
    base =
      pickLang() === "zh"
        ? "实例返回了未预期的响应。"
        : "Unexpected response from the instance.";
  }
  // #75: append throw/message detail on unexpected so QA is not blind.
  if (kind === "unexpected" && detail) {
    var clipped = String(detail).replace(/\s+/g, " ").trim().slice(0, 160);
    if (clipped) base = base + " (" + clipped + ")";
  }
  return base;
}

function flashBadge(text) {
  try {
    chrome.action.setBadgeBackgroundColor({ color: text === "!" ? "#c62828" : "#2e7d32" });
    chrome.action.setBadgeText({ text: text });
    setTimeout(function () {
      chrome.action.setBadgeText({ text: "" });
    }, 2500);
  } catch (err) {
    /* badge is best-effort */
  }
}

function notify(title, message) {
  try {
    chrome.notifications.create(
      "davflare-save-" + String(Date.now()),
      {
        type: "basic",
        iconUrl: chrome.runtime.getURL("icons/icon128.png"),
        title: title,
        message: message,
        priority: 2,
      },
      function () {
        void chrome.runtime.lastError;
      }
    );
  } catch (err) {
    /* notifications are best-effort feedback */
  }
}

function failFeedback(message) {
  flashBadge("!");
  notify(t().errTitle, message);
}

function okFeedback(message) {
  flashBadge("✓");
  notify(t().appTitle, message);
}

async function loadConfig() {
  var sync = await chrome.storage.sync.get(["instanceUrl", "bookmarkPath"]);
  var local = await chrome.storage.local.get(["davUsername", "davPassword"]);
  var merged = mergeSettings(sync);
  return {
    instanceUrl: merged.instanceUrl,
    basePath: merged.bookmarkPath,
    username: typeof local.davUsername === "string" ? local.davUsername : "",
    password: typeof local.davPassword === "string" ? local.davPassword : "",
  };
}

async function readBookmarksCache() {
  var stored = await chrome.storage.local.get([CACHE_KEY]);
  var cache = stored && stored[CACHE_KEY];
  if (!cache || !cache.model) return null;
  return cache;
}

async function writeBookmarksCache(model, etag) {
  // Best-effort like the popup (#73): large libraries can exceed storage
  // quota; never throw into savePage and abort the WebDAV write.
  try {
    var normalized = Bookmarks.normalizeModel(model);
    var payload = {};
    payload[CACHE_KEY] = {
      model: normalized,
      etag: etag || null,
      syncedAt: Date.now(),
      bytes:
        Bookmarks.serializeHtml(normalized).length +
        Bookmarks.modelToJsonText(normalized).length,
    };
    await chrome.storage.local.set(payload);
  } catch (err) {
    /* ignore — remote write must still proceed / report its own result */
  }
}

function parseRemoteLibrary(res) {
  return Bookmarks.parseRemoteLibrary(res);
}

async function toggleDefaultMode() {
  var stored = await chrome.storage.sync.get(["toolbarMode"]);
  var next = mergeSettings(stored).toolbarMode === "bookmarks" ? "drive" : "bookmarks";
  await chrome.storage.sync.set({ toolbarMode: next });
  var copy = t();
  notify(copy.modeTitle, next === "bookmarks" ? copy.modeBookmarks : copy.modeDrive);
}

/**
 * Context-menu / fallback quick-save (#68 / #71 / #73).
 *
 * MV3 service workers are killed if the click listener does not return the
 * async work as a Promise — previously savePage was fire-and-forget, so a
 * large-library GET could be aborted mid-flight with no notification and no
 * write. We prefer the local bookmarksCache (+ etag) for a fast PUT, and on
 * 412 we re-GET the latest etag, merge, and retry PUT once (#71) so a stale
 * If-Match from cache does not leave the user with only a conflict toast.
 *
 * #73: wrap the whole body in try/catch so an unexpected throw after
 * flashBadge("…") still reaches failFeedback (badge + notification) instead
 * of dying silently when the SW tears down a rejected listener Promise.
 * #75: unexpected copy includes err.message; parseRemote prefers JSON so the
 * SW never needs DOMParser for a normal Davflare library GET.
 */
async function savePage(tab) {
  var copy = t();
  flashBadge("…");
  try {
    var url = (tab && tab.url) || "";
    var title = (tab && tab.title) || "";
    if (!Bookmarks.isWebUrl(url)) {
      failFeedback(copy.skipPage);
      return;
    }

    var cfg = await loadConfig();
    if (!cfg.instanceUrl) {
      failFeedback(copy.needConfig);
      return;
    }

    var result = await DavflareQuickSave.saveBookmark(
      {
        client: DavflareDav.createDavClient(cfg),
        Bookmarks: Bookmarks,
        readCache: readBookmarksCache,
        writeCache: writeBookmarksCache,
        parseRemote: parseRemoteLibrary,
      },
      { title: title, url: url, added: Date.now() }
    );

    if (result.ok) {
      okFeedback(result.status === "exists" ? copy.saveExists : copy.saveOk);
      return;
    }
    failFeedback(errorText(result.kind, result.message));
  } catch (err) {
    var detail = err && err.message ? String(err.message) : String(err || "");
    failFeedback(errorText("unexpected", detail));
  }
}

/**
 * #62 P1: the configurable shortcut triggers the same quick-save as the
 * toolbar popup. openPopup() shows that exact dialog; when it is
 * unavailable (older Chrome) or rejects, fall back to the silent
 * context-menu save path.
 */
async function quickSaveCurrentPage() {
  if (typeof chrome.action.openPopup === "function") {
    try {
      await chrome.action.openPopup();
      return;
    } catch (err) {
      /* fall through to the silent save */
    }
  }
  var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs && tabs[0]) await savePage(tabs[0]);
}

chrome.commands.onCommand.addListener(function (command) {
  if (command === "save-current-page") return quickSaveCurrentPage();
});

/* ---------- omnibox (#62 P1): "df <query>" searches the cached library ---------- */

var OMNI_LIMIT = 6;

function xmlEscape(text) {
  return String(text == null ? "" : text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function cachedBookmarksModel() {
  var cache = await readBookmarksCache();
  return cache && cache.model ? cache.model : { bookmarks: [] };
}

function omniDescription(item) {
  var parts = [xmlEscape(item.title || item.url)];
  if (item.tags && item.tags.length) {
    parts.push("<dim>" + xmlEscape(item.tags.join(", ")) + "</dim>");
  }
  parts.push("<url>" + xmlEscape(item.url) + "</url>");
  return parts.join(" ");
}

chrome.omnibox.onInputStarted.addListener(function () {
  chrome.omnibox.setDefaultSuggestion({
    description:
      pickLang() === "zh" ? "搜索 Davflare 书签…" : "Search Davflare bookmarks…",
  });
});

chrome.omnibox.onInputChanged.addListener(async function (text, suggest) {
  var model = await cachedBookmarksModel();
  var matches = Bookmarks.searchBookmarks(model, text, OMNI_LIMIT);
  if (!matches.length) {
    var emptyQ = String(text || "").trim();
    chrome.omnibox.setDefaultSuggestion({
      description:
        pickLang() === "zh"
          ? emptyQ
            ? "在书签库中搜索 “" + emptyQ.replace(/[<>&]/g, "") + "”…"
            : "搜索 Davflare 书签…"
          : emptyQ
            ? "Search library for “" + emptyQ.replace(/[<>&]/g, "") + "”…"
            : "Search Davflare bookmarks…",
    });
    suggest([]);
    return;
  }
  var suggestions = [];
  for (var i = 0; i < matches.length; i++) {
    suggestions.push({
      content: matches[i].url,
      description: omniDescription(matches[i]),
    });
  }
  // 第一条作为默认建议（回车直达），其余进下拉列表；末尾附带「在库中搜索」。
  chrome.omnibox.setDefaultSuggestion({ description: suggestions[0].description });
  var q = String(text || "").trim();
  if (q && suggestions.length) {
    suggestions.push({
      content: "davflare-search:" + q,
      description:
        pickLang() === "zh"
          ? "<dim>在书签库中搜索</dim> " + xmlEscape(q)
          : "<dim>Search library for</dim> " + xmlEscape(q),
    });
  }
  suggest(suggestions.slice(1));
});

chrome.omnibox.onInputEntered.addListener(async function (text, disposition) {
  var target = "";
  if (String(text || "").indexOf("davflare-search:") === 0) {
    // Explicit “search library” suggestion — open filtered library page.
    target = "";
    text = String(text).slice("davflare-search:".length);
  } else if (Bookmarks.isWebUrl(text)) {
    // 用户选中了某条建议：content 即书签 URL。
    target = text;
  } else {
    var model = await cachedBookmarksModel();
    var matches = Bookmarks.searchBookmarks(model, text, 1);
    if (matches.length) target = matches[0].url;
  }
  var open = function (url) {
    if (disposition === "newForegroundTab") chrome.tabs.create({ url: url, active: true });
    else if (disposition === "newBackgroundTab")
      chrome.tabs.create({ url: url, active: false });
    else chrome.tabs.update({ url: url });
  };
  if (target) {
    open(target);
    return;
  }
  // 没有命中：打开书签库并带上搜索词，便于继续筛选。
  var libraryUrl = chrome.runtime.getURL("bookmarks.html");
  var q = String(text || "").trim();
  if (q) {
    libraryUrl += "?q=" + encodeURIComponent(q);
  }
  if (disposition === "newForegroundTab" || disposition === "newBackgroundTab") {
    chrome.tabs.create({ url: libraryUrl, active: disposition === "newForegroundTab" });
  } else {
    chrome.tabs.update({ url: libraryUrl });
  }
});

// Return the Promise from the listener so MV3 keeps the service worker alive
// for the full async write + badge/notification (#68 / #73). Do not fire-and-
// forget savePage — a discarded Promise lets Chrome kill the SW mid-flight.
chrome.contextMenus.onClicked.addListener(function (info, tab) {
  if (info.menuItemId === MENU_MODE) {
    return toggleDefaultMode();
  }
  if (info.menuItemId === MENU_SAVE) {
    return savePage(tab);
  }
});

function ensureContextMenus() {
  var zh = pickLang() === "zh";
  chrome.contextMenus.removeAll(function () {
    void chrome.runtime.lastError;
    chrome.contextMenus.create(
      {
        id: MENU_SAVE,
        title: zh ? "收藏此页到 Davflare" : "Save page to Davflare",
        contexts: ["page"],
      },
      function () {
        void chrome.runtime.lastError;
      }
    );
    chrome.contextMenus.create(
      {
        id: MENU_MODE,
        title: zh ? "切换插件主页默认视图" : "Switch default home view",
        contexts: ["action"],
      },
      function () {
        void chrome.runtime.lastError;
      }
    );
  });
}

chrome.runtime.onInstalled.addListener(ensureContextMenus);
chrome.runtime.onStartup.addListener(ensureContextMenus);
