"use strict";

importScripts("url.js", "bookmarks.js", "dav.js", "quickSave.js");

var MENU_SAVE = "davflare-save-page";
var MENU_SAVE_LINK = "davflare-save-link";
var MENU_MODE = "davflare-toggle-mode";
var CACHE_KEY = "bookmarksCache";

/* Edge panel (round 4): one dynamic content-script registration whose
   matches list mirrors the origins the user enabled from the popup. */
var EDGE_SCRIPT_ID = "davflare-edge-panel";
var EDGE_ORIGINS_KEY = "edgePanelOrigins";

var MESSAGES = {
  en: {
    appTitle: "Davflare",
    errTitle: "Davflare — action failed",
    saveOk: "Bookmark saved to your library.",
    saveExists: "This page is already in your library.",
    saveRestored: "Restored from the trash.",
    skipPage: "Only http(s) pages can be saved.",
    needConfig: "Configure your instance URL and WebDAV credentials in settings first.",
    modeTitle: "Default home view switched",
    modeDrive: "The home page will open your drive.",
    modeBookmarks: "The home page will open your bookmark library.",
    edgeNeedEnable:
      "Enable the in-page save panel for this site from the popup first.",
    edgeUnsupported: "The in-page save panel needs a newer Chrome.",
    edgeUnavailable: "This page cannot host the save panel.",
  },
  zh: {
    appTitle: "Davflare",
    errTitle: "Davflare — 操作失败",
    saveOk: "已收藏到书签库。",
    saveExists: "该页面已在书签库中。",
    saveRestored: "已从回收站恢复。",
    skipPage: "只能收藏 http(s) 页面。",
    needConfig: "请先在设置里配置实例地址与 WebDAV 凭据。",
    modeTitle: "主页默认视图已切换",
    modeDrive: "插件主页将打开网盘。",
    modeBookmarks: "插件主页将打开书签库。",
    edgeNeedEnable: "请先在弹窗里为本站点启用页面内收藏面板。",
    edgeUnsupported: "页面内收藏面板需要较新版本的 Chrome。",
    edgeUnavailable: "当前页面无法使用收藏面板。",
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
 * Pure save core shared by the context menus, the shortcut fallback and the
 * in-page edge panel (round 4). Validation results and quickSave outcomes all
 * come back as {ok, …}; callers decide how to present them. No badge /
 * notification side effects here so the edge panel can show its own result.
 */
async function performSave(title, url, extra) {
  if (!Bookmarks.isWebUrl(url)) return { ok: false, kind: "skipPage" };
  var cfg = await loadConfig();
  if (!cfg.instanceUrl) return { ok: false, kind: "needConfig" };
  var page = { title: title || "", url: url, added: Date.now() };
  if (extra) {
    if (typeof extra.folder === "string" && extra.folder) page.folder = extra.folder;
    if (Array.isArray(extra.tags) && extra.tags.length) page.tags = extra.tags;
    if (typeof extra.note === "string" && extra.note) page.note = extra.note;
  }
  return DavflareQuickSave.saveBookmark(
    {
      client: DavflareDav.createDavClient(cfg),
      Bookmarks: Bookmarks,
      readCache: readBookmarksCache,
      writeCache: writeBookmarksCache,
      parseRemote: parseRemoteLibrary,
    },
    page
  );
}

/** Human-readable one-liner for a performSave result (both feedback paths). */
function describeResult(result) {
  var copy = t();
  if (result.ok) {
    if (result.status === "exists") return copy.saveExists;
    if (result.status === "restored") return copy.saveRestored; // trash revive (#130)
    return copy.saveOk;
  }
  if (result.kind === "skipPage") return copy.skipPage;
  if (result.kind === "needConfig") return copy.needConfig;
  return errorText(result.kind, result.message);
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
async function saveToLibrary(title, url) {
  flashBadge("…");
  try {
    var result = await performSave(title, url);
    if (result.ok) {
      okFeedback(describeResult(result));
      return;
    }
    failFeedback(describeResult(result));
  } catch (err) {
    var detail = err && err.message ? String(err.message) : String(err || "");
    failFeedback(errorText("unexpected", detail));
  }
}

async function savePage(tab) {
  return saveToLibrary((tab && tab.title) || "", (tab && tab.url) || "");
}

/** Round 4: "Save link to Davflare" — title from the link text, url from href. */
async function saveLink(info) {
  var url = (info && info.linkUrl) || "";
  var text = info && typeof info.linkText === "string" ? info.linkText.trim() : "";
  return saveToLibrary(text || url, url);
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
  if (command === "toggle-edge-panel") return toggleEdgePanel();
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
  if (info.menuItemId === MENU_SAVE_LINK) {
    return saveLink(info);
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
        id: MENU_SAVE_LINK,
        title: zh ? "收藏链接到 Davflare" : "Save link to Davflare",
        contexts: ["link"],
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

chrome.runtime.onInstalled.addListener(function () {
  ensureContextMenus();
  ensureEdgeRegistration();
});
chrome.runtime.onStartup.addListener(function () {
  ensureContextMenus();
  ensureEdgeRegistration();
});

/* ---------- in-page edge save panel (round 4) ----------
 *
 * Permission model: nothing is injected until the user enables a site from
 * the popup. Enabling requests the optional host permission for that origin
 * (inside the popup click gesture) and registers ONE dynamic content script
 * whose matches list mirrors chrome.storage.local.edgePanelOrigins.
 * Disabling re-registers without the origin (unregisters entirely when the
 * list empties) — revocation is real, not a UI hint.
 */

function edgePanelSupported() {
  return Boolean(
    chrome.scripting &&
      typeof chrome.scripting.registerContentScripts === "function" &&
      typeof chrome.scripting.getRegisteredContentScripts === "function"
  );
}

function originPatternOf(pageUrl) {
  try {
    return new URL(pageUrl).origin + "/*";
  } catch (err) {
    return "";
  }
}

async function readEdgeOrigins() {
  var stored = await chrome.storage.local.get([EDGE_ORIGINS_KEY]);
  var list = stored && stored[EDGE_ORIGINS_KEY];
  if (!Array.isArray(list)) return [];
  return list.filter(function (o) {
    return typeof o === "string" && o.indexOf("http") === 0;
  });
}

/** Idempotently make the registration match `origins` (replace-on-change). */
async function syncEdgeRegistration(origins) {
  if (!edgePanelSupported()) return { supported: false };
  var registered = [];
  try {
    registered = await chrome.scripting.getRegisteredContentScripts({
      ids: [EDGE_SCRIPT_ID],
    });
  } catch (err) {
    registered = [];
  }
  if (registered && registered.length) {
    try {
      await chrome.scripting.unregisterContentScripts({ ids: [EDGE_SCRIPT_ID] });
    } catch (err) {
      /* fall through — register below is the source of truth */
    }
  }
  if (origins.length) {
    await chrome.scripting.registerContentScripts([
      {
        id: EDGE_SCRIPT_ID,
        matches: origins.slice(),
        js: ["edgePanel.js"],
        runAt: "document_idle",
        persistAcrossSessions: true,
      },
    ]);
  }
  return { supported: true };
}

/** onInstalled / onStartup — Chrome persists dynamic registrations across
 *  restarts, but re-sync defensively; a stale registration with origins the
 *  user no longer lists is corrected here too. Never throw into startup. */
async function ensureEdgeRegistration() {
  try {
    var origins = await readEdgeOrigins();
    await syncEdgeRegistration(origins);
  } catch (err) {
    /* best-effort */
  }
}

async function isOriginGranted(pattern) {
  if (chrome.permissions && typeof chrome.permissions.contains === "function") {
    try {
      return await chrome.permissions.contains({ origins: [pattern] });
    } catch (err) {
      return false;
    }
  }
  return false;
}

/** popup asks after its own permissions.request (the gesture lives there). */
async function enableEdgePanel(pageUrl, tabId) {
  if (!edgePanelSupported()) return { ok: false, reason: "unsupported" };
  var pattern = originPatternOf(pageUrl);
  if (!pattern) return { ok: false, reason: "restricted" };
  var origins = await readEdgeOrigins();
  if (origins.indexOf(pattern) === -1) origins.push(pattern);
  await chrome.storage.local.set(
    (function () {
      var payload = {};
      payload[EDGE_ORIGINS_KEY] = origins;
      return payload;
    })()
  );
  await syncEdgeRegistration(origins);
  // Pages already open predate the registration — inject on demand so the
  // handle shows up without a reload.
  if (typeof tabId === "number" && chrome.scripting.executeScript) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["edgePanel.js"],
      });
    } catch (err) {
      /* restricted page or navigation raced the inject — panel appears next load */
    }
  }
  return { ok: true, origins: origins };
}

async function disableEdgePanel(pageUrl) {
  if (!edgePanelSupported()) return { ok: false, reason: "unsupported" };
  var pattern = originPatternOf(pageUrl);
  if (!pattern) return { ok: false, reason: "restricted" };
  var origins = await readEdgeOrigins();
  var next = origins.filter(function (o) {
    return o !== pattern;
  });
  await chrome.storage.local.set(
    (function () {
      var payload = {};
      payload[EDGE_ORIGINS_KEY] = next;
      return payload;
    })()
  );
  await syncEdgeRegistration(next);
  return { ok: true, origins: next };
}

/** State for the popup toggle row. */
async function edgePanelState(pageUrl) {
  var pattern = originPatternOf(pageUrl || "");
  var cfg = await loadConfig();
  var state = {
    supported: edgePanelSupported(),
    pattern: pattern,
    enabled: false,
    granted: false,
    configured: Boolean(cfg.instanceUrl),
  };
  if (!pattern) return state;
  var origins = await readEdgeOrigins();
  state.enabled = origins.indexOf(pattern) !== -1;
  state.granted = await isOriginGranted(pattern);
  return state;
}

/** Shortcut handler: toggle the panel on the active tab when its origin is
 *  enabled; otherwise point the user at the popup. Tabs loaded before the
 *  registration (or before a Chrome restart rebuilt it) get an on-demand
 *  executeScript fallback before the toggle message. */
async function toggleEdgePanel() {
  var copy = t();
  if (!edgePanelSupported()) {
    notify(copy.appTitle, copy.edgeUnsupported);
    return;
  }
  var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  var tab = tabs && tabs[0];
  if (!tab || !tab.url) return;
  var pattern = originPatternOf(tab.url);
  var origins = await readEdgeOrigins();
  if (!pattern || origins.indexOf(pattern) === -1) {
    notify(copy.appTitle, copy.edgeNeedEnable);
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "davflare-edge-toggle" });
  } catch (err) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["edgePanel.js"],
      });
      await chrome.tabs.sendMessage(tab.id, { type: "davflare-edge-toggle" });
    } catch (err2) {
      notify(copy.errTitle, copy.edgeUnavailable);
    }
  }
}

