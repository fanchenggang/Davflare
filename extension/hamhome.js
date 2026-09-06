"use strict";

/**
 * HamHome compatibility (issue #53): read-only import of a HamHome sync
 * directory — /HamHomeSync/bookmarks/meta.json and /HamHomeSync/categories.json
 * (category tree) on the same instance's WebDAV.
 *
 * Issue #64 adds the reverse direction: exportTo() merges our library into an
 * existing HamHome remote tree (meta.json + categories.json) so HamHome's own
 * id-based union sync picks our entries up on its next run. Field mapping:
 *
 *   url -> url            title -> title        description -> note
 *   tags -> tags          createdAt -> added    categoryId -> folder path
 *
 * isDeleted rows are skipped on import; favicon/hasSnapshot are ignored (our
 * favicons come from Chrome's _favicon API and HamHome snapshots live in its
 * own IndexedDB, not on WebDAV). Output feeds Bookmarks.mergeModels, which
 * dedupes by URL and sanitizes.
 */

var HamHome = (function () {
  var MODEL_VERSION = 1;

  /** Accepts an already-parsed object too (file import hands one over). */
  function parseJson(text) {
    if (text && typeof text === "object") return text;
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
   * @param {string} metaText       contents of /HamHomeSync/bookmarks/meta.json
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

  /** Local mirror of Bookmarks.urlKey: http(s) URLs compare without hash. */
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
      /* non-http or malformed: compare the trimmed string */
    }
    return s;
  }

  function parentPathOf(path) {
    var idx = path.lastIndexOf("/");
    return idx === -1 ? "" : path.slice(0, idx);
  }

  function leafNameOf(path) {
    var idx = path.lastIndexOf("/");
    return idx === -1 ? path : path.slice(idx + 1);
  }

  /**
   * Issue #64 round-trip: merge our model into an existing HamHome remote.
   *
   * meta.json entries keep HamHome's own ids — a same-URL entry is updated in
   * place (title/description/tags/categoryId/updatedAt), otherwise a new entry
   * is appended with a deterministic id ("dav-" + url hash) so re-exports are
   * idempotent. Remote entries not present in our library are left untouched
   * (deletion stays HamHome's own decision). categories.json merges by
   * HamHome's name_parentId signature: folder paths reuse an existing
   * category id when one matches, else declare {id: path, parentId: parent}.
   *
   * @param {object} model                Davflare model (bookmarks + folders)
   * @param {string|null} remoteMetaText  current meta.json contents (null = none yet)
   * @param {string|null} remoteCatsText  current categories.json contents
   * @param {number} now                  epoch ms for updatedAt stamps
   * @returns {{ok: boolean, meta?: string, categories?: string}}
   */
  function exportTo(model, remoteMetaText, remoteCatsText, now) {
    var items = model && Array.isArray(model.bookmarks) ? model.bookmarks : null;
    if (!items) return { ok: false };
    var stamp = typeof now === "number" && isFinite(now) && now > 0 ? now : Date.now();

    var remoteMetaRaw = parseJson(remoteMetaText);
    var remoteMeta =
      remoteMetaRaw && typeof remoteMetaRaw === "object" && Array.isArray(remoteMetaRaw.bookmarks)
        ? remoteMetaRaw.bookmarks
        : Array.isArray(remoteMetaRaw)
          ? remoteMetaRaw
          : [];
    var remoteCats = normalizeExportCategories(parseJson(remoteCatsText));

    // Folder path -> assigned HamHome category id (signature-mapped).
    var catByPath = Object.create(null);
    var sigById = Object.create(null);
    for (var c = 0; c < remoteCats.length; c++) {
      var cat = remoteCats[c];
      if (cat && cat.id != null) sigById[String(cat.id)] = cat;
    }
    var sigMap = Object.create(null);
    for (var s = 0; s < remoteCats.length; s++) {
      var rc = remoteCats[s];
      if (!rc) continue;
      sigMap[rc.name + "_" + (rc.parentId || "")] = rc.id;
    }
    var orderCounter = remoteCats.length;
    var categoriesChanged = false;

    function assignCategory(path) {
      if (!path) return null;
      if (catByPath[path]) return catByPath[path];
      var parentId = assignCategory(parentPathOf(path));
      var existing = sigById[path];
      if (existing) {
        catByPath[path] = existing.id;
        return existing.id;
      }
      var sig = leafNameOf(path) + "_" + (parentId || "");
      if (sigMap[sig]) {
        catByPath[path] = sigMap[sig];
        return catByPath[path];
      }
      var created = {
        id: path,
        name: leafNameOf(path),
        parentId: parentId || null,
        order: orderCounter++,
        createdAt: stamp,
      };
      remoteCats.push(created);
      sigById[path] = created;
      sigMap[sig] = created.id;
      catByPath[path] = created.id;
      categoriesChanged = true;
      return created.id;
    }

    // Index remote entries by URL; deleted rows never match (stays deleted).
    var byUrl = Object.create(null);
    for (var m = 0; m < remoteMeta.length; m++) {
      var rm = remoteMeta[m];
      if (!rm || typeof rm !== "object" || rm.isDeleted === true) continue;
      var key = urlKeyOf(rm.url);
      if (key && !byUrl[key]) byUrl[key] = rm;
    }

    var out = remoteMeta.slice();
    var seenUrls = Object.create(null);
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (!item || typeof item !== "object") continue;
      var url = String(item.url || "").trim();
      if (!/^https?:\/\//i.test(url)) continue;
      var ukey = urlKeyOf(url);
      if (!ukey || seenUrls[ukey]) continue;
      seenUrls[ukey] = true;
      var categoryId = assignCategory(
        String(item.folder || "").trim().replace(/^\/+|\/+$/g, "")
      );
      var tags = Array.isArray(item.tags) ? item.tags.filter(function (tg) {
        return typeof tg === "string" && tg.trim();
      }) : [];
      var hit = byUrl[ukey];
      if (hit) {
        hit.title = typeof item.title === "string" ? item.title : hit.title;
        hit.description = typeof item.note === "string" ? item.note : hit.description || "";
        hit.tags = tags;
        hit.categoryId = categoryId;
        hit.updatedAt = stamp;
      } else {
        out.push({
          id: "dav-" + hashId(ukey),
          url: url,
          title: typeof item.title === "string" ? item.title : "",
          description: typeof item.note === "string" ? item.note : "",
          categoryId: categoryId,
          tags: tags,
          hasSnapshot: false,
          createdAt:
            typeof item.added === "number" && isFinite(item.added) && item.added > 0
              ? item.added
              : stamp,
          updatedAt: stamp,
        });
      }
    }

    return {
      ok: true,
      meta: JSON.stringify({ bookmarks: out }, null, 2),
      categories: JSON.stringify(remoteCats, null, 2),
      categoriesChanged: categoriesChanged,
    };
  }

  function normalizeExportCategories(raw) {
    var list = Array.isArray(raw)
      ? raw
      : raw && typeof raw === "object" && Array.isArray(raw.categories)
        ? raw.categories
        : [];
    var out = [];
    var seen = Object.create(null);
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (!item || typeof item !== "object" || item.id == null) continue;
      var id = String(item.id);
      if (seen[id]) continue;
      seen[id] = true;
      out.push(item);
    }
    return out;
  }

  /** FNV-1a 32-bit hash as hex — deterministic per-URL export ids. */
  function hashId(text) {
    var hash = 0x811c9dc5;
    var s = String(text || "");
    for (var i = 0; i < s.length; i++) {
      hash ^= s.charCodeAt(i);
      hash = (hash * 0x01000193) >>> 0;
    }
    return hash.toString(16) + (s.length % 100 < 10 ? "0" : "") + String(s.length % 100);
  }

  return {
    categoryPath: categoryPath,
    exportTo: exportTo,
    importFrom: importFrom,
    normalizeCategories: normalizeCategories,
    normalizeMeta: normalizeMeta,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = HamHome;
}
