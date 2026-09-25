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

  /**
   * HamHome-style sort options, applied within the pinned-first groups.
   * key: "default" (insertion order — current behaviour) | "latest" | "oldest"
   * | "title" | "domain". `locale` (e.g. "zh") collates titles; omit it for a
   * plain code-unit compare (tests).
   */
  var SORT_KEYS = ["default", "latest", "oldest", "title", "domain"];

  function compareBy(key, locale) {
    return function (a, b) {
      if (key === "latest" || key === "oldest") {
        var at = a && typeof a.added === "number" ? a.added : 0;
        var bt = b && typeof b.added === "number" ? b.added : 0;
        return key === "latest" ? bt - at : at - bt;
      }
      var av = "";
      var bv = "";
      if (key === "domain") {
        av = domainOf(a && a.url);
        bv = domainOf(b && b.url);
      } else {
        av = String((a && a.title) || "");
        bv = String((b && b.title) || "");
      }
      if (av === bv) return 0;
      if (locale && typeof av.localeCompare === "function") {
        var c = av.localeCompare(bv, locale, { sensitivity: "base", numeric: true });
        return c !== 0 ? c : av < bv ? -1 : 1;
      }
      return av < bv ? -1 : 1;
    };
  }

  function sortItems(items, key, locale) {
    var list = Array.isArray(items) ? items.slice() : [];
    var kind = SORT_KEYS.indexOf(key) !== -1 ? key : "default";
    if (kind === "default") return orderPinnedFirst(list);
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
    rest.sort(compareBy(kind, locale));
    return pinned.concat(rest);
  }

  /**
   * Drag-to-folder payload: dragging a selected bookmark moves the whole
   * selection (in the given display order); dragging an unselected one moves
   * just that bookmark.
   */
  function dragSelectionIds(item, sel, orderedIds) {
    var id = item && item.id;
    if (!id) return [];
    var selMap = sel && typeof sel === "object" ? sel : {};
    if (!selMap[id]) return [id];
    var ids = Array.isArray(orderedIds) ? orderedIds : [];
    var out = [];
    for (var i = 0; i < ids.length; i++) {
      if (selMap[ids[i]]) out.push(ids[i]);
    }
    return out.length ? out : [id];
  }

  /**
   * Tag-cloud size tiers: rank-based thirds of the sorted list (0 = small,
   * 2 = large) so the cloud always shows a balanced spread. Returns a
   * name → tier map.
   */
  function tagTiers(list) {
    var tiers = Object.create(null);
    var rows = Array.isArray(list) ? list : [];
    var n = rows.length;
    for (var i = 0; i < n; i++) {
      var t = n <= 2 ? (i === 0 ? 2 : 1) : i < n / 3 ? 2 : i < (2 * n) / 3 ? 1 : 0;
      tiers[rows[i] && rows[i].name] = t;
    }
    return tiers;
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
   * Issue #63 P2 / Phase 2: sanitize stored filter presets.
   * Shape: { name, kind: "tag"|"folder"|"pinned", value, since [, tag] }.
   * Legacy rows { name, tag, since } normalize to kind=tag, value=tag.
   * Cap the list so sync storage stays small; `since` must be a sinceSelect value.
   */
  var SINCE_KINDS = ["all", "today", "week", "month", "year"];
  var PRESET_KINDS = ["tag", "folder", "pinned"];

  function normalizePresets(raw, limit) {
    if (!Array.isArray(raw)) return [];
    var cap = typeof limit === "number" && isFinite(limit) && limit > 0 ? limit : 12;
    var out = [];
    var seen = Object.create(null);
    for (var i = 0; i < raw.length && out.length < cap; i++) {
      var p = raw[i];
      if (!p || typeof p !== "object") continue;
      var name = typeof p.name === "string" ? p.name.trim().slice(0, 40) : "";
      if (!name || seen[name]) continue;
      var kind =
        PRESET_KINDS.indexOf(p.kind) !== -1
          ? p.kind
          : typeof p.tag === "string" && p.tag.trim()
            ? "tag"
            : "";
      if (!kind) continue;
      var since = SINCE_KINDS.indexOf(p.since) !== -1 ? p.since : "all";
      var value = "";
      if (kind === "tag") {
        value =
          typeof p.value === "string" && p.value.trim()
            ? p.value.trim().slice(0, 64)
            : typeof p.tag === "string"
              ? p.tag.trim().slice(0, 64)
              : "";
        if (!value) continue;
      } else if (kind === "folder") {
        value =
          typeof p.value === "string"
            ? p.value.trim().slice(0, 200)
            : typeof p.folder === "string"
              ? p.folder.trim().slice(0, 200)
              : "";
        // empty string = unfiled folder filter — allowed
      } else {
        value = "";
      }
      seen[name] = true;
      var row = { name: name, kind: kind, value: value, since: since };
      if (kind === "tag") row.tag = value; // legacy readers / option labels
      out.push(row);
    }
    return out;
  }

  /**
   * Issue #84 / #82 / Phase 2: which stored preset matches the active filter.
   * Supports tag / folder / pinned + since. Callers re-run after applyPreset
   * or any filter/since change so the dropdown + ✕ stay in sync.
   */
  function findActivePreset(presets, filterKind, filterValue, since) {
    if (!Array.isArray(presets)) return null;
    if (PRESET_KINDS.indexOf(filterKind) === -1) return null;
    var want = typeof filterValue === "string" ? filterValue : "";
    var sinceKind = typeof since === "string" ? since : "all";
    for (var i = 0; i < presets.length; i++) {
      var p = presets[i];
      if (!p) continue;
      var kind = PRESET_KINDS.indexOf(p.kind) !== -1 ? p.kind : "tag";
      if (kind !== filterKind) continue;
      if (p.since !== sinceKind) continue;
      if (kind === "pinned") return p;
      var val = kind === "tag" ? p.value || p.tag || "" : p.value || "";
      if (val === want) return p;
    }
    return null;
  }

  /** Short label for a preset's filter (tag / folder / pinned). */
  function presetFilterLabel(preset, copy) {
    var c = copy || {};
    if (!preset) return "";
    var kind = PRESET_KINDS.indexOf(preset.kind) !== -1 ? preset.kind : "tag";
    if (kind === "pinned") return c.pinned || "Pinned";
    if (kind === "folder") {
      var folder = preset.value || "";
      return folder ? folder : c.unfiled || "Unfiled";
    }
    return preset.value || preset.tag || "";
  }


  /**
   * Phase 3: sidebar favorites — pin folders / tags / the Pinned view for
   * quick access. Stored in chrome.storage.sync (UI preference, not WebDAV).
   * Shape: { kind: "folder"|"tag"|"pinned", value: string }.
   */
  var FAVORITE_KINDS = ["folder", "tag", "pinned"];

  function favoriteKey(entry) {
    if (!entry || typeof entry !== "object") return "";
    var kind = FAVORITE_KINDS.indexOf(entry.kind) !== -1 ? entry.kind : "";
    if (!kind) return "";
    var value =
      kind === "pinned"
        ? ""
        : typeof entry.value === "string"
          ? entry.value.trim().slice(0, kind === "tag" ? 64 : 200)
          : "";
    if (kind === "tag" && !value) return "";
    // folder may be "" (unfiled)
    return kind + "\0" + value;
  }

  function normalizeFavorites(raw, limit) {
    if (!Array.isArray(raw)) return [];
    var cap = typeof limit === "number" && isFinite(limit) && limit > 0 ? limit : 20;
    var out = [];
    var seen = Object.create(null);
    for (var i = 0; i < raw.length && out.length < cap; i++) {
      var row = raw[i];
      var key = favoriteKey(row);
      if (!key || seen[key]) continue;
      seen[key] = true;
      var kind = key.split("\0")[0];
      var value = key.slice(kind.length + 1);
      out.push({ kind: kind, value: value });
    }
    return out;
  }

  function isFavorite(list, entry) {
    var want = favoriteKey(entry);
    if (!want) return false;
    var rows = normalizeFavorites(list);
    for (var i = 0; i < rows.length; i++) {
      if (favoriteKey(rows[i]) === want) return true;
    }
    return false;
  }

  /** Toggle membership; returns the next normalized list (does not mutate). */
  function toggleFavorite(list, entry) {
    var want = favoriteKey(entry);
    if (!want) return normalizeFavorites(list);
    var rows = normalizeFavorites(list);
    var out = [];
    var found = false;
    for (var i = 0; i < rows.length; i++) {
      if (favoriteKey(rows[i]) === want) {
        found = true;
        continue;
      }
      out.push(rows[i]);
    }
    if (!found) {
      var kind = want.split("\0")[0];
      var value = want.slice(kind.length + 1);
      out.push({ kind: kind, value: value });
    }
    return normalizeFavorites(out);
  }

  /**
   * Phase 3: library storage footprint summary for settings.
   * parts: { bookmarks?, workspaces?, tabRules?, snapshotsIndex?, snapshotsHtml?, path? }
   * unknown / missing numbers are treated as 0; total = sum of known parts.
   */
  function summarizeStorage(parts) {
    var src = parts && typeof parts === "object" ? parts : {};
    function num(v) {
      return typeof v === "number" && isFinite(v) && v > 0 ? Math.floor(v) : 0;
    }
    var bookmarks = num(src.bookmarks);
    var workspaces = num(src.workspaces);
    var tabRules = num(src.tabRules);
    var snapshotsIndex = num(src.snapshotsIndex);
    var snapshotsHtml = num(src.snapshotsHtml);
    return {
      path: typeof src.path === "string" ? src.path : "",
      bookmarks: bookmarks,
      workspaces: workspaces,
      tabRules: tabRules,
      snapshotsIndex: snapshotsIndex,
      snapshotsHtml: snapshotsHtml,
      total: bookmarks + workspaces + tabRules + snapshotsIndex + snapshotsHtml,
    };
  }

  /** Sum snapshot HTML sizes recorded in the snapshots index. */
  function sumSnapshotSizes(model) {
    var list = [];
    if (model && Array.isArray(model.snapshots)) list = model.snapshots;
    else if (Array.isArray(model)) list = model;
    var total = 0;
    for (var i = 0; i < list.length; i++) {
      var s = list[i] && list[i].size;
      if (typeof s === "number" && isFinite(s) && s > 0) total += Math.floor(s);
    }
    return total;
  }

  return {
    domainOf: domainOf,
    fallbackLetter: function (item) {
      var t = String((item && item.title) || domainOf(item && item.url) || "").trim();
      return t ? t.charAt(0).toUpperCase() : "?";
    },
    dragSelectionIds: dragSelectionIds,
    filterBookmarks: filterBookmarks,
    findActivePreset: findActivePreset,
    formatDate: formatDate,
    formatBytes: formatBytes,
    formatRelative: formatRelative,
    folderList: folderList,
    matchesQuery: matchesQuery,
    normalizePresets: normalizePresets,
    normalizeFavorites: normalizeFavorites,
    favoriteKey: favoriteKey,
    isFavorite: isFavorite,
    toggleFavorite: toggleFavorite,
    summarizeStorage: summarizeStorage,
    sumSnapshotSizes: sumSnapshotSizes,
    orderPinnedFirst: orderPinnedFirst,
    presetFilterLabel: presetFilterLabel,
    sortItems: sortItems,
    SORT_KEYS: SORT_KEYS,
    tagList: tagList,
    tagTiers: tagTiers,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = BookmarksView;
}
