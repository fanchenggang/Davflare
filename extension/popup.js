"use strict";

/**
 * Toolbar action popup (HamHome-style save dialog): left-clicking the toolbar
 * icon opens this popup on the current tab — prefill title/folder/tags, save
 * to the instance's WebDAV library, and offer entries into the shell home
 * page (bookmarks.html) and its settings view. The right-click quick-save in
 * background.js keeps working for one-click saves without the dialog.
 *
 * #69: open from bookmarksCache first (≤2–3s to actionable), then soft-sync
 * with a conditional GET so large libraries do not block the Save button.
 */

var THEME_KEY = "davflare-theme";
var LAST_FOLDER_KEY = "popupLastFolder";
var CACHE_KEY = "bookmarksCache";

var COPY = {
  en: {
    titleLabel: "Title",
    folderLabel: "Folder",
    folderPlaceholder: "Root — pick or type a folder",
    tagsLabel: "Tags (comma separated)",
    noteLabel: "Note (optional)",
    viewInLibrary: "View in library",
    save: "Save",
    saving: "Saving…",
    saved: "Saved to your library.",
    exists: "This page is already in your library.",
    skipPage: "Only http(s) pages can be saved.",
    needConfig: "Configure your instance URL and WebDAV credentials in settings first.",
    goSettings: "Open settings",
    loading: "Loading library…",
    syncing: "Updating library…",
    retry: "Retry",
    errDisabled: "WebDAV is disabled on this instance.",
    errNotConfigured: "The server has no WebDAV credentials configured.",
    errUnauthorized: "Wrong WebDAV username or password. Check settings.",
    errNetwork: "Cannot reach the instance.",
    errTimeout: "The instance timed out (large library or slow network). Try again.",
    errConflict: "The library changed elsewhere — reloaded, please save again.",
    errOther: "The instance returned an unexpected response.",
    home: "Open Davflare",
    settings: "Settings",
  },
  zh: {
    titleLabel: "标题",
    folderLabel: "分类",
    folderPlaceholder: "留空为根目录，可输入或选择",
    tagsLabel: "标签（逗号分隔）",
    noteLabel: "备注（可选）",
    viewInLibrary: "在书签库中查看",
    save: "收藏",
    saving: "收藏中…",
    saved: "已收藏到书签库。",
    exists: "该页面已在书签库中。",
    skipPage: "只能收藏 http(s) 页面。",
    needConfig: "请先在「设置」里配置实例地址与 WebDAV 凭据。",
    goSettings: "去设置",
    loading: "正在读取书签库…",
    syncing: "正在同步书签库…",
    retry: "重试",
    errDisabled: "该实例已关闭 WebDAV。",
    errNotConfigured: "服务端未配置 WebDAV 凭据。",
    errUnauthorized: "WebDAV 用户名或密码错误，请在设置里检查。",
    errNetwork: "无法连接实例。",
    errTimeout: "实例响应超时（库较大或网络慢），请重试。",
    errConflict: "书签库已在别处更新——已重新加载，请再点一次收藏。",
    errOther: "实例返回了未预期的响应。",
    home: "插件主页",
    settings: "设置",
  },
};

var ERROR_KEY = {
  disabled: "errDisabled",
  notConfigured: "errNotConfigured",
  unauthorized: "errUnauthorized",
  network: "errNetwork",
  timeout: "errTimeout",
  conflict: "errConflict",
};

var state = {
  lang: "en",
  t: COPY.en,
  tab: null,
  url: "",
  model: null,
  etag: null,
  exists: false,
  ready: false,
  syncing: false,
};

function $(id) {
  return document.getElementById(id);
}

function pickLang() {
  return (navigator.language || "en").toLowerCase().indexOf("zh") === 0 ? "zh" : "en";
}

