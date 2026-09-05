"use strict";

/**
 * Bookmark library page wiring. All pure display logic lives in
 * bookmarksView.js; this file only touches chrome.* and the DOM.
 */

/* global Bookmarks, BookmarksView, DavflareDav, mergeSettings */

var COPY = {
  en: {
    title: "Davflare Bookmarks",
    brandSub: "Bookmarks",
    navAll: "All bookmarks",
    folders: "Folders",
    tags: "Tags",
    unfiled: "Unfiled",
    searchPlaceholder: "Search bookmarks…",
    allFolders: "All folders",
    loading: "Loading…",
    empty: "No bookmarks yet. Right-click any page and choose “Save page to Davflare”, or click Add.",
    emptyFilter: "Nothing matches the current filter.",
    add: "Add",
    import: "Import",
    export: "Export",
    drive: "Drive",
    settings: "Settings",
    addDialogTitle: "Add bookmark",
    urlLabel: "URL",
    titleLabel: "Title",
    cancel: "Cancel",
    deleteLabel: "Delete",
    confirmDelete: "Delete this bookmark?",
    needConfig: "Configure your instance URL and WebDAV credentials in options first.",
    openOptions: "Open options",
    errDisabled: "WebDAV is disabled on this instance (feature switch off).",
    errNotConfigured: "The server has no WebDAV credentials configured.",
    errUnauthorized: "Wrong WebDAV username or password. Update them in options.",
    errNetwork: "Cannot reach the instance. Check the URL in options.",
    errConflict: "The library changed elsewhere — refreshed. Please retry.",
    errOther: "The instance returned an unexpected response.",
    invalidUrl: "Enter a valid http(s) URL.",
    exists: "This URL is already in the library.",
    added: "Saved.",
    deleted: "Deleted.",
    importDenied: "Import needs the “Read and change your bookmarks” permission.",
    importDone: "Imported {n} new bookmark(s).",
    importNone: "No new bookmarks to import.",
    exported: "Exported bookmarks.html.",
    syncPrefix: "synced",
    neverSynced: "never synced",
    offline: "offline",
  },
  zh: {
    title: "Davflare 书签",
    brandSub: "书签库",
    navAll: "所有书签",
    folders: "分类",
    tags: "标签",
    unfiled: "未分类",
    searchPlaceholder: "搜索书签…",
    allFolders: "全部分类",
    loading: "加载中…",
    empty: "还没有书签。在任意网页右键选择「收藏此页到 Davflare」，或点「添加」。",
    emptyFilter: "没有符合当前筛选的书签。",
    add: "添加",
    import: "导入",
    export: "导出",
    drive: "网盘",
    settings: "设置",
    addDialogTitle: "添加书签",
    urlLabel: "地址",
    titleLabel: "标题",
    cancel: "取消",
    deleteLabel: "删除",
    confirmDelete: "确定删除这个书签？",
    needConfig: "请先在选项中配置实例地址与 WebDAV 凭据。",
    openOptions: "打开设置",
    errDisabled: "该实例已关闭 WebDAV（功能开关）。",
    errNotConfigured: "服务端未配置 WebDAV 凭据。",
    errUnauthorized: "WebDAV 用户名或密码错误，请在设置中更新。",
    errNetwork: "无法连接实例，请在设置中检查地址。",
    errConflict: "书签库已在别处更新——已刷新，请重试。",
    errOther: "实例返回了未预期的响应。",
    invalidUrl: "请填写有效的 http(s) 地址。",
    exists: "该地址已在书签库中。",
    added: "已保存。",
    deleted: "已删除。",
    importDenied: "导入需要授权「读取和更改您的书签」权限。",
    importDone: "已导入 {n} 个新书签。",
    importNone: "没有需要导入的新书签。",
    exported: "已导出 bookmarks.html。",
    syncPrefix: "已同步",
    neverSynced: "从未同步",
    offline: "未连接",
  },
};

var ERROR_KEY = {
  disabled: "errDisabled",
  notConfigured: "errNotConfigured",
  unauthorized: "errUnauthorized",
  network: "errNetwork",
  conflict: "errConflict",
};

var CACHE_KEY = "bookmarksCache";
var THEME_KEY = "davflare-theme";

var state = {
  model: Bookmarks.emptyModel(),
  etag: null,
  filter: { kind: "all", value: "" },
  query: "",
  view: "grid",
  syncedAt: 0,
  bytes: 0,
};

