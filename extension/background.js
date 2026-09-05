"use strict";

importScripts("url.js", "bookmarks.js", "dav.js");

var MENU_SAVE = "davflare-save-page";
var MENU_MODE = "davflare-toggle-mode";
var BOOKMARKS_PAGE = "bookmarks.html";

var MESSAGES = {
  en: {
    appTitle: "Davflare",
    errTitle: "Davflare — action failed",
    saveOk: "Bookmark saved to your library.",
    saveExists: "This page is already in your library.",
    skipPage: "Only http(s) pages can be saved.",
    modeTitle: "Default mode switched",
    modeDrive: "Toolbar will open your drive.",
    modeBookmarks: "Toolbar will open your bookmark library.",
  },
  zh: {
    appTitle: "Davflare",
    errTitle: "Davflare — 操作失败",
    saveOk: "已收藏到书签库。",
    saveExists: "该页面已在书签库中。",
    skipPage: "只能收藏 http(s) 页面。",
    modeTitle: "默认模式已切换",
    modeDrive: "工具栏点击将打开网盘。",
    modeBookmarks: "工具栏点击将打开书签库。",
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
  conflict: {
    en: "The library changed elsewhere. Please retry.",
    zh: "书签库已在别处更新，请重试。",
  },
};

function pickLang() {
  return (navigator.language || "en").toLowerCase().indexOf("zh") === 0 ? "zh" : "en";
}

function t() {
  return MESSAGES[pickLang()];
}

function errorText(kind) {
  var known = ERROR_COPY[kind];
  return known ? known[pickLang()] : "HTTP " + kind;
}

function flashBadge(text) {
  chrome.action.setBadgeText({ text: text });
  setTimeout(function () {
    chrome.action.setBadgeText({ text: "" });
  }, 2500);
}

function notify(title, message) {
  try {
    chrome.notifications.create(
      {
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: title,
        message: message,
      },
      function () {
        void chrome.runtime.lastError;
      }
    );
  } catch (err) {
    /* notifications are best-effort feedback */
  }
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

async function openLibraryPage(view) {
  var baseUrl = chrome.runtime.getURL(BOOKMARKS_PAGE);
  var tabs = await chrome.tabs.query({ url: baseUrl + "*"});
  if (tabs && tabs.length > 0) {
    var tab = tabs[0];
    await chrome.tabs.update(tab.id, { active: true });
    if (typeof tab.windowId === "number") {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    return;
  }
  chrome.tabs.create({ url: baseUrl + "?view=" + view });
}

async function handleToolbarClick() {
  var stored = await chrome.storage.sync.get(["instanceUrl", "toolbarMode"]);
  var target = resolveToolbarTarget(mergeSettings(stored));
  if (target.action === "bookmarks") {
    await openLibraryPage("bookmarks");
    return;
  }
  if (target.action === "drive") {
    await openLibraryPage("drive");
    return;
  }
  // 未配置实例：打开书签库页的设置视图
  await openLibraryPage("settings");
}

async function toggleDefaultMode() {
  var stored = await chrome.storage.sync.get(["toolbarMode"]);
  var next = mergeSettings(stored).toolbarMode === "bookmarks" ? "drive" : "bookmarks";
  await chrome.storage.sync.set({ toolbarMode: next });
  var copy = t();
  notify(copy.modeTitle, next === "bookmarks" ? copy.modeBookmarks : copy.modeDrive);
}

async function savePage(tab) {
  var copy = t();
  var url = (tab && tab.url) || "";
  var title = (tab && tab.title) || "";
  if (!Bookmarks.isWebUrl(url)) {
    flashBadge("!");
    notify(copy.errTitle, copy.skipPage);
    return;
  }
  var client = DavflareDav.createDavClient(await loadConfig());
  var res = await client.getBookmarks();
  if (!res.ok) {
    flashBadge("!");
    notify(copy.errTitle, errorText(res.kind));
    return;
  }

  var model = Bookmarks.parseHtml(res.html || "");
  if (res.jsonText) {
    var parsed = Bookmarks.modelFromJson(res.jsonText);
    if (parsed.ok) model = Bookmarks.adoptRichFields(model, parsed.model);
  }
  var add = Bookmarks.addBookmark(model, { title: title, url: url, added: Date.now() });
  if (!add.added) {
    flashBadge("✓");
    notify(copy.appTitle, copy.saveExists);
    return;
  }

  var put = await client.putBookmarks({
    html: Bookmarks.serializeHtml(add.model),
    json: Bookmarks.modelToJsonText(add.model),
    etag: res.etag,
  });
  if (!put.ok) {
    flashBadge("!");
    notify(copy.errTitle, errorText(put.kind));
    return;
  }
  flashBadge("✓");
  notify(copy.appTitle, copy.saveOk);
}

chrome.action.onClicked.addListener(function () {
  handleToolbarClick();
});

chrome.contextMenus.onClicked.addListener(function (info, tab) {
  if (info.menuItemId === MENU_MODE) {
    toggleDefaultMode();
    return;
  }
  if (info.menuItemId === MENU_SAVE) {
    savePage(tab);
  }
});

chrome.runtime.onInstalled.addListener(function () {
  var zh = pickLang() === "zh";
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
      title: zh ? "切换工具栏默认模式" : "Switch toolbar default mode",
      contexts: ["action"],
    },
    function () {
      void chrome.runtime.lastError;
    }
  );
});