function errorText(kind) {
  var key = ERROR_KEY[kind];
  if (key) return state.t[key];
  if (kind && String(kind).indexOf("http") === 0) {
    var code = String(kind).slice(4);
    return state.lang === "zh"
      ? "实例返回了未预期的响应（HTTP " + code + "）。"
      : "Unexpected response from the instance (HTTP " + code + ").";
  }
  return state.t.errOther;
}

function applyTheme() {
  var saved = null;
  try {
    saved = localStorage.getItem(THEME_KEY);
  } catch (err) {
    saved = null;
  }
  var theme = saved === "light" || saved === "dark" ? saved : null;
  if (!theme) {
    theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.dataset.theme = theme;
}

function setStatus(text, kind) {
  var el = $("saveStatus");
  el.textContent = text || "";
  el.className = "status" + (kind ? " " + kind : "");
}

/** Notice states replace the form: loading / restricted / unconfigured / error. */
function showNotice(text, buttonLabel, onButton) {
  $("saveForm").classList.add("hidden");
  var notice = $("bodyNotice");
  notice.textContent = text;
  notice.classList.remove("hidden");
  var btn = $("noticeBtn");
  if (buttonLabel && onButton) {
    btn.textContent = buttonLabel;
    btn.classList.remove("hidden");
    btn.onclick = onButton;
  } else {
    btn.classList.add("hidden");
    btn.onclick = null;
  }
}

function showForm() {
  $("bodyNotice").classList.add("hidden");
  $("noticeBtn").classList.add("hidden");
  $("saveForm").classList.remove("hidden");
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

/** Reuse an open shell tab when possible, else open a new one, then close the popup. */
async function focusOrCreateTab(target) {
  var base = chrome.runtime.getURL("bookmarks.html");
  var tabs = await chrome.tabs.query({ url: base + "*" });
  if (tabs && tabs.length > 0) {
    var tab = tabs[0];
    // Reusing an open shell tab still must land on the requested view
    // (e.g. Settings / default home from the popup), not just focus.
    await chrome.tabs.update(tab.id, { active: true, url: target });
    if (typeof tab.windowId === "number") {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
  } else {
    await chrome.tabs.create({ url: target });
  }
  window.close();
}

async function openShell(view) {
  var base = chrome.runtime.getURL("bookmarks.html");
  var resolved = view;
  // 「插件主页」无显式 view：落到设置里的默认视图（含未配置 → settings）。
  if (!resolved) {
    var stored = await chrome.storage.sync.get(["instanceUrl", "toolbarMode"]);
    resolved = resolveToolbarTarget(stored).action;
  }
  await focusOrCreateTab(base + "?view=" + encodeURIComponent(resolved));
}

/** Deep-link into the library with this page's URL pre-filled in search. */
function openInLibraryWithQuery() {
  var base = chrome.runtime.getURL("bookmarks.html");
  return focusOrCreateTab(base + "?q=" + encodeURIComponent(state.url));
}

/** The "view in library" jump shows whenever the page is already saved. */
function updateViewBtn() {
  var btn = $("viewBtn");
  if (state.exists) btn.classList.remove("hidden");
  else btn.classList.add("hidden");
}

function setSaveEnabled(enabled, label) {
  var btn = $("saveBtn");
  btn.disabled = !enabled;
  btn.textContent = label;
}

function writeCache(model, etag) {
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
  chrome.storage.local.set(payload, function () {
    void chrome.runtime.lastError;
  });
}

function parseRemoteLibrary(res) {
  return Bookmarks.parseRemoteLibrary(res);
}

/**
 * Apply a loaded model to the form (folders, exists, save button).
 * User-typed inputs are left alone unless prefill* flags are set.
 */
async function applyLoadedModel(model, etag, options) {
  var opts = options || {};
  state.model = model;
  state.etag = etag || null;

  var folders = Bookmarks.folderPaths(model);
  var datalist = $("folderOptions");
  datalist.innerHTML = "";
  for (var i = 0; i < folders.length; i++) {
    var opt = document.createElement("option");
    opt.value = folders[i];
    datalist.appendChild(opt);
  }

  var key = Bookmarks.urlKey(state.url);
  state.exists = Boolean(
    key &&
      model.bookmarks.some(function (b) {
        return Bookmarks.urlKey(b.url) === key;
      })
  );

  if (opts.prefillTitle && !$("saveTitle").value) {
    $("saveTitle").value = (state.tab && state.tab.title) || state.url;
  }
  if (opts.prefillFolder && !$("saveFolder").value) {
    var stored = await chrome.storage.local.get([LAST_FOLDER_KEY]);
    var last = stored && typeof stored[LAST_FOLDER_KEY] === "string" ? stored[LAST_FOLDER_KEY] : "";
    if (Bookmarks.folderPaths(model).indexOf(last) !== -1) {
      $("saveFolder").value = last;
    }
  }

  showForm();
  updateViewBtn();
  if (state.exists) {
    setStatus(state.t.exists, "ok");
    setSaveEnabled(false, state.t.exists);
    state.ready = false;
  } else {
    state.ready = true;
    setSaveEnabled(true, state.t.save);
    if (!state.syncing) setStatus("");
  }
}

/**
 * Full remote GET + parse. Used when there is no usable cache.
 */
async function loadModel(opts) {
  var options = opts || {};
  state.ready = false;
  setSaveEnabled(false, state.t.save);
  if (options.prefillTitle) setStatus(state.t.loading);
  var client = DavflareDav.createDavClient(options.cfg);
  var res = await client.getBookmarks();
  if (!res.ok) {
    showNotice(errorText(res.kind), state.t.retry, function () {
      init();
    });
    return;
  }
  var model = parseRemoteLibrary(res);
  writeCache(model, res.etag || null);
  await applyLoadedModel(model, res.etag || null, options);
}

/**
 * Background revalidation (#69): If-None-Match when we have an etag so large
 * libraries stay cheap on the happy path. Failures are non-blocking when the
 * form is already usable from cache.
 */
async function softSync(cfg) {
  state.syncing = true;
  if (state.ready && !state.exists) setStatus(state.t.syncing);
  try {
    var client = DavflareDav.createDavClient(cfg);
    var opts = state.etag ? { ifNoneMatch: state.etag } : {};
    var res = await client.getBookmarks(opts);
    if (!res.ok) {
      if (!state.model) {
        showNotice(errorText(res.kind), state.t.retry, function () {
          init();
        });
      } else if (state.ready && !state.exists) {
        setStatus("");
      }
      return;
    }
    if (res.notModified) {
      if (state.ready && !state.exists) setStatus("");
      return;
    }
    var model = parseRemoteLibrary(res);
    writeCache(model, res.etag || null);
    // Refresh exists / folders; keep whatever the user already typed.
    await applyLoadedModel(model, res.etag || null, {});
  } finally {
    state.syncing = false;
  }
}

async function saveCurrent(event) {
  event.preventDefault();
  if (!state.ready) return;
  state.ready = false;
  setSaveEnabled(false, state.t.saving);
  setStatus("");

  var title = $("saveTitle").value.trim() || (state.tab && state.tab.title) || state.url;
  var folder = $("saveFolder").value.trim().replace(/^\/+|\/+$/g, "");
  var note = $("saveNote").value.trim();
  var tags = $("saveTags")
    .value
    .split(",")
    .map(function (tag) {
      return tag.trim();
    })
    .filter(Boolean);

  var add = Bookmarks.addBookmark(state.model, {
    title: title,
    url: state.url,
    folder: folder,
    tags: tags,
    note: note,
    added: Date.now(),
  });
  if (!add.added) {
    state.exists = true;
    setStatus(state.t.exists, "ok");
    setSaveEnabled(false, state.t.exists);
    return;
  }

  var cfg = await loadConfig();
  var client = DavflareDav.createDavClient(cfg);
  var put = await client.putBookmarks({
    html: Bookmarks.serializeHtml(add.model),
    json: Bookmarks.modelToJsonText(add.model),
    etag: state.etag,
  });
  if (!put.ok) {
    if (put.kind === "conflict") {
      // Remote moved on: reload model + etag, keep what the user typed.
      // loadModel may flip to the "already saved" state if the URL landed remotely.
      await loadModel({ cfg: cfg });
      if (!state.exists) setStatus(state.t.errConflict, "err");
    } else {
      setStatus(errorText(put.kind), "err");
      state.ready = true;
      setSaveEnabled(true, state.t.save);
    }
    return;
  }
  state.model = add.model;
  state.etag = put.etag || null;
  state.exists = true;
  writeCache(add.model, put.etag || null);
  setStatus(state.t.saved, "ok");
  setSaveEnabled(false, state.t.saved);
  updateViewBtn();
  chrome.storage.local.set({ popupLastFolder: folder }, function () {
    void chrome.runtime.lastError;
  });
}

function renderHeader() {
  var icon = $("pageIcon");
  var fallback = $("brandIcon");
  if (Bookmarks.isWebUrl(state.url)) {
    icon.src =
      chrome.runtime.getURL("_favicon/?pageUrl=") + encodeURIComponent(state.url) + "&size=32";
    icon.hidden = false;
    fallback.hidden = true;
    icon.onerror = function () {
      icon.hidden = true;
      fallback.hidden = false;
    };
  } else {
    icon.hidden = true;
    fallback.hidden = false;
  }
  $("pageTitle").textContent = (state.tab && state.tab.title) || "Davflare";
  $("pageUrl").textContent = state.url;
}

async function init() {
  applyTheme();
  state.lang = pickLang();
  state.t = COPY[state.lang];
  var t = state.t;

  document.title = "Davflare";
  $("titleLabel").textContent = t.titleLabel;
  $("folderLabel").textContent = t.folderLabel;
  $("saveFolder").placeholder = t.folderPlaceholder;
  $("tagsLabel").textContent = t.tagsLabel;
  $("noteLabel").textContent = t.noteLabel;
  $("viewBtn").textContent = t.viewInLibrary;
  $("homeBtn").textContent = t.home;
  $("settingsBtn").textContent = t.settings;

  var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  state.tab = tabs && tabs[0] ? tabs[0] : null;
  state.url = (state.tab && state.tab.url) || "";
  renderHeader();

  if (!Bookmarks.isWebUrl(state.url)) {
    showNotice(t.skipPage);
    return;
  }

  var cfg = await loadConfig();
  if (!cfg.instanceUrl) {
    showNotice(t.needConfig, t.goSettings, function () {
      openShell("settings");
    });
    return;
  }

  // Cache-first (#69): enable Save from local library, then soft-sync.
  var stored = await chrome.storage.local.get([CACHE_KEY]);
  var cache = stored && stored[CACHE_KEY];
  if (cache && cache.model) {
    await applyLoadedModel(Bookmarks.normalizeModel(cache.model), cache.etag || null, {
      prefillTitle: true,
      prefillFolder: true,
    });
    // #75 / #69: skip soft-sync when the cache was written recently so Save
    // stays in the 2–3s path instead of re-downloading a large library.
    var syncedAt = typeof cache.syncedAt === "number" ? cache.syncedAt : 0;
    if (!syncedAt || Date.now() - syncedAt > 120000) {
      softSync(cfg);
    }
    return;
  }

  await loadModel({ cfg: cfg, prefillTitle: true, prefillFolder: true });
}

$("saveForm").addEventListener("submit", saveCurrent);
$("viewBtn").addEventListener("click", function () {
  openInLibraryWithQuery();
});
$("homeBtn").addEventListener("click", function () {
  openShell("");
});
$("settingsBtn").addEventListener("click", function () {
  openShell("settings");
});

init();