var lang =
  (navigator.language || "en").toLowerCase().indexOf("zh") === 0 ? "zh" : "en";
var t = COPY[lang];

function $(id) {
  return document.getElementById(id);
}

function fmt(template, values) {
  return String(template).replace(/\{(\w+)\}/g, function (_, key) {
    return values && values[key] !== undefined ? values[key] : "";
  });
}

function folderLabel(name) {
  return name === "" ? t.unfiled : name;
}

function errorText(kind) {
  var key = ERROR_KEY[kind];
  return key ? t[key] : t.errOther;
}

/* ---------- theme ---------- */

function initTheme() {
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
  applyTheme(theme);
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $("themeToggle").textContent = theme === "dark" ? "☀" : "☾";
}

function toggleTheme() {
  var next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch (err) {
    /* private mode: theme just won't persist */
  }
}

/* ---------- data ---------- */

async function loadConfig() {
  var sync = await chrome.storage.sync.get(["instanceUrl"]);
  var local = await chrome.storage.local.get(["davUsername", "davPassword"]);
  return {
    instanceUrl: mergeSettings(sync).instanceUrl,
    username: typeof local.davUsername === "string" ? local.davUsername : "",
    password: typeof local.davPassword === "string" ? local.davPassword : "",
  };
}

function makeClient() {
  return loadConfig().then(function (cfg) {
    return { cfg: cfg, client: DavflareDav.createDavClient(cfg) };
  });
}

function saveCache() {
  var payload = {};
  payload[CACHE_KEY] = {
    model: state.model,
    syncedAt: state.syncedAt,
    bytes: state.bytes,
  };
  chrome.storage.local.set(payload);
}

function renderFromCache() {
  chrome.storage.local.get([CACHE_KEY], function (stored) {
    var cache = stored && stored[CACHE_KEY];
    if (cache && cache.model) {
      state.model = Bookmarks.normalizeModel(cache.model);
      state.syncedAt = cache.syncedAt || 0;
      state.bytes = cache.bytes || 0;
      renderAll();
    }
  });
}

function computeBytes() {
  return Bookmarks.serializeHtml(state.model).length + Bookmarks.modelToJsonText(state.model).length;
}

async function refresh() {
  hideBanner();
  $("loading").classList.remove("hidden");
  var made = await makeClient();
  try {
    if (!made.cfg.instanceUrl) {
      showBanner(t.needConfig, t.openOptions, openOptions);
      renderAll();
      return;
    }
    var res = await made.client.getBookmarks();
    if (!res.ok) {
      showBanner(errorText(res.kind), t.openOptions, openOptions);
      renderAll();
      return;
    }
    var model = Bookmarks.parseHtml(res.html || "");
    if (res.jsonText) {
      var parsed = Bookmarks.modelFromJson(res.jsonText);
      if (parsed.ok) model = Bookmarks.adoptRichFields(model, parsed.model);
    }
    state.model = model;
    state.etag = res.etag;
    state.bytes = computeBytes();
    state.syncedAt = Date.now();
    saveCache();
    hideBanner();
    renderAll();
  } finally {
    $("loading").classList.add("hidden");
  }
}

async function persist() {
  var made = await makeClient();
  if (!made.cfg.instanceUrl) {
    showBanner(t.needConfig, t.openOptions, openOptions);
    return false;
  }
  var put = await made.client.putBookmarks({
    html: Bookmarks.serializeHtml(state.model),
    json: Bookmarks.modelToJsonText(state.model),
    etag: state.etag,
  });
  if (put.ok) {
    state.bytes = computeBytes();
    state.syncedAt = Date.now();
    saveCache();
    hideBanner();
    renderAll();
    return true;
  }
  if (put.kind === "conflict") {
    showBanner(t.errConflict);
    await refresh();
    return false;
  }
  showBanner(errorText(put.kind), t.openOptions, openOptions);
  return false;
}

/* ---------- banner ---------- */

function showBanner(message, actionText, actionFn) {
  var banner = $("banner");
  banner.textContent = message || "";
  if (actionText && actionFn) {
    var btn = document.createElement("button");
    btn.className = "ghost";
    btn.type = "button";
    btn.textContent = actionText;
    btn.addEventListener("click", actionFn);
    banner.appendChild(document.createTextNode(" "));
    banner.appendChild(btn);
  }
  banner.classList.remove("hidden");
}

function hideBanner() {
  $("banner").classList.add("hidden");
}

function openOptions() {
  chrome.runtime.openOptionsPage();
}

