"use strict";

/**
 * Pinyin search index helpers for the bookmark library.
 *
 * The dictionary comes from pinyinDict.js (a global, loaded only by the
 * library page). makeTools() accepts any {char: pinyin} table so tests can
 * inject a tiny one; the default instance uses PINYIN_DICT when present.
 */

var PinyinIndex = (function () {
  function makeTools(dict) {
    var table = dict && typeof dict === "object" ? dict : {};
    var cache = new Map();

    function split(text) {
      return String(text || "").split("");
    }

    /** "腾讯云" -> "tengxunyun"; ascii passes through lowercased. */
    function toPinyin(text) {
      var cached = cache.get("p:" + text);
      if (cached !== undefined) return cached;
      var out = "";
      var chars = split(text);
      for (var i = 0; i < chars.length; i++) {
        var ch = chars[i];
        var py = table[ch];
        if (py) out += py;
        else if (/[a-zA-Z0-9]/.test(ch)) out += ch.toLowerCase();
      }
      cache.set("p:" + text, out);
      return out;
    }

    /** "腾讯云" -> "txy"; ascii keeps alphanumerics. */
    function toInitials(text) {
      var cached = cache.get("i:" + text);
      if (cached !== undefined) return cached;
      var out = "";
      var chars = split(text);
      for (var i = 0; i < chars.length; i++) {
        var ch = chars[i];
        var py = table[ch];
        if (py) out += py.charAt(0);
        else if (/[a-zA-Z0-9]/.test(ch)) out += ch.toLowerCase();
      }
      cache.set("i:" + text, out);
      return out;
    }

    function isAsciiQuery(query) {
      return /^[a-z0-9]+$/.test(query);
    }

    function matchText(text, query) {
      var q = String(query || "").toLowerCase().trim();
      if (!q) return true;
      if (String(text || "").toLowerCase().indexOf(q) !== -1) return true;
      if (!isAsciiQuery(q) || !Object.keys(table).length) return false;
      var pinyin = toPinyin(text);
      if (pinyin && pinyin.indexOf(q) !== -1) return true;
      var initials = toInitials(text);
      return Boolean(initials) && initials.indexOf(q) !== -1;
    }

    return { matchText: matchText, toInitials: toInitials, toPinyin: toPinyin };
  }

  var defaultTools = makeTools(typeof PINYIN_DICT === "object" ? PINYIN_DICT : null);

  return {
    defaultTools: defaultTools,
    makeTools: makeTools,
    matchText: defaultTools.matchText,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = PinyinIndex;
}
