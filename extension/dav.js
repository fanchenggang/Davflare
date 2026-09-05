"use strict";

/**
 * Minimal WebDAV client for the Davflare extension.
 *
 * Talks Basic auth to the instance's /webdav endpoint (server-side CORS is
 * open, so page contexts and the service worker can both call it). Error
 * kinds mirror what the instance can actually return:
 *   network        — fetch threw or no instance URL
 *   disabled       — webdav feature flag off (404 before auth)
 *   notConfigured  — server lacks WEBDAV_USERNAME/PASSWORD (403)
 *   unauthorized   — wrong credentials (401)
 *   conflict       — If-Match precondition failed (412)
 *   httpNNN        — anything else
 */

var DavflareDav = (function () {
  var HTML_PATH = "bookmarks.html";
  var JSON_PATH = "bookmarks.json";

  function mapStatusKind(status) {
    if (status === 401) return "unauthorized";
    if (status === 403) return "notConfigured";
    return "http" + status;
  }

  function createDavClient(options) {
    var opts = options || {};
    var base = String(opts.instanceUrl || "").replace(/\/+$/, "");
    var root = base + "/webdav";
    var dir = root + "/bookmarks/";
    var username = String(opts.username || "");
    var password = String(opts.password || "");
    var fetchImpl = opts.fetchImpl || (typeof fetch === "function" ? fetch : null);

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
      try {
        var res = await fetchImpl(url, {
          method: method,
          headers: headers,
          body: extra.body,
        });
        var text = "";
        if (method === "GET" || method === "PROPFIND") {
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
        return { status: 0, ok: false, kind: "network", text: "", etag: null };
      }
    }

    /** PROPFIND the webdav root; 404 here means the feature flag is off. */
    async function probe() {
      var res = await request("PROPFIND", root + "/", { headers: { Depth: "0" } });
      if (res.ok) return { ok: true };
      if (res.status === 404) return { ok: false, kind: "disabled" };
      return { ok: false, kind: res.kind || "network" };
    }

    async function ensureDir() {
      var res = await request("MKCOL", dir);
      if (res.status === 0) return { ok: false, kind: "network" };
      if (res.ok || res.status === 405) return { ok: true };
      if (res.status === 404) return { ok: false, kind: "disabled" };
      return { ok: false, kind: mapStatusKind(res.status) };
    }

    async function getJsonText() {
      var res = await request("GET", dir + JSON_PATH);
      return res.status === 200 ? res.text : null;
    }

    /**
     * GET one file under bookmarks/. A 404 is ambiguous (missing file vs
     * feature flag off), so probe the root to disambiguate.
     */
    async function getFile(fileName) {
      var res = await request("GET", dir + fileName);
      if (res.status === 0) return { ok: false, kind: "network" };
      if (res.status === 404) {
        var probeRes = await probe();
        if (!probeRes.ok) return probeRes;
        return { ok: true, missing: true, text: null, etag: null };
      }
      if (!res.ok) return { ok: false, kind: res.kind };
      return { ok: true, missing: false, text: res.text, etag: res.etag };
    }

    /** PUT one file under bookmarks/; sends If-Match when an etag is given. */
    async function putFile(fileName, body, contentType, etag) {
      var mk = await ensureDir();
      if (!mk.ok) return mk;
      var headers = { "Content-Type": contentType };
      if (etag) headers["If-Match"] = etag;
      var res = await request("PUT", dir + fileName, {
        body: String(body == null ? "" : body),
        headers: headers,
      });
      if (res.status === 0) return { ok: false, kind: "network" };
      if (res.status === 412) return { ok: false, kind: "conflict" };
      if (!res.ok) return { ok: false, kind: res.kind };
      return { ok: true };
    }

    async function getBookmarks() {
      var html = await getFile(HTML_PATH);
      if (!html.ok) return html;
      var jsonText = await getJsonText();
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
      if (payload.etag) headers["If-Match"] = payload.etag;
      var res = await request("PUT", dir + HTML_PATH, {
        body: String(payload.html || ""),
        headers: headers,
      });
      if (res.status === 0) return { ok: false, kind: "network" };
      if (res.status === 412) return { ok: false, kind: "conflict" };
      if (!res.ok) return { ok: false, kind: res.kind };

      var jsonSaved = false;
      if (typeof payload.json === "string") {
        var jres = await request("PUT", dir + JSON_PATH, {
          body: payload.json,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
        jsonSaved = jres.ok;
      }
      return { ok: true, jsonSaved: jsonSaved };
    }

    return {
      ensureDir: ensureDir,
      getFile: getFile,
      getBookmarks: getBookmarks,
      paths: { root: root, dir: dir, html: dir + HTML_PATH, json: dir + JSON_PATH },
      probe: probe,
      putBookmarks: putBookmarks,
      putFile: putFile,
    };
  }

  return { createDavClient: createDavClient };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = DavflareDav;
}
