"use strict";

/**
 * Pure helpers for the Davflare Chrome extension.
 * No default instance host — users paste their own URL.
 */

var DEFAULT_SETTINGS = {
  instanceUrl: "",
  toolbarMode: "drive",
};

var TOOLBAR_MODES = ["drive", "bookmarks"];

var DEFAULT_NTP = "chrome://new-tab-page/";

function mergeSettings(stored) {
  var src = stored && typeof stored === "object" ? stored : {};
  return {
    instanceUrl: typeof src.instanceUrl === "string" ? src.instanceUrl : "",
    toolbarMode: src.toolbarMode === "bookmarks" ? "bookmarks" : "drive",
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
 * drive = embedded instance, bookmarks = bookmark library.
 */
function resolveToolbarTarget(settings) {
  var merged = mergeSettings(settings);
  if (merged.toolbarMode === "bookmarks") return { action: "bookmarks" };
  if (normalizeInstanceUrl(merged.instanceUrl)) return { action: "drive" };
  return { action: "options" };
}

function resolveNewTabTarget(settings) {
  var url = normalizeInstanceUrl(mergeSettings(settings).instanceUrl);
  if (url) return { action: "open", url: url };
  return { action: "default-ntp", url: DEFAULT_NTP };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DEFAULT_NTP: DEFAULT_NTP,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    TOOLBAR_MODES: TOOLBAR_MODES,
    mergeSettings: mergeSettings,
    normalizeInstanceUrl: normalizeInstanceUrl,
    resolveNewTabTarget: resolveNewTabTarget,
    resolveToolbarTarget: resolveToolbarTarget,
  };
}