/* ---------- render ---------- */

function renderAll() {
  renderNav();
  renderFolderSelect();
  renderItems();
  renderSyncInfo();
}

function navButton(label, count, active, onClick) {
  var btn = document.createElement("button");
  btn.className = "navItem" + (active ? " active" : "");
  btn.type = "button";
  var span = document.createElement("span");
  span.textContent = label;
  var badge = document.createElement("span");
  badge.className = "count";
  badge.textContent = String(count);
  btn.appendChild(span);
  btn.appendChild(badge);
  btn.addEventListener("click", onClick);
  return btn;
}

function renderNav() {
  var all = state.model.bookmarks.length;
  $("navAllCount").textContent = String(all);
  $("navAll").classList.toggle("active", state.filter.kind === "all");

  var folderNav = $("folderNav");
  folderNav.textContent = "";
  var folders = BookmarksView.folderList(state.model);
  for (var i = 0; i < folders.length; i++) {
    (function (entry) {
      var active = state.filter.kind === "folder" && state.filter.value === entry.name;
      folderNav.appendChild(
        navButton(folderLabel(entry.name), entry.count, active, function () {
          state.filter = { kind: "folder", value: entry.name };
          renderAll();
        })
      );
    })(folders[i]);
  }
  if (!folders.length) {
    folderNav.appendChild(emptyHint());
  }

  var tagNav = $("tagNav");
  tagNav.textContent = "";
  var tags = BookmarksView.tagList(state.model);
  for (var j = 0; j < tags.length; j++) {
    (function (entry) {
      var active = state.filter.kind === "tag" && state.filter.value === entry.name;
      tagNav.appendChild(
        navButton(entry.name, entry.count, active, function () {
          state.filter = { kind: "tag", value: entry.name };
          renderAll();
        })
      );
    })(tags[j]);
  }
  if (!tags.length) {
    tagNav.appendChild(emptyHint());
  }
}

function emptyHint() {
  var p = document.createElement("p");
  p.className = "navEmpty";
  p.textContent = "—";
  return p;
}

function renderFolderSelect() {
  var select = $("folderSelect");
  select.textContent = "";
  var allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = t.allFolders;
  select.appendChild(allOption);

  var folders = BookmarksView.folderList(state.model);
  for (var i = 0; i < folders.length; i++) {
    var option = document.createElement("option");
    option.value = folders[i].name;
    option.textContent = folderLabel(folders[i].name) + " (" + folders[i].count + ")";
    select.appendChild(option);
  }
  select.value = state.filter.kind === "folder" ? state.filter.value : "all";
}

function faviconNode(item) {
  var wrap = document.createElement("span");
  wrap.className = "favicon";
  var letter = document.createElement("span");
  letter.className = "letter";
  letter.textContent = BookmarksView.fallbackLetter(item);
  wrap.appendChild(letter);
  var img = document.createElement("img");
  img.alt = "";
  img.width = 20;
  img.height = 20;
  img.loading = "lazy";
  img.src =
    chrome.runtime.getURL("_favicon/?pageUrl=") + encodeURIComponent(item.url) + "&size=32";
  img.addEventListener("load", function () {
    wrap.classList.add("hasIcon");
  });
  img.addEventListener("error", function () {
    img.remove();
  });
  wrap.appendChild(img);
  return wrap;
}

function deleteButton(item) {
  var btn = document.createElement("button");
  btn.className = "del";
  btn.type = "button";
  btn.title = t.deleteLabel;
  btn.setAttribute("aria-label", t.deleteLabel);
  btn.textContent = "✕";
  btn.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
    confirmThen(function () {
      state.model = Bookmarks.removeBookmark(state.model, item.id);
      persist().then(function (ok) {
        if (ok) flashStatus(t.deleted);
      });
    });
  });
  return btn;
}

