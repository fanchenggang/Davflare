"use strict";

/**
 * Pure helpers for the Davflare Chrome extension.
 * No default instance host — users paste their own URL.
 */

var DEFAULT_SETTINGS = {
  instanceUrl: "",
  toolbarMode: "drive",
  bookmarkPath: "bookmarks",
};

var TOOLBAR_MODES = ["drive", "bookmarks"];

var DEFAULT_BOOKMARK_PATH = "bookmarks";

/**
 * Relative WebDAV directory for all bookmark data (issue #54). Accepts
 * nested segments like "qa/bookmarks"; empty/./.. segments or anything
 * suspicious falls back to the default.
 */
function sanitizeBookmarkPath(raw) {
  if (typeof raw !== "string") return DEFAULT_BOOKMARK_PATH;
  var trimmed = raw.trim().replace(/^\/+|\/+$/g, "");
  if (!trimmed) return DEFAULT_BOOKMARK_PATH;
  var segs = [];
  var parts = trimmed.split("/");
  for (var i = 0; i < parts.length; i++) {
    var seg = parts[i];
    if (seg === "." || seg === "..") return DEFAULT_BOOKMARK_PATH;
    if (seg) segs.push(seg);
  }
  return segs.length ? segs.join("/") : DEFAULT_BOOKMARK_PATH;
}

function mergeSettings(stored) {
  var src = stored && typeof stored === "object" ? stored : {};
  return {
    instanceUrl: typeof src.instanceUrl === "string" ? src.instanceUrl : "",
    toolbarMode: src.toolbarMode === "bookmarks" ? "bookmarks" : "drive",
    bookmarkPath: sanitizeBookmarkPath(src.bookmarkPath),
  };
}

function normalizeInstanceUrl(raw) {
  if (typeof raw !== "string") return "";
  var trimmed = raw.trim();
  if (!trimmed) return "";

  var candidate = trimmed;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) {
    candidate = "https://" + candidate;
  }

  var parsed;
  try {
    parsed = new URL(candidate);
  } catch (err) {
    return "";
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
  if (!parsed.hostname) return "";

  parsed.hash = "";
  var href = parsed.toString();
  if (parsed.pathname === "/" && !parsed.search) {
    return parsed.origin;
  }
  if (href.charAt(href.length - 1) === "/") {
    href = href.slice(0, -1);
  }
  return href;
}

/**
 * Toolbar routing. Both modes land on the extension shell page
 * (bookmarks.html) — the mode only picks the view it opens with:
 * drive = embedded instance, bookmarks = bookmark library. An empty or
 * invalid URL opens the in-shell settings view instead of guessing a host.
 */
function resolveToolbarTarget(settings) {
  var merged = mergeSettings(settings);
  if (merged.toolbarMode === "bookmarks") return { action: "bookmarks" };
  if (normalizeInstanceUrl(merged.instanceUrl)) return { action: "drive" };
  return { action: "settings" };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DEFAULT_BOOKMARK_PATH: DEFAULT_BOOKMARK_PATH,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    TOOLBAR_MODES: TOOLBAR_MODES,
    mergeSettings: mergeSettings,
    normalizeInstanceUrl: normalizeInstanceUrl,
    resolveToolbarTarget: resolveToolbarTarget,
    sanitizeBookmarkPath: sanitizeBookmarkPath,
  };
}
