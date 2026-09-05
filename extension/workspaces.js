"use strict";

/**
 * Workspace model: a saved snapshot of one browser window — its pages in
 * order, pinned flags, and native tab-group metadata — restorable later.
 * Pure model code; chrome.windows/tabs calls live in the page/App layer.
 */

var Workspaces = (function () {
  var MODEL_VERSION = 1;
  var idCounter = 0;

  function makeId() {
    idCounter += 1;
    return "ws-" + Date.now().toString(36) + "-" + idCounter.toString(36);
  }

  function asString(value) {
    return typeof value === "string" ? value : "";
  }

  function urlKeyOf(url) {
    var s = String(url == null ? "" : url).trim();
    if (!s) return "";
    try {
      var u = new URL(s);
      if (u.protocol === "http:" || u.protocol === "https:") {
        u.hash = "";
        return u.href;
      }
    } catch (err) {
      /* keep the trimmed raw string */
    }
    return s;
  }

  function isWebUrl(url) {
    return /^https?:\/\//i.test(String(url || "").trim());
  }

  function sanitizePage(raw) {
    var src = raw && typeof raw === "object" ? raw : {};
    var group = src.tabGroup && typeof src.tabGroup === "object" ? src.tabGroup : null;
    return {
      url: asString(src.url).trim(),
      title: asString(src.title),
      pinned: Boolean(src.pinned),
      tabGroup: group ? { title: asString(group.title), color: asString(group.color) } : null,
    };
  }

  function sanitizeWorkspace(raw) {
    var src = raw && typeof raw === "object" ? raw : {};
    var pages = Array.isArray(src.pages) ? src.pages : [];
    var cleanPages = [];
    for (var i = 0; i < pages.length; i++) {
      var page = sanitizePage(pages[i]);
      if (isWebUrl(page.url)) cleanPages.push(page);
    }
    return {
      id: asString(src.id) || makeId(),
      name: asString(src.name) || "Workspace",
      createdAt:
        typeof src.createdAt === "number" && isFinite(src.createdAt) ? src.createdAt : 0,
      pages: cleanPages,
    };
  }

  function normalize(raw) {
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.workspaces)) {
      return { version: MODEL_VERSION, workspaces: [] };
    }
    var clean = [];
    for (var i = 0; i < raw.workspaces.length; i++) {
      if (!raw.workspaces[i] || typeof raw.workspaces[i] !== "object") continue;
      clean.push(sanitizeWorkspace(raw.workspaces[i]));
    }
    return { version: MODEL_VERSION, workspaces: clean };
  }

  function create(name, pages, now) {
    return sanitizeWorkspace({
      id: makeId(),
      name: asString(name).trim() || "Workspace",
      createdAt: typeof now === "number" ? now : Date.now(),
      pages: pages,
    });
  }

  /** Save-or-replace by id; returns the normalized list. */
  function upsert(list, workspace) {
    var model = normalize(list);
    var clean = sanitizeWorkspace(workspace);
    var replaced = false;
    var out = [];
    for (var i = 0; i < model.workspaces.length; i++) {
      if (model.workspaces[i].id === clean.id) {
        out.push(clean);
        replaced = true;
      } else {
        out.push(model.workspaces[i]);
      }
    }
    if (!replaced) out.push(clean);
    return { version: MODEL_VERSION, workspaces: out };
  }

  function remove(list, id) {
    var model = normalize(list);
    return {
      version: MODEL_VERSION,
      workspaces: model.workspaces.filter(function (ws) {
        return ws.id !== id;
      }),
    };
  }

  function rename(list, id, name) {
    var model = normalize(list);
    var clean = asString(name).trim();
    for (var i = 0; i < model.workspaces.length; i++) {
      if (model.workspaces[i].id === id && clean) model.workspaces[i].name = clean;
    }
    return model;
  }

  /** Pages to reopen, deduped by URL in saved order. */
  function restorablePages(workspace, selectedIds) {
    var model = normalize({ workspaces: [workspace] });
    var ws = model.workspaces[0];
    if (!ws) return [];
    var seen = Object.create(null);
    var out = [];
    var pages = ws.pages;
    for (var i = 0; i < pages.length; i++) {
      var page = pages[i];
      if (selectedIds && selectedIds.indexOf(i) === -1) continue;
      var key = urlKeyOf(page.url);
      if (!key || seen[key]) continue;
      seen[key] = true;
      out.push(page);
    }
    return out;
  }

  return {
    create: create,
    isWebUrl: isWebUrl,
    makeId: makeId,
    normalize: normalize,
    remove: remove,
    rename: rename,
    restorablePages: restorablePages,
    upsert: upsert,
    urlKeyOf: urlKeyOf,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = Workspaces;
}
