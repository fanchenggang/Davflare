"use strict";

/**
 * Pure helpers for the edge-panel permission flow and link-save titles
 * (issue #137). Plain script: importScripts() in the service worker, a
 * <script> in the popup, require() in vitest. No chrome.* calls here.
 */

var DavflareEdgePerms = (function () {
  // A pending enable older than this is ignored (user walked away from the
  // prompt, or the popup crashed before recording a denial).
  var PENDING_MAX_AGE_MS = 10 * 60 * 1000;

  /** "https://a.b/x?y" → "https://a.b/*" (the optional host pattern). */
  function originPatternOf(pageUrl) {
    try {
      var u = new URL(String(pageUrl || ""));
      if (u.protocol !== "http:" && u.protocol !== "https:") return "";
      return u.origin + "/*";
    } catch (err) {
      return "";
    }
  }

  /**
   * Never revoke the configured Davflare server's origin: WebDAV sync
   * (bookmarks, drive, snapshots) needs it (#137). Compared by origin, so a
   * server at https://host/sub still protects https://host/*.
   */
  function isProtectedPattern(pattern, instanceUrl) {
    var server = originPatternOf(instanceUrl);
    return Boolean(server) && server === String(pattern || "");
  }

  /**
   * The popup records {pattern, pageUrl, tabId, at} right before
   * permissions.request (the prompt usually closes the popup). When
   * chrome.permissions.onAdded later reports the grant, the background
   * finishes enabling. Returns the pattern to enable, or "".
   */
  function pendingMatch(pending, addedOrigins, now) {
    if (!pending || typeof pending !== "object") return "";
    var pattern = typeof pending.pattern === "string" ? pending.pattern : "";
    if (!pattern || pattern !== originPatternOf(pending.pageUrl)) return "";
    var at = typeof pending.at === "number" ? pending.at : 0;
    var ts = typeof now === "number" ? now : Date.now();
    if (!at || ts - at > PENDING_MAX_AGE_MS || at - ts > 60 * 1000) return "";
    var list = Array.isArray(addedOrigins) ? addedOrigins : [];
    return list.indexOf(pattern) !== -1 ? pattern : "";
  }

  function cleanText(value) {
    return String(value == null ? "" : value)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300);
  }

  /**
   * Title for "Save link to Davflare": Chrome's contextMenus OnClickData has
   * no linkText (Firefox-only), so prefer the text scraped from the page,
   * then linkText (other browsers), then the selection, then the URL.
   */
  function linkTitle(opts) {
    var o = opts || {};
    return (
      cleanText(o.scraped) ||
      cleanText(o.linkText) ||
      cleanText(o.selectionText) ||
      String(o.linkUrl || "")
    );
  }

  /**
   * Injected with chrome.scripting.executeScript({func, args}) into the
   * frame that was right-clicked (activeTab from the menu click — no extra
   * host permission). Must stay SELF-CONTAINED: Chrome serialises the
   * function source, so no outer references. Returns "" when nothing fits.
   */
  function findLinkText(linkUrl, selectionText) {
    function clean(s) {
      return String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, 300);
    }
    function abs(href) {
      try {
        return new URL(href, document.baseURI).href;
      } catch (err) {
        return String(href || "");
      }
    }
    function textOf(a) {
      var text = clean(a.innerText !== undefined ? a.innerText : a.textContent);
      if (!text) text = clean(a.textContent);
      if (text) return text;
      text = clean(a.getAttribute("aria-label")) || clean(a.getAttribute("title"));
      if (text) return text;
      var img = a.querySelector && a.querySelector("img[alt]");
      return img ? clean(img.getAttribute("alt")) : "";
    }
    var target = abs(linkUrl);
    var nodes = document.querySelectorAll("a[href], area[href]");
    var matches = [];
    for (var i = 0; i < nodes.length; i++) {
      var href = nodes[i].href || abs(nodes[i].getAttribute("href"));
      if (href === target || href === linkUrl) matches.push(nodes[i]);
    }
    if (!matches.length) return "";
    // Keyboard-opened context menus act on the focused link.
    var active = document.activeElement;
    if (active && matches.indexOf(active) !== -1 && textOf(active)) return textOf(active);
    var sel = clean(selectionText);
    if (sel) {
      for (var j = 0; j < matches.length; j++) {
        if (textOf(matches[j]).indexOf(sel) !== -1) return textOf(matches[j]);
      }
    }
    for (var k = 0; k < matches.length; k++) {
      var t = textOf(matches[k]);
      if (t) return t;
    }
    return "";
  }

  return {
    PENDING_MAX_AGE_MS: PENDING_MAX_AGE_MS,
    originPatternOf: originPatternOf,
    isProtectedPattern: isProtectedPattern,
    pendingMatch: pendingMatch,
    linkTitle: linkTitle,
    findLinkText: findLinkText,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = DavflareEdgePerms;
}