function cardNode(item) {
  var card = document.createElement("article");
  card.className = "card";

  var link = document.createElement("a");
  link.className = "cardMain";
  link.href = item.url;
  link.target = "_blank";
  link.rel = "noreferrer noopener";

  link.appendChild(faviconNode(item));

  var title = document.createElement("h3");
  title.textContent = item.title || BookmarksView.domainOf(item.url) || item.url;
  link.appendChild(title);

  var domain = document.createElement("p");
  domain.className = "domain";
  domain.textContent = BookmarksView.domainOf(item.url) || item.url;
  link.appendChild(domain);

  var note = item.note ? document.createElement("p") : null;
  if (note) {
    note.className = "note";
    note.textContent = item.note;
    link.appendChild(note);
  }

  var meta = document.createElement("footer");
  meta.className = "cardMeta";
  var chip = document.createElement("span");
  chip.className = "chip";
  chip.textContent = folderLabel(item.folder);
  meta.appendChild(chip);
  var tags = Array.isArray(item.tags) ? item.tags : [];
  for (var i = 0; i < tags.length; i++) {
    var tag = document.createElement("span");
    tag.className = "chip tag";
    tag.textContent = tags[i];
    meta.appendChild(tag);
  }
  var time = document.createElement("time");
  time.textContent = BookmarksView.formatDate(item.added, lang);
  meta.appendChild(time);
  meta.appendChild(deleteButton(item));

  card.appendChild(link);
  card.appendChild(meta);
  return card;
}

function rowNode(item) {
  var row = document.createElement("a");
  row.className = "row";
  row.href = item.url;
  row.target = "_blank";
  row.rel = "noreferrer noopener";
  row.appendChild(faviconNode(item));
  var title = document.createElement("span");
  title.className = "rowTitle";
  title.textContent = item.title || BookmarksView.domainOf(item.url) || item.url;
  var domain = document.createElement("span");
  domain.className = "rowDomain";
  domain.textContent = BookmarksView.domainOf(item.url);
  var chip = document.createElement("span");
  chip.className = "chip";
  chip.textContent = folderLabel(item.folder);
  var time = document.createElement("time");
  time.textContent = BookmarksView.formatDate(item.added, lang);
  row.appendChild(title);
  row.appendChild(domain);
  row.appendChild(chip);
  row.appendChild(time);
  row.appendChild(deleteButton(item));
  return row;
}

function renderItems() {
  var filter = {
    query: state.query,
    folder: state.filter.kind === "folder" ? state.filter.value : null,
    tag: state.filter.kind === "tag" ? state.filter.value : null,
  };
  var items = BookmarksView.filterBookmarks(state.model, filter);

  var cards = $("cards");
  var rows = $("rows");
  cards.textContent = "";
  rows.textContent = "";

  var isGrid = state.view === "grid";
  cards.classList.toggle("hidden", !isGrid);
  rows.classList.toggle("hidden", isGrid);

  for (var i = 0; i < items.length; i++) {
    if (isGrid) cards.appendChild(cardNode(items[i]));
    else rows.appendChild(rowNode(items[i]));
  }

  var empty = $("emptyState");
  if (!items.length) {
    empty.textContent =
      state.model.bookmarks.length === 0 ? t.empty : t.emptyFilter;
    empty.classList.remove("hidden");
  } else {
    empty.classList.add("hidden");
  }
}

function renderSyncInfo() {
  var info = $("syncInfo");
  if (state.syncedAt) {
    info.textContent =
      BookmarksView.formatRelative(state.syncedAt, Date.now(), lang) +
      " · " +
      BookmarksView.formatBytes(state.bytes);
  } else {
    info.textContent = t.neverSynced;
  }
}

function flashStatus(message) {
  var el = $("syncInfo");
  var before = el.textContent;
  el.textContent = message;
  el.classList.add("flash");
  setTimeout(function () {
    el.textContent = before;
    el.classList.remove("flash");
  }, 2000);
}

/* ---------- mutations ---------- */

var pendingConfirm = null;

function confirmThen(fn) {
  pendingConfirm = fn;
  $("confirmText").textContent = t.confirmDelete;
  $("confirmDialog").showModal();
}

async function submitAdd(event) {
  event.preventDefault();
  var url = $("addUrl").value.trim();
  if (!Bookmarks.isWebUrl(url)) {
    $("addError").textContent = t.invalidUrl;
    return;
  }
  var title = $("addTitleInput").value.trim() || BookmarksView.domainOf(url) || url;
  var add = Bookmarks.addBookmark(state.model, { title: title, url: url, added: Date.now() });
  if (!add.added) {
    $("addError").textContent = t.exists;
    return;
  }
  state.model = add.model;
  $("addError").textContent = "";
  $("addDialog").close();
  $("addUrl").value = "";
  $("addTitleInput").value = "";
  var ok = await persist();
  if (ok) flashStatus(t.added);
}

