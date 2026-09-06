"use strict";

/**
 * Pure view helpers for the bookmark library page. No DOM, no chrome.* —
 * everything here is unit-testable via the module.exports guard.
 */

var BookmarksView = (function () {
  function domainOf(url) {
    var s = String(url || "").trim();
    try {
      var u = new URL(s);
      if (u.protocol === "http:" || u.protocol === "https:") return u.hostname;
      return "";
    } catch (err) {
      return "";
    }
  }

  function folderList(model) {
    var counts = Object.create(null);
    var order = [];
    var items = model && Array.isArray(model.bookmarks) ? model.bookmarks : [];
    for (var i = 0; i < items.length; i++) {
      var name = String(items[i].folder || "");
      if (!counts[name]) {
        counts[name] = 0;
        order.push(name);
      }
      counts[name] += 1;
    }
    // Declared empty folders (issue #63) join the list with count 0.
    var declared = model && Array.isArray(model.folders) ? model.folders : [];
    for (var d = 0; d < declared.length; d++) {
      var path = String(declared[d] || "");
      if (!path || counts[path]) continue;
      counts[path] = 0;
      order.push(path);
    }
    order.sort(function (a, b) {
      if (a === "" && b !== "") return -1;
      if (b === "" && a !== "") return 1;
      return a < b ? -1 : a > b ? 1 : 0;
    });
    return order.map(function (name) {
      return { name: name, count: counts[name] };
    });
  }

  function tagList(model) {
    var counts = Object.create(null);
    var items = model && Array.isArray(model.bookmarks) ? model.bookmarks : [];
    for (var i = 0; i < items.length; i++) {
      var tags = Array.isArray(items[i].tags) ? items[i].tags : [];
      for (var j = 0; j < tags.length; j++) {
        var tag = String(tags[j] || "").trim();
        if (!tag) continue;
        counts[tag] = (counts[tag] || 0) + 1;
      }
    }
    return Object.keys(counts)
      .map(function (name) {
        return { name: name, count: counts[name] };
      })
      .sort(function (a, b) {
        if (b.count !== a.count) return b.count - a.count;
        return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
      });
  }

  function matchesQuery(item, query, pinyinTools) {
    var q = String(query || "").trim().toLowerCase();
    if (!q) return true;
    var haystacks = [
      item.title,
      item.url,
      item.note,
      item.folder,
      (Array.isArray(item.tags) ? item.tags : []).join(" "),
      domainOf(item.url),
    ];
    for (var i = 0; i < haystacks.length; i++) {
      if (String(haystacks[i] || "").toLowerCase().indexOf(q) !== -1) return true;
    }
    if (pinyinTools && /^[a-z0-9]+$/.test(q)) {
      var texts = [item.title, item.note, (item.tags || []).join(" ")];
      for (var j = 0; j < texts.length; j++) {
        if (pinyinTools.matchText(texts[j], q)) return true;
      }
    }
    return false;
  }

  /**
   * opts: {query, folder, tag, since, pinned} — null/undefined filter means
   * "any"; since is an epoch-ms lower bound on the bookmark's added time;
   * pinned: true keeps only pinned bookmarks (issue #63 sidebar entry).
   */
  function filterBookmarks(model, opts, pinyinTools) {
    var options = opts || {};
    var items = model && Array.isArray(model.bookmarks) ? model.bookmarks : [];
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (typeof options.folder === "string" && String(item.folder || "") !== options.folder) {
        continue;
      }
      if (options.tag && (item.tags || []).indexOf(options.tag) === -1) continue;
      if (options.since && !(item.added >= options.since)) continue;
      if (options.pinned && !item.pinned) continue;
      if (!matchesQuery(item, options.query, pinyinTools)) continue;
      out.push(item);
    }
    return out;
  }

  /**
   * Issue #63: pinned bookmarks lead the list (newest pin first, by
   * pinnedAt), the rest keep their relative order.
   */
  function orderPinnedFirst(items) {
    var list = Array.isArray(items) ? items.slice() : [];
    var pinned = [];
    var rest = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].pinned) pinned.push(list[i]);
      else rest.push(list[i]);
    }
    pinned.sort(function (a, b) {
      var at = a.pinnedAt || 0;
      var bt = b.pinnedAt || 0;
      if (bt !== at) return bt - at;
      return 0;
    });
    return pinned.concat(rest);
  }

  function formatBytes(n) {
    var value = typeof n === "number" && isFinite(n) && n > 0 ? n : 0;
    if (value < 1024) return value + " B";
    if (value < 1024 * 1024) return (value / 1024).toFixed(1) + " KB";
    return (value / (1024 * 1024)).toFixed(2) + " MB";
  }

  function formatRelative(ms, now, lang) {
    var target = typeof ms === "number" && isFinite(ms) && ms > 0 ? ms : 0;
    if (!target) return lang === "zh" ? "从未同步" : "never synced";
    var seconds = Math.max(0, Math.floor(((now || Date.now()) - target) / 1000));
    if (seconds < 60) return lang === "zh" ? "刚刚" : "just now";
    var minutes = Math.floor(seconds / 60);
    if (minutes < 60) return lang === "zh" ? minutes + " 分钟前" : minutes + "m ago";
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return lang === "zh" ? hours + " 小时前" : hours + "h ago";
    var days = Math.floor(hours / 24);
    if (days < 30) return lang === "zh" ? days + " 天前" : days + "d ago";
    var d = new Date(target);
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return (
      d.getFullYear() +
      "/" +
      (m < 10 ? "0" + m : m) +
      "/" +
      (day < 10 ? "0" + day : day)
    );
  }

  function formatDate(ms, lang) {
    var target = typeof ms === "number" && isFinite(ms) && ms > 0 ? ms : 0;
    if (!target) return lang === "zh" ? "未知" : "unknown";
    var d = new Date(target);
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return (
      d.getFullYear() +
      "/" +
      (m < 10 ? "0" + m : m) +
      "/" +
      (day < 10 ? "0" + day : day)
    );
  }

  /**
   * Issue #63 P2: sanitize stored filter presets ({name, tag, since}) —
   * drop junk rows, require name+tag, cap the list so sync storage stays
   * small. `since` must be one of the sinceSelect values.
   */
  var SINCE_KINDS = ["all", "today", "week", "month", "year"];

  function normalizePresets(raw, limit) {
    if (!Array.isArray(raw)) return [];
    var cap = typeof limit === "number" && isFinite(limit) && limit > 0 ? limit : 12;
    var out = [];
    var seen = Object.create(null);
    for (var i = 0; i < raw.length && out.length < cap; i++) {
      var p = raw[i];
      if (!p || typeof p !== "object") continue;
      var name = typeof p.name === "string" ? p.name.trim().slice(0, 40) : "";
      var tag = typeof p.tag === "string" ? p.tag.trim().slice(0, 64) : "";
      var since = SINCE_KINDS.indexOf(p.since) !== -1 ? p.since : "all";
      if (!name || !tag || seen[name]) continue;
      seen[name] = true;
      out.push({ name: name, tag: tag, since: since });
    }
    return out;
  }

  /**
   * Issue #84 / #82: which stored preset matches the active tag+since filter.
   * Returns the preset object or null. Drives dropdown selection + ✕ visibility —
   * callers must re-run this after applyPreset / any filter or since change.
   */
  function findActivePreset(presets, filterKind, filterValue, since) {
    if (filterKind !== "tag" || !Array.isArray(presets)) return null;
    var tag = typeof filterValue === "string" ? filterValue : "";
    var sinceKind = typeof since === "string" ? since : "all";
    for (var i = 0; i < presets.length; i++) {
      var p = presets[i];
      if (p && p.tag === tag && p.since === sinceKind) return p;
    }
    return null;
  }

  return {
    domainOf: domainOf,
    fallbackLetter: function (item) {
      var t = String((item && item.title) || domainOf(item && item.url) || "").trim();
      return t ? t.charAt(0).toUpperCase() : "?";
    },
    filterBookmarks: filterBookmarks,
    findActivePreset: findActivePreset,
    formatDate: formatDate,
    formatBytes: formatBytes,
    formatRelative: formatRelative,
    folderList: folderList,
    matchesQuery: matchesQuery,
    normalizePresets: normalizePresets,
    orderPinnedFirst: orderPinnedFirst,
    tagList: tagList,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = BookmarksView;
}