/** Library snapshot for the panel's datalists, plus trash-revive prefill
 *  (#130) so the panel behaves like the popup when the URL is trashed. */
async function edgePanelMeta(pageUrl) {
  var cfg = await loadConfig();
  var cache = await readBookmarksCache();
  var model = cache && cache.model ? Bookmarks.normalizeModel(cache.model) : null;
  var folders = model ? Bookmarks.folderPaths(model) : [];
  var seen = {};
  var tags = [];
  if (model) {
    for (var i = 0; i < model.bookmarks.length; i++) {
      var list = model.bookmarks[i] && model.bookmarks[i].tags;
      if (!Array.isArray(list)) continue;
      for (var j = 0; j < list.length; j++) {
        var tag = list[j];
        if (tag && !seen[tag]) {
          seen[tag] = true;
          tags.push(tag);
        }
      }
    }
  }
  tags.sort(function (a, b) {
    return a.localeCompare(b, undefined, { sensitivity: "base" });
  });
  var trashed = model && pageUrl ? Bookmarks.trashedByUrl(model, pageUrl) : null;
  return {
    ok: true,
    configured: Boolean(cfg.instanceUrl),
    folders: folders,
    tags: tags,
    trashed: trashed
      ? {
          title: trashed.title || "",
          folder: trashed.folder || "",
          tags: Array.isArray(trashed.tags) ? trashed.tags.slice() : [],
          note: trashed.note || "",
        }
      : null,
  };
}