async function importChromeBookmarks() {
  if (typeof chrome === "undefined" || !chrome.permissions || !chrome.bookmarks) {
    showBanner(t.importDenied);
    return;
  }
  var granted;
  try {
    granted = await chrome.permissions.request({ permissions: ["bookmarks"] });
  } catch (err) {
    granted = false;
  }
  if (!granted) {
    showBanner(t.importDenied);
    return;
  }
  var tree = await chrome.bookmarks.getTree();
  var incoming = [];
  function walk(nodes, folderPath) {
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (node.url) {
        if (Bookmarks.isWebUrl(node.url)) {
          incoming.push({
            title: node.title || "",
            url: node.url,
            folder: folderPath,
            added: node.dateAdded || 0,
          });
        }
      } else if (Array.isArray(node.children)) {
        var nextPath = node.title
          ? (folderPath ? folderPath + "/" : "") + node.title
          : folderPath;
        walk(node.children, nextPath);
      }
    }
  }
  walk(tree || [], "");

  var before = state.model.bookmarks.length;
  state.model = Bookmarks.mergeModels(state.model, { bookmarks: incoming });
  var added = state.model.bookmarks.length - before;
  var ok = await persist();
  if (ok) flashStatus(fmt(added > 0 ? t.importDone : t.importNone, { n: added }));
}

function exportHtml() {
  var blob = new Blob([Bookmarks.serializeHtml(state.model)], { type: "text/html" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = "bookmarks.html";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 5000);
  flashStatus(t.exported);
}

/* ---------- boot ---------- */

function applyCopy() {
  document.title = t.title;
  $("brandSub").textContent = t.brandSub;
  $("navAllText").textContent = t.navAll;
  $("folderTitle").textContent = t.folders;
  $("tagTitle").textContent = t.tags;
  $("search").placeholder = t.searchPlaceholder;
  $("loading").textContent = t.loading;
  $("addBtn").textContent = t.add;
  $("importBtn").textContent = t.import;
  $("exportBtn").textContent = t.export;
  $("driveBtn").textContent = t.drive;
  $("settingsBtn").textContent = t.settings;
  $("addDialogTitle").textContent = t.addDialogTitle;
  $("addUrlLabel").textContent = t.urlLabel;
  $("addTitleLabel").textContent = t.titleLabel;
  $("addCancel").textContent = t.cancel;
  $("addSave").textContent = t.add;
  $("confirmCancel").textContent = t.cancel;
  $("confirmOk").textContent = t.deleteLabel;
}

function setView(view) {
  state.view = view;
  $("viewGrid").classList.toggle("active", view === "grid");
  $("viewList").classList.toggle("active", view === "list");
  renderItems();
}

function setFilterAll() {
  state.filter = { kind: "all", value: "" };
  renderAll();
}

function wireEvents() {
  $("navAll").addEventListener("click", setFilterAll);
  $("search").addEventListener("input", function (event) {
    state.query = event.target.value;
    renderItems();
  });
  $("folderSelect").addEventListener("change", function (event) {
    var value = event.target.value;
    state.filter = value === "all" ? { kind: "all", value: "" } : { kind: "folder", value: value };
    renderAll();
  });
  $("viewGrid").addEventListener("click", function () {
    setView("grid");
  });
  $("viewList").addEventListener("click", function () {
    setView("list");
  });
  $("themeToggle").addEventListener("click", toggleTheme);
  $("addBtn").addEventListener("click", function () {
    $("addError").textContent = "";
    $("addDialog").showModal();
    $("addUrl").focus();
  });
  $("addCancel").addEventListener("click", function () {
    $("addDialog").close();
  });
  $("addForm").addEventListener("submit", submitAdd);
  $("confirmCancel").addEventListener("click", function () {
    pendingConfirm = null;
    $("confirmDialog").close();
  });
  $("confirmOk").addEventListener("click", function () {
    var fn = pendingConfirm;
    pendingConfirm = null;
    $("confirmDialog").close();
    if (fn) fn();
  });
  $("importBtn").addEventListener("click", importChromeBookmarks);
  $("exportBtn").addEventListener("click", exportHtml);
  $("settingsBtn").addEventListener("click", openOptions);
  $("driveBtn").addEventListener("click", async function () {
    var cfg = await loadConfig();
    if (cfg.instanceUrl) chrome.tabs.create({ url: cfg.instanceUrl });
    else openOptions();
  });
  document.addEventListener("keydown", function (event) {
    var target = event.target;
    var typing =
      target &&
      (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
    if (event.key === "/" && !typing) {
      event.preventDefault();
      $("search").focus();
    }
  });
}

applyCopy();
initTheme();
wireEvents();
renderFromCache();
refresh();
