"use strict";

/**
 * Minimal WebDAV client for the Davflare extension.
 *
 * Talks Basic auth to the instance's /webdav endpoint (server-side CORS is
 * open, so page contexts and the service worker can both call it). Error
 * kinds mirror what the instance can actually return:
 *   network        — fetch threw or no instance URL
 *   timeout        — AbortController fired (large library / slow network)
 *   disabled       — webdav feature flag off (404 before auth)
 *   notConfigured  — server lacks WEBDAV_USERNAME/PASSWORD (403)
 *   unauthorized   — wrong credentials (401)
 *   conflict       — If-Match precondition failed (412)
 *   httpNNN        — anything else (callers should surface the status)
 */

var DavflareDav = (function () {
  var HTML_PATH = "bookmarks.html";
  var JSON_PATH = "bookmarks.json";
  // Large libraries (900+ bookmarks) can take a while over WebDAV; keep a
  // generous default so genuine slow GETs finish, while still failing loud
  // instead of hanging the MV3 service worker forever (#68 / #69).
  var DEFAULT_TIMEOUT_MS = 45000;

  function mapStatusKind(status) {
    if (!status) return "network";
    if (status === 401) return "unauthorized";
    if (status === 403) return "notConfigured";
    if (status === 412) return "conflict";
    return "http" + status;
  }

  function createDavClient(options) {
    var opts = options || {};
    var base = String(opts.instanceUrl || "").replace(/\/+$/, "");
    var root = base + "/webdav";
    // Relative directory under /webdav holding all bookmark data (issue #54):
    // configurable so test instances and multi-library setups stay isolated.
    var basePath = String(opts.basePath || "").trim().replace(/^\/+|\/+$/g, "");
    if (!basePath) basePath = "bookmarks";
    var dir = root + "/" + basePath + "/";
    var username = String(opts.username || "");
    var password = String(opts.password || "");
    var fetchImpl = opts.fetchImpl || (typeof fetch === "function" ? fetch : null);
    var defaultTimeoutMs =
      typeof opts.timeoutMs === "number" && isFinite(opts.timeoutMs)
        ? opts.timeoutMs
        : DEFAULT_TIMEOUT_MS;

    function authHeader() {
      return "Basic " + btoa(unescape(encodeURIComponent(username + ":" + password)));
    }

    async function request(method, url, extra) {
      extra = extra || {};
      if (!base || !fetchImpl) {
        return { status: 0, ok: false, kind: "network", text: "", etag: null };
      }
      var headers = { Authorization: authHeader() };
      var keys = Object.keys(extra.headers || {});
      for (var i = 0; i < keys.length; i++) headers[keys[i]] = extra.headers[keys[i]];

      var timeoutMs =
        typeof extra.timeoutMs === "number" && isFinite(extra.timeoutMs)
          ? extra.timeoutMs
          : defaultTimeoutMs;
      var controller = null;
      var timer = null;
      try {
        var init = {
          method: method,
          headers: headers,
          body: extra.body,
          // Avoid HTTP-cache serving a stale ETag after a 412 (#71). Extension
          // SW fetch can otherwise re-GET an old body+etag and fail If-Match again.
          cache: "no-store",
        };
        if (
          timeoutMs > 0 &&
          typeof AbortController === "function"
        ) {
          controller = new AbortController();
          init.signal = controller.signal;
          timer = setTimeout(function () {
            try {
              controller.abort();
            } catch (abortErr) {
              /* ignore */
            }
          }, timeoutMs);
        }
        var res = await fetchImpl(url, init);
        var text = "";
        // 304 has no body; skip reading. GET/PROPFIND otherwise need the payload.
        if (res.status !== 304 && (method === "GET" || method === "PROPFIND")) {
          try {
            text = await res.text();
          } catch (err) {
            text = "";
          }
        }
        var etag = null;
        try {
          etag = res.headers.get("etag");
        } catch (err2) {
          etag = null;
        }
        return {
          status: res.status,
          ok: res.status >= 200 && res.status < 300,
          kind: res.ok ? null : mapStatusKind(res.status),
          text: text,
          etag: etag,
        };
      } catch (err) {
        var aborted =
          (err && err.name === "AbortError") ||
          (controller && controller.signal && controller.signal.aborted);
        return {
          status: 0,
          ok: false,
          kind: aborted ? "timeout" : "network",
          text: "",
          etag: null,
        };
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    /** PROPFIND the webdav root; 404 here means the feature flag is off. */
    async function probe() {
      var res = await request("PROPFIND", root + "/", { headers: { Depth: "0" } });
      if (res.ok) return { ok: true };
      if (res.status === 404) return { ok: false, kind: "disabled" };
      var out = { ok: false, kind: res.kind || "network" };
      if (res.status) out.status = res.status;
      return out;
    }

    /**
     * MKCOL the bookmark basePath segment-by-segment (issue #60).
     * Nested paths like a/b/c need parents created first; a single MKCOL
     * of the leaf returns 409 when an intermediate collection is missing.
     * 405 = collection already exists (treated as success).
     */
    async function ensureDir() {
      var parts = basePath.split("/");
      var prefix = "";
      for (var i = 0; i < parts.length; i++) {
        var seg = parts[i];
        if (!seg || seg === "." || seg === "..") {
          return { ok: false, kind: "http400" };
        }
        prefix += seg + "/";
        var res = await request("MKCOL", root + "/" + prefix);
        if (res.status === 0) return { ok: false, kind: res.kind || "network" };
        if (res.ok || res.status === 405) continue;
        if (res.status === 404) return { ok: false, kind: "disabled" };
        return { ok: false, kind: mapStatusKind(res.status), status: res.status };
      }
      return { ok: true };
    }

    /**
     * MKCOL bookmarks/ plus every intermediate folder in fileName
     * (e.g. snapshots/ for snapshots/<id>.html). Server PUT returns 409
     * when a parent collection is missing.
     */
    async function ensureParentDirs(fileName) {
      var mk = await ensureDir();
      if (!mk.ok) return mk;
      var parts = String(fileName || "").split("/");
      if (parts.length < 2) return { ok: true };
      var prefix = "";
      for (var i = 0; i < parts.length - 1; i++) {
        var seg = parts[i];
        if (!seg || seg === "." || seg === "..") {
          return { ok: false, kind: "http400" };
        }
        prefix += seg + "/";
        var res = await request("MKCOL", dir + prefix);
        if (res.status === 0) return { ok: false, kind: res.kind || "network" };
        if (res.ok || res.status === 405) continue;
        if (res.status === 404) return { ok: false, kind: "disabled" };
        return { ok: false, kind: mapStatusKind(res.status), status: res.status };
      }
      return { ok: true };
    }

    /**
     * GET one file under bookmarks/. A 404 is ambiguous (missing file vs
     * feature flag off), so probe the root to disambiguate.
     * Pass options.headers (e.g. If-None-Match) for conditional GET (#69).
     */
    async function getFile(fileName, options) {
      options = options || {};
      var res = await request("GET", dir + fileName, { headers: options.headers || {} });
      if (res.status === 0) return { ok: false, kind: res.kind || "network" };
      if (res.status === 304) {
        return {
          ok: true,
          notModified: true,
          missing: false,
          text: null,
          etag: res.etag || (options.headers && options.headers["If-None-Match"]) || null,
        };
      }
      if (res.status === 404) {
        var probeRes = await probe();
        if (!probeRes.ok) return probeRes;
        return { ok: true, missing: true, text: null, etag: null };
      }
      if (!res.ok) return { ok: false, kind: res.kind, status: res.status };
      return { ok: true, missing: false, text: res.text, etag: res.etag };
    }

    /**
     * Real strong-validator etags only. If-Match: * means "resource must already
     * exist" (RFC 7232) and yields 412 on first create — never treat "*" / junk
     * as a match token (#112).
     */
    function etagForIfMatch(etag) {
      if (etag == null) return null;
      var s = String(etag).trim();
      if (!s || s === "*" || s === '""' || s === "null" || s === "undefined") {
        return null;
      }
      return s;
    }

    /** PUT one file under bookmarks/; sends If-Match when a real etag is given. */
    async function putFile(fileName, body, contentType, etag) {
      var mk = await ensureParentDirs(fileName);
      if (!mk.ok) return mk;
      var headers = { "Content-Type": contentType };
      var match = etagForIfMatch(etag);
      if (match) headers["If-Match"] = match;
      var res = await request("PUT", dir + fileName, {
        body: String(body == null ? "" : body),
        headers: headers,
      });
      if (res.status === 0) return { ok: false, kind: res.kind || "network" };
      if (res.status === 412) return { ok: false, kind: "conflict" };
      if (!res.ok) return { ok: false, kind: res.kind, status: res.status };
      return { ok: true, etag: res.etag };
    }

    /** DELETE one file under bookmarks/; a missing file counts as deleted. */
    async function deleteFile(fileName) {
      var res = await request("DELETE", dir + fileName);
      if (res.status === 0) return { ok: false, kind: res.kind || "network" };
      if (res.ok || res.status === 404) return { ok: true };
      return { ok: false, kind: mapStatusKind(res.status), status: res.status };
    }

    /**
     * Load the bookmark library. Fetches html + json in parallel (#69).
     * options.ifNoneMatch → conditional GET; 304 yields { notModified: true }.
     */
    async function getBookmarks(options) {
      options = options || {};
      var cond = {};
      if (options.ifNoneMatch) {
        cond["If-None-Match"] = options.ifNoneMatch;
      }
      var htmlPromise = getFile(HTML_PATH, { headers: cond });
      var jsonPromise = request("GET", dir + JSON_PATH, {
        headers: cond,
      });

      var html = await htmlPromise;
      if (html.notModified) {
        // Settle the companion request; its body is unused on 304.
        try {
          await jsonPromise;
        } catch (err) {
          /* ignore */
        }
        return {
          ok: true,
          notModified: true,
          missing: false,
          html: "",
          etag: html.etag || options.ifNoneMatch || null,
          jsonText: null,
        };
      }
      if (!html.ok) {
        try {
          await jsonPromise;
        } catch (err2) {
          /* ignore */
        }
        return html;
      }

      var jres = await jsonPromise;
      var jsonText = jres && jres.status === 200 ? jres.text : null;
      return {
        ok: true,
        missing: Boolean(html.missing),
        html: html.text || "",
        etag: html.etag,
        jsonText: jsonText,
      };
    }

    /** Write html (with If-Match when we know the etag), then json best-effort. */
    async function putBookmarks(payload) {
      payload = payload || {};
      var mk = await ensureDir();
      if (!mk.ok) return mk;

      var headers = { "Content-Type": "text/html; charset=utf-8" };
      var match = etagForIfMatch(payload.etag);
      if (match) headers["If-Match"] = match;
      var res = await request("PUT", dir + HTML_PATH, {
        body: String(payload.html || ""),
        headers: headers,
      });
      if (res.status === 0) return { ok: false, kind: res.kind || "network" };
      if (res.status === 412) return { ok: false, kind: "conflict" };
      if (!res.ok) return { ok: false, kind: res.kind, status: res.status };

      var jsonSaved = false;
      if (typeof payload.json === "string") {
        var jres = await request("PUT", dir + JSON_PATH, {
          body: payload.json,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
        jsonSaved = jres.ok;
      }
      return { ok: true, jsonSaved: jsonSaved, etag: res.etag || null };
    }

    return {
      deleteFile: deleteFile,
      ensureDir: ensureDir,
      getFile: getFile,
      getBookmarks: getBookmarks,
      paths: { root: root, dir: dir, html: dir + HTML_PATH, json: dir + JSON_PATH },
      probe: probe,
      putBookmarks: putBookmarks,
      putFile: putFile,
    };
  }

  return { createDavClient: createDavClient, DEFAULT_TIMEOUT_MS: DEFAULT_TIMEOUT_MS };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = DavflareDav;
}
