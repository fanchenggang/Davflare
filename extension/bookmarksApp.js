"use strict";

/**
 * Davflare library page wiring. Pure display/model logic lives in
 * bookmarksView.js / bookmarks.js / workspaces.js / tabRules.js /
 * pinyin.js; this file only touches chrome.* and the DOM.
 */

/* global Bookmarks, BookmarksView, DavflareDav, Workspaces, TabRules, PinyinIndex, mergeSettings */

var COPY = {
  en: {
    title: "Davflare Bookmarks",
    brandSub: "Bookmarks",
    viewBookmarks: "Bookmarks",
    viewWorkspaces: "Workspaces",
    viewTabRules: "Tab groups",
    navAll: "All bookmarks",
    folders: "Folders",
    tags: "Tags",
    unfiled: "Unfiled",
    searchPlaceholder: "Search bookmarks… (pinyin supported)",
    allFolders: "All folders",
    sinceAll: "Any time",
    sinceToday: "Today",
    sinceWeek: "Last 7 days",
    sinceMonth: "Last 30 days",
    sinceYear: "Last year",
    loading: "Loading…",
    empty: "No bookmarks yet. Right-click any page and choose “Save page to Davflare”, or click Add.",
    emptyFilter: "Nothing matches the current filter.",
    add: "Add",
    save: "Save",
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
    tagDialogTitle: "Edit bookmark",
    tagInputLabel: "Tags (comma separated)",
    noteInputLabel: "Note",
    needConfig: "Configure your instance URL and WebDAV credentials in options first.",
    openOptions: "Open options",
    errDisabled: "WebDAV is disabled on this instance (feature switch off).",
    errNotConfigured: "The server has no WebDAV credentials configured.",
    errUnauthorized: "Wrong WebDAV username or password. Update them in options.",
    errNetwork: "Cannot reach the instance. Check the URL in options.",
    errConflict: "Changed elsewhere — reloaded the remote copy. Please retry.",
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
    saveWindow: "Save current window",
    wsCount: "{n} workspace(s)",
    wsEmpty: "No workspaces yet. Click “Save current window” to snapshot the open tabs.",
    wsNoPages: "This window has no http(s) tabs worth saving.",
    wsNameTitle: "Workspace name",
    restoreAll: "Restore all",
    restoreSelected: "Restore selected",
    rename: "Rename",
    pinMark: "pinned",
    groupMark: "group: {t}",
    ruleAdd: "Add rule",
    ruleDialogTitle: "Grouping rule",
    ruleDomainLabel: "Domains (comma separated)",
    ruleUrlLabel: "URL contains",
    ruleTitleLabel: "Title contains",
    ruleRegexLabel: "URL regex",
    ruleNameLabel: "Group title",
    ruleColorLabel: "Color",
    ruleOrderLabel: "Priority",
    ruleCollapsedText: "Collapse the group",
    rulesEmpty: "No rules yet. Rules group tabs in the current window by domain, URL, title, or regex.",
    rulesNone: "Nothing to group in this window.",
    rulesApplied: "Created {n} group(s).",
    ruleInvalidRegex: "Invalid regular expression.",
    ruleNeedCriteria: "Add at least one criterion.",
    groupCurrentWindow: "Group current window",
    fallbackText: "Group the rest by domain",
    invalidName: "Enter a name.",
  },
  zh: {
    title: "Davflare 书签",
    brandSub: "书签库",
    viewBookmarks: "书签",
    viewWorkspaces: "工作区",
    viewTabRules: "Tab 分组",
    navAll: "所有书签",
    folders: "分类",
    tags: "标签",
    unfiled: "未分类",
    searchPlaceholder: "搜索书签…（支持拼音）",
    allFolders: "全部分类",
    sinceAll: "全部时间",
    sinceToday: "今天",
    sinceWeek: "最近 7 天",
    sinceMonth: "最近 30 天",
    sinceYear: "最近一年",
    loading: "加载中…",
    empty: "还没有书签。在任意网页右键选择「收藏此页到 Davflare」，或点「添加」。",
    emptyFilter: "没有符合当前筛选的书签。",
    add: "添加",
    save: "保存",
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
    tagDialogTitle: "编辑书签",
    tagInputLabel: "标签（逗号分隔）",
    noteInputLabel: "备注",
    needConfig: "请先在选项中配置实例地址与 WebDAV 凭据。",
    openOptions: "打开设置",
    errDisabled: "该实例已关闭 WebDAV（功能开关）。",
    errNotConfigured: "服务端未配置 WebDAV 凭据。",
    errUnauthorized: "WebDAV 用户名或密码错误，请在设置中更新。",
    errNetwork: "无法连接实例，请在设置中检查地址。",
    errConflict: "内容已在别处更新——已重新加载远端，请重试。",
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
    saveWindow: "保存当前窗口",
    wsCount: "{n} 个工作区",
    wsEmpty: "还没有工作区。点「保存当前窗口」把打开的标签页存为可恢复的工作区。",
    wsNoPages: "当前窗口没有可保存的 http(s) 标签页。",
    wsNameTitle: "工作区名称",
    restoreAll: "全部恢复",
    restoreSelected: "恢复选中",
    rename: "重命名",
    pinMark: "已固定",
    groupMark: "分组：{t}",
    ruleAdd: "新增规则",
    ruleDialogTitle: "分组规则",
    ruleDomainLabel: "域名（逗号分隔）",
    ruleUrlLabel: "URL 包含",
    ruleTitleLabel: "标题包含",
    ruleRegexLabel: "URL 正则",
    ruleNameLabel: "分组标题",
    ruleColorLabel: "颜色",
    ruleOrderLabel: "优先级",
    ruleCollapsedText: "分组折叠",
    rulesEmpty: "还没有规则。规则按域名 / URL / 标题 / 正则把当前窗口的标签页收进原生标签组。",
    rulesNone: "当前窗口没有可分组的标签页。",
    rulesApplied: "已创建 {n} 个分组。",
    ruleInvalidRegex: "正则表达式无效。",
    ruleNeedCriteria: "至少填写一个匹配条件。",
    groupCurrentWindow: "按规则分组当前窗口",
    fallbackText: "未命中的按域名分组",
    invalidName: "请填写名称。",
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
var WS_FILE = "workspaces.json";
var RULES_FILE = "tabGroups.json";

var state = {
  model: Bookmarks.emptyModel(),
  etag: null,
  filter: { kind: "all", value: "" },
  query: "",
  since: "all",
  view: "grid",
  syncedAt: 0,
  bytes: 0,
};

var appState = {
  view: "bookmarks",
  workspaces: { version: 1, workspaces: [] },
  workspacesEtag: null,
  tabRules: { version: 1, fallbackDomain: true, rules: [] },
  rulesEtag: null,
  wsSelected: {},
};

var editingBookmarkId = null;
var editingRuleId = null;
var editingWsId = null;
var pendingConfirm = null;

var lang =
  (navigator.language || "en").toLowerCase().indexOf("zh") === 0 ? "zh" : "en";
var t = COPY[lang];

var PINYIN =
  typeof PinyinIndex !== "undefined" && PinyinIndex && PinyinIndex.defaultTools
    ? PinyinIndex.defaultTools
    : null;

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
  try {
    var made = await makeClient();
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

/* ---------- banners ---------- */

function showIn(bannerId, message, actionText, actionFn) {
  var banner = $(bannerId);
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

function showBanner(message, actionText, actionFn) {
  showIn("banner", message, actionText, actionFn);
}

function showWsBanner(message, actionText, actionFn) {
  showIn("bannerWs", message, actionText, actionFn);
}

function showRulesBanner(message, actionText, actionFn) {
  showIn("bannerRules", message, actionText, actionFn);
}

function hideBanner() {
  $("banner").classList.add("hidden");
}

function openOptions() {
  chrome.runtime.openOptionsPage();
}

/* ---------- view switching ---------- */

function switchView(view) {
  appState.view = view;
  $("viewBookmarks").classList.toggle("hidden", view !== "bookmarks");
  $("viewWorkspaces").classList.toggle("hidden", view !== "workspaces");
  $("viewTabRules").classList.toggle("hidden", view !== "tabRules");
  $("switchBookmarks").classList.toggle("active", view === "bookmarks");
  $("switchWorkspaces").classList.toggle("active", view === "workspaces");
  $("switchTabRules").classList.toggle("active", view === "tabRules");
  $("bookmarksNav").classList.toggle("hidden", view !== "bookmarks");
  if (view === "workspaces") loadWorkspaces();
  if (view === "tabRules") loadTabRules();
}

/* ---------- bookmarks render ---------- */

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
  if (!folders.length) folderNav.appendChild(emptyHint());

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
  if (!tags.length) tagNav.appendChild(emptyHint());
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

function sinceMs(kind, now) {
  var d = new Date(now);
  switch (kind) {
    case "today":
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    case "week":
      return now - 7 * 86400000;
    case "month":
      return now - 30 * 86400000;
    case "year":
      return now - 365 * 86400000;
    default:
      return 0;
  }
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

function iconButton(label, text, onClick) {
  var btn = document.createElement("button");
  btn.className = label;
  btn.type = "button";
  btn.title = text;
  btn.setAttribute("aria-label", text);
  btn.textContent = text;
  btn.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
    onClick();
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

  if (item.note) {
    var note = document.createElement("p");
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
  meta.appendChild(
    iconButton("edit", "✎", function () {
      openTagDialog(item);
    })
  );
  meta.appendChild(
    iconButton("del", "✕", function () {
      confirmThen(t.confirmDelete, function () {
        state.model = Bookmarks.removeBookmark(state.model, item.id);
        persist().then(function (ok) {
          if (ok) flashStatus(t.deleted);
        });
      });
    })
  );

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
  row.appendChild(
    iconButton("edit", "✎", function () {
      openTagDialog(item);
    })
  );
  row.appendChild(
    iconButton("del", "✕", function () {
      confirmThen(t.confirmDelete, function () {
        state.model = Bookmarks.removeBookmark(state.model, item.id);
        persist().then(function (ok) {
          if (ok) flashStatus(t.deleted);
        });
      });
    })
  );
  return row;
}

function renderItems() {
  var filter = {
    query: state.query,
    folder: state.filter.kind === "folder" ? state.filter.value : null,
    tag: state.filter.kind === "tag" ? state.filter.value : null,
    since: sinceMs(state.since, Date.now()),
  };
  var items = BookmarksView.filterBookmarks(state.model, filter, PINYIN);

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
    empty.textContent = state.model.bookmarks.length === 0 ? t.empty : t.emptyFilter;
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

/* ---------- workspaces ---------- */

async function loadWorkspaces() {
  showIn("bannerWs", "");
  $("bannerWs").classList.add("hidden");
  var made = await makeClient();
  if (!made.cfg.instanceUrl) {
    showWsBanner(t.needConfig, t.openOptions, openOptions);
    renderWorkspaces();
    return;
  }
  var res = await made.client.getFile(WS_FILE);
  if (!res.ok) {
    showWsBanner(errorText(res.kind), t.openOptions, openOptions);
    renderWorkspaces();
    return;
  }
  appState.workspacesEtag = res.etag;
  var parsed = null;
  if (res.text) {
    try {
      parsed = JSON.parse(res.text);
    } catch (err) {
      parsed = null;
    }
  }
  appState.workspaces = Workspaces.normalize(parsed);
  appState.wsSelected = {};
  renderWorkspaces();
}

async function persistWorkspaces() {
  var made = await makeClient();
  if (!made.cfg.instanceUrl) {
    showWsBanner(t.needConfig, t.openOptions, openOptions);
    return false;
  }
  var put = await made.client.putFile(
    WS_FILE,
    JSON.stringify(appState.workspaces, null, 2),
    "application/json; charset=utf-8",
    appState.workspacesEtag
  );
  if (put.ok) return true;
  if (put.kind === "conflict") {
    showWsBanner(t.errConflict);
    await loadWorkspaces();
    return false;
  }
  showWsBanner(errorText(put.kind), t.openOptions, openOptions);
  return false;
}

function findWorkspace(id) {
  var list = appState.workspaces.workspaces;
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i];
  }
  return null;
}

function wsCheckedKey(wsId, idx) {
  return wsId + ":" + idx;
}

function renderWorkspaces() {
  var list = appState.workspaces.workspaces;
  var container = $("wsList");
  container.textContent = "";
  $("wsCount").textContent = fmt(t.wsCount, { n: list.length });

  var empty = $("wsEmpty");
  if (!list.length) {
    empty.textContent = t.wsEmpty;
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  for (var i = 0; i < list.length; i++) {
    (function (ws) {
      container.appendChild(wsCard(ws));
    })(list[i]);
  }
}

function wsCard(ws) {
  var card = document.createElement("article");
  card.className = "wsCard";

  var head = document.createElement("header");
  head.className = "wsHead";
  var title = document.createElement("h3");
  title.textContent = ws.name;
  var meta = document.createElement("span");
  meta.className = "wsMeta";
  meta.textContent =
    ws.pages.length + " · " + BookmarksView.formatDate(ws.createdAt, lang);
  head.appendChild(title);
  head.appendChild(meta);
  head.appendChild(
    iconButton("del", "✕", function () {
      confirmThen(t.confirmDelete, async function () {
        appState.workspaces = Workspaces.remove(appState.workspaces, ws.id);
        if (await persistWorkspaces()) renderWorkspaces();
      });
    })
  );
  card.appendChild(head);

  var actions = document.createElement("div");
  actions.className = "wsActions";
  var restoreAll = document.createElement("button");
  restoreAll.className = "primary";
  restoreAll.type = "button";
  restoreAll.textContent = t.restoreAll;
  restoreAll.addEventListener("click", function () {
    restoreWorkspace(ws.id, null);
  });
  var restoreSel = document.createElement("button");
  restoreSel.className = "ghost";
  restoreSel.type = "button";
  restoreSel.textContent = t.restoreSelected;
  restoreSel.addEventListener("click", function () {
    var idxs = [];
    for (var k = 0; k < ws.pages.length; k++) {
      if (appState.wsSelected[wsCheckedKey(ws.id, k)]) idxs.push(k);
    }
    restoreWorkspace(ws.id, idxs);
  });
  var renameBtn = document.createElement("button");
  renameBtn.className = "ghost";
  renameBtn.type = "button";
  renameBtn.textContent = t.rename;
  renameBtn.addEventListener("click", function () {
    openWsNameDialog(ws);
  });
  actions.appendChild(restoreAll);
  actions.appendChild(restoreSel);
  actions.appendChild(renameBtn);
  card.appendChild(actions);

  var pages = document.createElement("div");
  pages.className = "wsPages";
  for (var i = 0; i < ws.pages.length; i++) {
    (function (page, idx) {
      pages.appendChild(wsPageRow(ws.id, page, idx));
    })(ws.pages[i], i);
  }
  card.appendChild(pages);
  return card;
}

function wsPageRow(wsId, page, idx) {
  var row = document.createElement("label");
  row.className = "pageRow";
  var box = document.createElement("input");
  box.type = "checkbox";
  box.checked = Boolean(appState.wsSelected[wsCheckedKey(wsId, idx)]);
  box.addEventListener("change", function () {
    appState.wsSelected[wsCheckedKey(wsId, idx)] = box.checked;
  });
  row.appendChild(box);
  var text = document.createElement("span");
  text.className = "pageRowTitle";
  text.textContent = page.title || BookmarksView.domainOf(page.url) || page.url;
  row.appendChild(text);
  if (page.pinned) {
    var pin = document.createElement("span");
    pin.className = "chip";
    pin.textContent = t.pinMark;
    row.appendChild(pin);
  }
  if (page.tabGroup && page.tabGroup.title) {
    var chip = document.createElement("span");
    chip.className = "chip tag";
    chip.textContent = fmt(t.groupMark, { t: page.tabGroup.title });
    row.appendChild(chip);
  }
  return row;
}

async function saveCurrentWindow() {
  var tabs = await chrome.tabs.query({ currentWindow: true });
  var pages = [];
  for (var i = 0; i < tabs.length; i++) {
    var tab = tabs[i];
    if (!Workspaces.isWebUrl(tab.url)) continue;
    var group = null;
    if (tab.groupId && tab.groupId !== -1 && chrome.tabGroups) {
      try {
        var g = await chrome.tabGroups.get(tab.groupId);
        if (g && g.title) group = { title: g.title, color: g.color };
      } catch (err) {
        group = null;
      }
    }
    pages.push({
      url: tab.url,
      title: tab.title || "",
      pinned: Boolean(tab.pinned),
      tabGroup: group,
    });
  }
  if (!pages.length) {
    showWsBanner(t.wsNoPages);
    return;
  }
  openWsNameDialog(null, pages);
}

async function restoreWorkspace(wsId, selectedIdxs) {
  var ws = findWorkspace(wsId);
  if (!ws) return;
  var pages = Workspaces.restorablePages(ws, selectedIdxs);
  if (!pages.length) return;
  var win = await chrome.windows.create({
    url: pages.map(function (p) {
      return p.url;
    }),
    focused: true,
  });
  var created = (win && win.tabs) || [];
  var groupsByTitle = {};
  for (var i = 0; i < pages.length && i < created.length; i++) {
    if (pages[i].pinned) chrome.tabs.update(created[i].id, { pinned: true });
    var g = pages[i].tabGroup;
    if (g && g.title && chrome.tabGroups) {
      var entry = groupsByTitle[g.title] || (groupsByTitle[g.title] = { color: g.color, tabIds: [] });
      entry.tabIds.push(created[i].id);
    }
  }
  var titles = Object.keys(groupsByTitle);
  for (var j = 0; j < titles.length; j++) {
    try {
      var gid = await chrome.tabGroups.group({ tabIds: groupsByTitle[titles[j]].tabIds });
      await chrome.tabGroups.update(gid, {
        title: titles[j],
        color: groupsByTitle[titles[j]].color,
      });
    } catch (err) {
      /* grouping saved tabs is best-effort */
    }
  }
}

/* ---------- tab group rules ---------- */

async function loadTabRules() {
  $("bannerRules").classList.add("hidden");
  var made = await makeClient();
  if (!made.cfg.instanceUrl) {
    showRulesBanner(t.needConfig, t.openOptions, openOptions);
    renderTabRules();
    return;
  }
  var res = await made.client.getFile(RULES_FILE);
  if (!res.ok) {
    showRulesBanner(errorText(res.kind), t.openOptions, openOptions);
    renderTabRules();
    return;
  }
  appState.rulesEtag = res.etag;
  var parsed = null;
  if (res.text) {
    try {
      parsed = JSON.parse(res.text);
    } catch (err) {
      parsed = null;
    }
  }
  appState.tabRules = TabRules.normalize(parsed);
  renderTabRules();
}

async function persistTabRules() {
  var made = await makeClient();
  if (!made.cfg.instanceUrl) {
    showRulesBanner(t.needConfig, t.openOptions, openOptions);
    return false;
  }
  var put = await made.client.putFile(
    RULES_FILE,
    JSON.stringify(appState.tabRules, null, 2),
    "application/json; charset=utf-8",
    appState.rulesEtag
  );
  if (put.ok) return true;
  if (put.kind === "conflict") {
    showRulesBanner(t.errConflict);
    await loadTabRules();
    return false;
  }
  showRulesBanner(errorText(put.kind), t.openOptions, openOptions);
  return false;
}

function renderTabRules() {
  $("fallbackDomain").checked = Boolean(appState.tabRules.fallbackDomain);

  var container = $("ruleList");
  container.textContent = "";
  var rules = appState.tabRules.rules;

  var empty = $("rulesEmpty");
  if (!rules.length) {
    empty.textContent = t.rulesEmpty;
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  for (var i = 0; i < rules.length; i++) {
    (function (rule) {
      container.appendChild(ruleRow(rule));
    })(rules[i]);
  }
}

function ruleSummary(rule) {
  var labels =
    lang === "zh"
      ? { domain: "域: ", url: "url~ ", title: "标题~ ", regex: "re: " }
      : { domain: "domains: ", url: "url~ ", title: "title~ ", regex: "re: " };
  var parts = [];
  if (rule.domain) parts.push(labels.domain + rule.domain);
  if (rule.urlIncludes) parts.push(labels.url + rule.urlIncludes);
  if (rule.titleIncludes) parts.push(labels.title + rule.titleIncludes);
  if (rule.regex) parts.push(labels.regex + rule.regex);
  return parts.join(" · ");
}

function ruleRow(rule) {
  var row = document.createElement("div");
  row.className = "row ruleRow";

  var dot = document.createElement("span");
  dot.className = "colorDot " + rule.color;
  row.appendChild(dot);

  var title = document.createElement("span");
  title.className = "rowTitle";
  title.textContent = rule.title || "—";
  row.appendChild(title);

  var summary = document.createElement("span");
  summary.className = "rowDomain";
  summary.textContent = ruleSummary(rule);
  row.appendChild(summary);

  var order = document.createElement("span");
  order.className = "chip";
  order.textContent = "#" + rule.order;
  row.appendChild(order);

  row.appendChild(
    iconButton("edit", "✎", function () {
      openRuleDialog(rule);
    })
  );
  row.appendChild(
    iconButton("del", "✕", function () {
      confirmThen(t.confirmDelete, async function () {
        appState.tabRules = TabRules.remove(appState.tabRules, rule.id);
        if (await persistTabRules()) renderTabRules();
      });
    })
  );
  return row;
}

async function applyGroupsToCurrentWindow() {
  var tabs = await chrome.tabs.query({ currentWindow: true });
  var plans = TabRules.planGroups(appState.tabRules, tabs);
  if (!plans.length) {
    showRulesBanner(t.rulesNone);
    return;
  }
  var createdGroups = 0;
  for (var i = 0; i < plans.length; i++) {
    var plan = plans[i];
    if (!plan.tabIds.length) continue;
    if (plan.kind === "domain" && plan.tabIds.length < 2) continue;
    try {
      var gid = await chrome.tabGroups.group({ tabIds: plan.tabIds });
      await chrome.tabGroups.update(gid, {
        title: plan.title || "Group",
        color: plan.color,
        collapsed: plan.collapsed,
      });
      createdGroups += 1;
    } catch (err) {
      /* grouping is best-effort per group */
    }
  }
  showRulesBanner(fmt(t.rulesApplied, { n: createdGroups }));
}

function openRuleDialog(rule) {
  editingRuleId = rule ? rule.id : null;
  $("ruleError").textContent = "";
  $("ruleDomain").value = rule ? rule.domain : "";
  $("ruleUrl").value = rule ? rule.urlIncludes : "";
  $("ruleTitle").value = rule ? rule.titleIncludes : "";
  $("ruleRegex").value = rule ? rule.regex : "";
  $("ruleName").value = rule ? rule.title : "";
  $("ruleColor").value = rule ? rule.color : "grey";
  $("ruleOrder").value = rule ? String(rule.order) : "0";
  $("ruleCollapsed").checked = rule ? rule.collapsed : false;
  $("ruleDialog").showModal();
}

async function submitRule(event) {
  event.preventDefault();
  var regex = $("ruleRegex").value.trim();
  if (regex) {
    try {
      new RegExp(regex, "i");
    } catch (err) {
      $("ruleError").textContent = t.ruleInvalidRegex;
      return;
    }
  }
  var rule = {
    id: editingRuleId || undefined,
    domain: $("ruleDomain").value.trim(),
    urlIncludes: $("ruleUrl").value.trim(),
    titleIncludes: $("ruleTitle").value.trim(),
    regex: regex,
    title: $("ruleName").value.trim(),
    color: $("ruleColor").value,
    collapsed: $("ruleCollapsed").checked,
    order: parseInt($("ruleOrder").value, 10) || 0,
  };
  if (!rule.domain && !rule.urlIncludes && !rule.titleIncludes && !rule.regex) {
    $("ruleError").textContent = t.ruleNeedCriteria;
    return;
  }
  appState.tabRules = TabRules.upsert(appState.tabRules, rule);
  $("ruleDialog").close();
  if (await persistTabRules()) renderTabRules();
}

/* ---------- tag / note editing ---------- */

function openTagDialog(item) {
  editingBookmarkId = item.id;
  $("tagTarget").textContent = item.title || BookmarksView.domainOf(item.url) || item.url;
  $("tagInput").value = (Array.isArray(item.tags) ? item.tags : []).join(", ");
  $("noteInput").value = item.note || "";
  $("tagDialog").showModal();
  $("tagInput").focus();
}

async function submitTagForm(event) {
  event.preventDefault();
  var item = null;
  for (var i = 0; i < state.model.bookmarks.length; i++) {
    if (state.model.bookmarks[i].id === editingBookmarkId) {
      item = state.model.bookmarks[i];
      break;
    }
  }
  if (!item) {
    $("tagDialog").close();
    return;
  }
  state.model = Bookmarks.updateBookmark(state.model, editingBookmarkId, {
    tags: $("tagInput").value.split(","),
    note: $("noteInput").value,
  });
  $("tagDialog").close();
  var ok = await persist();
  if (ok) flashStatus(t.added);
}

/* ---------- add bookmark / import / export ---------- */

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

/* ---------- dialogs ---------- */

function confirmThen(message, fn) {
  pendingConfirm = fn;
  $("confirmText").textContent = message;
  $("confirmDialog").showModal();
}

function openWsNameDialog(workspace, pendingPages) {
  editingWsId = workspace ? workspace.id : null;
  openWsNameDialog.pendingPages = pendingPages || null;
  $("wsNameError").textContent = "";
  $("wsNameInput").value = workspace
    ? workspace.name
    : new Date().toLocaleString(lang === "zh" ? "zh-CN" : "en-US", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
  $("wsNameDialog").showModal();
  $("wsNameInput").focus();
}

async function submitWsName(event) {
  event.preventDefault();
  var name = $("wsNameInput").value.trim();
  if (!name) {
    $("wsNameError").textContent = t.invalidName;
    return;
  }
  if (editingWsId) {
    appState.workspaces = Workspaces.rename(appState.workspaces, editingWsId, name);
  } else if (openWsNameDialog.pendingPages) {
    var ws = Workspaces.create(name, openWsNameDialog.pendingPages, Date.now());
    appState.workspaces = Workspaces.upsert(appState.workspaces, ws);
    openWsNameDialog.pendingPages = null;
  }
  $("wsNameDialog").close();
  if (await persistWorkspaces()) renderWorkspaces();
}

/* ---------- boot ---------- */

function fillSinceSelect() {
  var select = $("sinceSelect");
  var options = [
    ["all", t.sinceAll],
    ["today", t.sinceToday],
    ["week", t.sinceWeek],
    ["month", t.sinceMonth],
    ["year", t.sinceYear],
  ];
  for (var i = 0; i < options.length; i++) {
    var option = document.createElement("option");
    option.value = options[i][0];
    option.textContent = options[i][1];
    select.appendChild(option);
  }
  select.value = "all";
}

function fillColorSelect() {
  var select = $("ruleColor");
  var colors = TabRules.COLORS;
  for (var i = 0; i < colors.length; i++) {
    var option = document.createElement("option");
    option.value = colors[i];
    option.textContent = colors[i];
    select.appendChild(option);
  }
}

function applyCopy() {
  document.title = t.title;
  $("brandSub").textContent = t.brandSub;
  $("switchBookmarks").textContent = t.viewBookmarks;
  $("switchWorkspaces").textContent = t.viewWorkspaces;
  $("switchTabRules").textContent = t.viewTabRules;
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
  $("tagDialogTitle").textContent = t.tagDialogTitle;
  $("tagInputLabel").textContent = t.tagInputLabel;
  $("noteInputLabel").textContent = t.noteInputLabel;
  $("tagCancel").textContent = t.cancel;
  $("tagSave").textContent = t.save;
  $("wsNameTitle").textContent = t.wsNameTitle;
  $("wsNameCancel").textContent = t.cancel;
  $("wsNameSave").textContent = t.save;
  $("ruleDialogTitle").textContent = t.ruleDialogTitle;
  $("ruleDomainLabel").textContent = t.ruleDomainLabel;
  $("ruleUrlLabel").textContent = t.ruleUrlLabel;
  $("ruleTitleLabel").textContent = t.ruleTitleLabel;
  $("ruleRegexLabel").textContent = t.ruleRegexLabel;
  $("ruleNameLabel").textContent = t.ruleNameLabel;
  $("ruleColorLabel").textContent = t.ruleColorLabel;
  $("ruleOrderLabel").textContent = t.ruleOrderLabel;
  $("ruleCollapsedText").textContent = t.ruleCollapsedText;
  $("ruleCancel").textContent = t.cancel;
  $("ruleSave").textContent = t.save;
  $("confirmCancel").textContent = t.cancel;
  $("confirmOk").textContent = t.deleteLabel;
  $("saveWindowBtn").textContent = t.saveWindow;
  $("applyGroupsBtn").textContent = t.groupCurrentWindow;
  $("ruleAddBtn").textContent = t.ruleAdd;
  $("fallbackText").textContent = t.fallbackText;
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
  $("switchBookmarks").addEventListener("click", function () {
    switchView("bookmarks");
  });
  $("switchWorkspaces").addEventListener("click", function () {
    switchView("workspaces");
  });
  $("switchTabRules").addEventListener("click", function () {
    switchView("tabRules");
  });
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
  $("sinceSelect").addEventListener("change", function (event) {
    state.since = event.target.value;
    renderItems();
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
  $("tagCancel").addEventListener("click", function () {
    $("tagDialog").close();
  });
  $("tagForm").addEventListener("submit", submitTagForm);
  $("wsNameCancel").addEventListener("click", function () {
    openWsNameDialog.pendingPages = null;
    $("wsNameDialog").close();
  });
  $("wsNameForm").addEventListener("submit", submitWsName);
  $("ruleAddBtn").addEventListener("click", function () {
    openRuleDialog(null);
  });
  $("ruleCancel").addEventListener("click", function () {
    $("ruleDialog").close();
  });
  $("ruleForm").addEventListener("submit", submitRule);
  $("applyGroupsBtn").addEventListener("click", applyGroupsToCurrentWindow);
  $("fallbackDomain").addEventListener("change", async function (event) {
    appState.tabRules = TabRules.normalize({
      fallbackDomain: event.target.checked,
      rules: appState.tabRules.rules,
    });
    if (await persistTabRules()) renderTabRules();
  });
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
  $("saveWindowBtn").addEventListener("click", saveCurrentWindow);
  $("driveBtn").addEventListener("click", async function () {
    var cfg = await loadConfig();
    if (cfg.instanceUrl) chrome.tabs.create({ url: cfg.instanceUrl });
    else openOptions();
  });
  document.addEventListener("keydown", function (event) {
    var target = event.target;
    var typing =
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable);
    if (event.key === "/" && !typing) {
      event.preventDefault();
      $("search").focus();
    }
  });
}

applyCopy();
fillSinceSelect();
fillColorSelect();
initTheme();
wireEvents();
renderFromCache();
switchView("bookmarks");
refresh();
