"use strict";

/**
 * HamHome compatibility (issue #53): read-only import of a HamHome sync
 * directory — /HamHomeSync/meta.json (bookmarks) and categories.json
 * (category tree) on the same instance's WebDAV.
 *
 * Field mapping into our model:
 *   url -> url            title -> title        description -> note
 *   tags -> tags          createdAt -> added    categoryId -> folder path
 * isDeleted rows are skipped; favicon/hasSnapshot are ignored (our favicons
 * come from Chrome's _favicon API and HamHome snapshots live in its own
 * IndexedDB, not on WebDAV). Output feeds Bookmarks.mergeModels, which
 * dedupes by URL and sanitizes.
 */

var HamHome = (function () {
  var MODEL_VERSION = 1;

  function parseJson(text) {
    try {
      return JSON.parse(String(text || ""));
    } catch (err) {
      return null;
    }
  }

  /** Accepts a bare array or a wrapper object with a `categories` array. */
  function normalizeCategories(raw) {
    var list = Array.isArray(raw)
      ? raw
      : raw && typeof raw === "object" && Array.isArray(raw.categories)
        ? raw.categories
        : [];
    var byId = Object.create(null);
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (!item || typeof item !== "object" || item.id == null) continue;
      byId[String(item.id)] = {
        name: typeof item.name === "string" ? item.name.trim() : "",
        parentId: item.parentId == null ? "" : String(item.parentId),
      };
    }
    return byId;
  }

  /** Resolves "A/B/C" with a cycle guard; unknown or empty ids map to "". */
  function categoryPath(byId, id) {
    var parts = [];
    var seen = Object.create(null);
    var cur = id == null ? "" : String(id);
    while (cur && byId[cur] && !seen[cur]) {
      seen[cur] = true;
      var name = byId[cur].name;
      if (name) parts.unshift(name);
      cur = byId[cur].parentId;
    }
    return parts.join("/");
  }

  /** Accepts a bare array or a wrapper object with a `bookmarks` array. */
  function normalizeMeta(raw) {
    var list = Array.isArray(raw)
      ? raw
      : raw && typeof raw === "object" && Array.isArray(raw.bookmarks)
        ? raw.bookmarks
        : [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (!item || typeof item !== "object") continue;
      if (item.isDeleted === true) continue;
      var url = String(item.url || "").trim();
      if (!/^https?:\/\//i.test(url)) continue;
      out.push({
        title: typeof item.title === "string" ? item.title : "",
        url: url,
        categoryId: item.categoryId == null ? "" : String(item.categoryId),
        tags: Array.isArray(item.tags) ? item.tags : [],
        note: typeof item.description === "string" ? item.description : "",
        added: typeof item.createdAt === "number" && isFinite(item.createdAt) ? item.createdAt : 0,
      });
    }
    return out;
  }

  /**
   * @param {string} metaText       contents of /HamHomeSync/meta.json
   * @param {string|null} categoriesText contents of categories.json (optional)
   */
  function importFrom(metaText, categoriesText) {
    var meta = parseJson(metaText);
    if (!meta) return { ok: false, model: null };
    var byId = normalizeCategories(categoriesText ? parseJson(categoriesText) : null);
    var items = normalizeMeta(meta);
    var bookmarks = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      bookmarks.push({
        title: item.title,
        url: item.url,
        folder: categoryPath(byId, item.categoryId),
        tags: item.tags,
        note: item.note,
        added: item.added,
      });
    }
    return { ok: true, model: { version: MODEL_VERSION, bookmarks: bookmarks } };
  }

  return {
    categoryPath: categoryPath,
    importFrom: importFrom,
    normalizeCategories: normalizeCategories,
    normalizeMeta: normalizeMeta,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = HamHome;
}
