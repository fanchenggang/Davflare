"use strict";

/**
 * Snapshot index for the bookmark library. A snapshot is a captured HTML
 * file stored on the user's WebDAV under bookmarks/snapshots/<id>.html;
 * this module is the pure index (snapshots.json) — capture and I/O live in
 * the page layer / dav.js.
 */

var Snapshots = (function () {
  var MODEL_VERSION = 1;
  var idCounter = 0;

  function makeId() {
    idCounter += 1;
    return "snap-" + Date.now().toString(36) + "-" + idCounter.toString(36);
  }

  function asString(value) {
    return typeof value === "string" ? value : "";
  }

  function sanitizeEntry(raw) {
    var src = raw && typeof raw === "object" ? raw : {};
    return {
      id: asString(src.id),
      bookmarkId: asString(src.bookmarkId),
      url: asString(src.url),
      title: asString(src.title),
      capturedAt:
        typeof src.capturedAt === "number" && isFinite(src.capturedAt) ? src.capturedAt : 0,
      size: typeof src.size === "number" && isFinite(src.size) ? Math.max(0, Math.floor(src.size)) : 0,
    };
  }

  function isValidEntry(entry) {
    return Boolean(entry.id && entry.url);
  }

  function normalize(raw) {
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.snapshots)) {
      return { version: MODEL_VERSION, snapshots: [] };
    }
    var clean = [];
    for (var i = 0; i < raw.snapshots.length; i++) {
      if (!raw.snapshots[i] || typeof raw.snapshots[i] !== "object") continue;
      var entry = sanitizeEntry(raw.snapshots[i]);
      if (isValidEntry(entry)) clean.push(entry);
    }
    return { version: MODEL_VERSION, snapshots: clean };
  }

  function fileName(id) {
    return "snapshots/" + encodeURIComponent(id) + ".html";
  }

  function findByBookmarkId(model, bookmarkId) {
    var list = normalize(model).snapshots;
    for (var i = 0; i < list.length; i++) {
      if (list[i].bookmarkId === bookmarkId) return list[i];
    }
    return null;
  }

  /** Adds or replaces the entry for one bookmark (a bookmark has at most one snapshot). */
  function upsert(list, entry) {
    var model = normalize(list);
    var clean = sanitizeEntry(entry);
    if (!isValidEntry(clean)) return model;
    var out = [];
    var replaced = false;
    for (var i = 0; i < model.snapshots.length; i++) {
      var current = model.snapshots[i];
      if (clean.bookmarkId && current.bookmarkId === clean.bookmarkId) continue;
      if (current.id === clean.id) {
        out.push(clean);
        replaced = true;
      } else {
        out.push(current);
      }
    }
    if (!replaced) out.push(clean);
    return { version: MODEL_VERSION, snapshots: out };
  }

  function remove(list, id) {
    var model = normalize(list);
    return {
      version: MODEL_VERSION,
      snapshots: model.snapshots.filter(function (entry) {
        return entry.id !== id;
      }),
    };
  }

  return {
    findByBookmarkId: findByBookmarkId,
    fileName: fileName,
    makeId: makeId,
    normalize: normalize,
    remove: remove,
    upsert: upsert,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = Snapshots;
}
