"use strict";

/**
 * Context-menu / silent quick-save core (#71 / #73).
 *
 * Separated from background.js so vitest can exercise the 412→re-GET→merge→
 * retry PUT loop without Chrome APIs. background.js only maps the result to
 * badge + notification copy.
 *
 * Plain script with a module.exports guard so vitest can require() it.
 */
var DavflareQuickSave = (function () {
  /**
   * Cache writes are best-effort (#73). On a large library, chrome.storage.local
   * may reject (quota / serialization). Never let that abort the WebDAV PUT —
   * the popup path already ignores storage errors the same way.
   */
  async function safeWriteCache(writeCache, model, etag) {
    try {
      await writeCache(model, etag);
    } catch (err) {
      /* ignore — remote write must still proceed */
    }
  }

  /**
   * Persist one bookmark via WebDAV.
   *
   * Strategy:
   *  1. Optional fast path: PUT against bookmarksCache etag (If-Match).
   *  2. On miss / 412 / no cache: unconditional GET → merge → PUT.
   *  3. On 412 again: re-GET latest etag, merge, retry PUT once more.
   *  4. Cache etag is rewritten after every successful GET/PUT so a stale
   *     If-Match from bookmarksCache cannot stick around after remote moved.
   *
   * @param {object} deps
   * @param {{getBookmarks: Function, putBookmarks: Function}} deps.client
   * @param {object} deps.Bookmarks  — extension/bookmarks.js API
   * @param {() => Promise<{model: object, etag?: string}|null>} deps.readCache
   * @param {(model: object, etag: string|null) => Promise<void>} deps.writeCache
   * @param {(res: object) => object} deps.parseRemote
   * @param {{title: string, url: string, added?: number,
   *          folder?: string, tags?: string[], note?: string}} page
   *   folder/tags/note are optional (edge-panel round 4); addBookmark's #130
   *   revive semantics decide whether they land — non-empty incoming wins on
   *   a trash revive, otherwise the original entry is restored untouched.
   * @returns {Promise<
   *   | { ok: true, status: "saved" | "restored" | "exists" }
   *   ("restored" = the URL was revived from the trash, #130 follow-up)
   *   | { ok: false, kind: string }
   * >}
   */
  async function saveBookmark(deps, page) {
    var client = deps.client;
    var Bookmarks = deps.Bookmarks;
    var readCache = deps.readCache;
    var writeCache = deps.writeCache;
    var parseRemote = deps.parseRemote;
    var title = page.title || "";
    var url = page.url || "";
    var added = typeof page.added === "number" ? page.added : Date.now();
    // Optional edge-panel fields (round 4); junk values are normalized away
    // by sanitizeBookmark inside addBookmark.
    var entry = {
      title: title,
      url: url,
      added: added,
      folder: typeof page.folder === "string" ? page.folder : "",
      tags: Array.isArray(page.tags) ? page.tags : [],
      note: typeof page.note === "string" ? page.note : "",
    };

    var cache = await readCache();
    var cachedModel = cache && cache.model ? Bookmarks.normalizeModel(cache.model) : null;
    var cachedEtag = cache && cache.etag ? cache.etag : null;

    if (cachedModel) {
      var early = Bookmarks.addBookmark(cachedModel, entry);
      if (!early.added) {
        return { ok: true, status: "exists" };
      }

      // Fast path: PUT against the cached etag (If-Match). Conflict → re-GET.
      if (cachedEtag) {
        var putCached = await client.putBookmarks({
          html: Bookmarks.serializeHtml(early.model),
          json: Bookmarks.modelToJsonText(early.model),
          etag: cachedEtag,
        });
        if (putCached.ok) {
          await safeWriteCache(writeCache, early.model, putCached.etag || null);
          return { ok: true, status: early.restored ? "restored" : "saved" };
        }
        if (putCached.kind !== "conflict") {
          return { ok: false, kind: putCached.kind || "network" };
        }
        // Stale cache etag — drop it before the GET/merge loop so we never
        // keep serving a precondition that already failed (#71).
        await safeWriteCache(writeCache, cachedModel, null);
      }
    }

    // Fresh GET + PUT, with one 412 retry (re-GET → merge → PUT).
    var maxAttempts = 2;
    for (var attempt = 0; attempt < maxAttempts; attempt++) {
      var res = await client.getBookmarks();
      if (!res.ok) {
        return { ok: false, kind: res.kind || "network" };
      }

      var model;
      try {
        model = parseRemote(res);
      } catch (err) {
        // #75: surface the real throw (e.g. legacy DOMParser miss) instead of
        // a blind unexpected in savePage.
        return {
          ok: false,
          kind: "unexpected",
          message: err && err.message ? String(err.message) : String(err || ""),
        };
      }
      // Keep cache etag aligned with what we just observed remotely, even
      // before the PUT — so a later conflict path does not re-use a stale
      // If-Match from bookmarksCache. Best-effort: never block the PUT (#73).
      await safeWriteCache(writeCache, model, res.etag || null);

      var add = Bookmarks.addBookmark(model, entry);
      if (!add.added) {
        return { ok: true, status: "exists" };
      }

      var put = await client.putBookmarks({
        html: Bookmarks.serializeHtml(add.model),
        json: Bookmarks.modelToJsonText(add.model),
        etag: res.etag || null,
      });
      if (put.ok) {
        await safeWriteCache(writeCache, add.model, put.etag || null);
        return { ok: true, status: add.restored ? "restored" : "saved" };
      }
      if (put.kind !== "conflict") {
        return { ok: false, kind: put.kind || "network" };
      }
      // 412: loop once more with a brand-new GET (latest etag). After the
      // final attempt, surface conflict so the UI can ask the user to retry.
      if (attempt === maxAttempts - 1) {
        return { ok: false, kind: "conflict" };
      }
    }

    return { ok: false, kind: "conflict" };
  }

  return { saveBookmark: saveBookmark, safeWriteCache: safeWriteCache };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = DavflareQuickSave;
}