// Messages from the popup and the edge panel. Returning true keeps the
// sendResponse channel open for the async work (MV3 requirement).
chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || typeof msg.type !== "string") return;
  if (msg.type === "davflare-edge-save") {
    performSave(String(msg.title || ""), String(msg.url || ""), {
      folder: typeof msg.folder === "string" ? msg.folder : "",
      tags: Array.isArray(msg.tags) ? msg.tags : [],
      note: typeof msg.note === "string" ? msg.note : "",
    })
      .then(function (result) {
        // The panel renders `message`; badge/notification stay silent so the
        // in-page panel is the single feedback surface.
        sendResponse({
          ok: Boolean(result.ok),
          status: result.status || "",
          kind: result.kind || "",
          message: describeResult(result),
        });
      })
      .catch(function (err) {
        sendResponse({
          ok: false,
          kind: "unexpected",
          message: errorText("unexpected", err && err.message ? err.message : ""),
        });
      });
    return true;
  }
  if (msg.type === "davflare-edge-meta") {
    edgePanelMeta(typeof msg.url === "string" ? msg.url : "")
      .then(function (meta) {
        sendResponse(meta);
      })
      .catch(function () {
        sendResponse({
          ok: false,
          configured: false,
          folders: [],
          tags: [],
          trashed: null,
        });
      });
    return true;
  }
  if (msg.type === "davflare-edge-enable") {
    enableEdgePanel(msg.pageUrl, typeof msg.tabId === "number" ? msg.tabId : undefined)
      .then(sendResponse)
      .catch(function () {
        sendResponse({ ok: false, reason: "error" });
      });
    return true;
  }
  if (msg.type === "davflare-edge-disable") {
    disableEdgePanel(msg.pageUrl)
      .then(sendResponse)
      .catch(function () {
        sendResponse({ ok: false, reason: "error" });
      });
    return true;
  }
  if (msg.type === "davflare-edge-state") {
    edgePanelState(msg.pageUrl)
      .then(sendResponse)
      .catch(function () {
        sendResponse({ supported: false, enabled: false, granted: false });
      });
    return true;
  }
});
