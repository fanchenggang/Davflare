"use strict";

/**
 * Netscape bookmark format codec for the Davflare extension.
 *
 * bookmarks.html is the authoritative, browser-importable file. The JSON
 * sidecar carries rich fields (tags, note, id) that the Netscape format
 * cannot hold; adoptRichFields() re-attaches them after an html parse.
 * Plain script with a module.exports guard so vitest can require() it.
 */

var Bookmarks = (function () {
  var MODEL_VERSION = 1;
  var idCounter = 0;

  function emptyModel() {
    return { version: MODEL_VERSION, bookmarks: [] };
  }

  function makeId() {
    idCounter += 1;
    return "bm-" + Date.now().toString(36) + "-" + idCounter.toString(36);
  }

  function asString(value) {
    return typeof value === "string" ? value : "";
  }

  function sanitizeTags(value) {
    if (!Array.isArray(value)) return [];
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < value.length; i++) {
      var tag = typeof value[i] === "string" ? value[i].trim() : "";
      if (!tag || seen[tag]) continue;
      seen[tag] = true;
      out.push(tag.slice(0, 64));
    }
    return out.slice(0, 32);
  }

  function sanitizeBookmark(raw) {
    var src = raw && typeof raw === "object" ? raw : {};
    var added = typeof src.added === "number" && isFinite(src.added) ? src.added : 0;
    return {
      id: asString(src.id) || makeId(),
      title: asString(src.title),
      url: asString(src.url),
      folder: asString(src.folder),
      tags: sanitizeTags(src.tags),
      note: asString(src.note),
      added: added,
    };
  }

  function normalizeModel(raw) {
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.bookmarks)) {
      return emptyModel();
    }
    var out = [];
    var seenIds = Object.create(null);
    for (var i = 0; i < raw.bookmarks.length; i++) {
      var item = sanitizeBookmark(raw.bookmarks[i]);
      if (!item.url) continue;
      while (seenIds[item.id]) item.id = makeId();
      seenIds[item.id] = true;
      out.push(item);
    }
    return { version: MODEL_VERSION, bookmarks: out };
  }

  function isValidModel(value) {
    return Boolean(
      value &&
        typeof value === "object" &&
        value.version === MODEL_VERSION &&
        Array.isArray(value.bookmarks)
    );
  }

  function urlKey(url) {
    var s = String(url == null ? "" : url).trim();
    if (!s) return "";
    try {
      var u = new URL(s);
      if (u.protocol === "http:" || u.protocol === "https:") {
        u.hash = "";
        return u.href;
      }
    } catch (err) {
      /* non-http or malformed: fall back to the trimmed string */
    }
    return s;
  }

  function isWebUrl(url) {
    return /^https?:\/\//i.test(String(url || "").trim());
  }

  function escapeAttr(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeText(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function toNetscapeTime(ms) {
    var n = typeof ms === "number" && isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
    return String(n);
  }

  /**
   * Folder walk for one DL level. Netscape exporters emit <DT><H3>name</H3>
   * followed by a nested <DL>, but HTML parsers nest those inconsistently
   * (a <p> inside <DL> reshuffles DT/DL parenting), so instead of relying on
   * sibling/parent relationships we walk each level in document order: an
   * Hx heading names the folder for the next nested DL (or stray A) at this
   * level, and non-DL elements are treated as transparent wrappers.
   */
  function joinFolder(path, name) {
    var clean = String(name || "").trim();
    if (!clean) return path;
    return path ? path + "/" + clean : clean;
  }

  function pushAnchor(anchor, folderPath, out) {
    var href = (anchor.getAttribute("href") || "").trim();
    if (!isWebUrl(href)) return;
    var addRaw = parseInt(anchor.getAttribute("add_date") || "", 10);
    out.push(
      sanitizeBookmark({
        title: (anchor.textContent || "").trim(),
        url: href,
        folder: folderPath,
        added: isFinite(addRaw) && addRaw > 0 ? addRaw * 1000 : 0,
      })
    );
  }

  function walkLevel(node, path, out, state) {
    var children = node.children;
    for (var i = 0; i < children.length; i++) {
      var el = children[i];
      var tag = el.tagName;
      if (tag === "DL") {
        collectLevel(el, joinFolder(path, state.heading), out);
        state.heading = null;
      } else if (tag === "A") {
        pushAnchor(el, joinFolder(path, state.heading), out);
      } else if (tag === "H2" || tag === "H3" || tag === "H4" || tag === "H5") {
        var heading = (el.textContent || "").trim();
        if (heading) state.heading = heading;
      } else if (el.children && el.children.length) {
        walkLevel(el, path, out, state);
      }
    }
  }

  function collectLevel(dl, path, out) {
    walkLevel(dl, path, out, { heading: null });
  }

  function parseHtml(text) {
    if (typeof DOMParser === "undefined") {
      throw new Error("parseHtml requires DOMParser");
    }
    var doc = new DOMParser().parseFromString(String(text || ""), "text/html");
    var rootDl = doc.querySelector("dl");
    var out = [];
    if (rootDl) collectLevel(rootDl, "", out);
    return { version: MODEL_VERSION, bookmarks: out };
  }

  function buildTree(model) {
    var root = { folders: Object.create(null), links: [], name: "" };
    var items = normalizeModel(model).bookmarks;
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var node = root;
      var folder = item.folder.replace(/^\/+|\/+$/g, "");
      if (folder) {
        var segs = folder.split("/");
        for (var j = 0; j < segs.length; j++) {
          var seg = segs[j] || "";
          if (!node.folders[seg]) {
            node.folders[seg] = { folders: Object.create(null), links: [], name: seg };
          }
          node = node.folders[seg];
        }
      }
      node.links.push(item);
    }
    return root;
  }

  function renderNode(node, depth, lines) {
    var pad = new Array(depth + 1).join("    ");
    for (var i = 0; i < node.links.length; i++) {
      var b = node.links[i];
      lines.push(
        pad +
          '<DT><A HREF="' +
          escapeAttr(b.url) +
          '" ADD_DATE="' +
          toNetscapeTime(b.added) +
          '">' +
          escapeText(b.title) +
          "</A>"
      );
    }
    var names = Object.keys(node.folders);
    for (var k = 0; k < names.length; k++) {
      var folder = node.folders[names[k]];
      lines.push(
        pad +
          '<DT><H3 ADD_DATE="' +
          toNetscapeTime(Date.now()) +
          '">' +
          escapeText(folder.name) +
          "</H3>"
      );
      lines.push(pad + "<DL><p>");
      renderNode(folder, depth + 1, lines);
      lines.push(pad + "</DL><p>");
    }
  }

  function serializeHtml(model) {
    var tree = buildTree(model);
    var lines = [
      "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
      "<!-- This is an automatically generated file.",
      "     It will be read and overwritten.",
      "     DO NOT EDIT! -->",
      '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
      "<TITLE>Bookmarks</TITLE>",
      "<H1>Bookmarks</H1>",
      "<DL><p>",
    ];
    renderNode(tree, 1, lines);
    lines.push("</DL><p>");
    return lines.join("\n") + "\n";
  }

  function indexOfUrl(model, key) {
    for (var i = 0; i < model.bookmarks.length; i++) {
      if (urlKey(model.bookmarks[i].url) === key) return i;
    }
    return -1;
  }

  /** Add one bookmark; existing URL wins. Returns {model, added}. */
  function addBookmark(model, item) {
    var next = normalizeModel(model);
    var key = urlKey(item && item.url);
    if (!key || !isWebUrl(item && item.url)) return { model: next, added: false };
    if (indexOfUrl(next, key) !== -1) return { model: next, added: false };
    var clean = sanitizeBookmark(item);
    if (!clean.url) return { model: next, added: false };
    next.bookmarks.push(clean);
    return { model: next, added: true };
  }

  /** Merge incoming into base by URL; base entries win on collision. */
  function mergeModels(base, incoming) {
    var out = normalizeModel(base);
    var add = normalizeModel(incoming);
    for (var i = 0; i < add.bookmarks.length; i++) {
      var item = add.bookmarks[i];
      if (!item.url || indexOfUrl(out, urlKey(item.url)) !== -1) continue;
      out.bookmarks.push(item);
    }
    return out;
  }

  function removeBookmark(model, id) {
    var next = normalizeModel(model);
    next.bookmarks = next.bookmarks.filter(function (b) {
      return b.id !== id;
    });
    return next;
  }

  /**
   * html parse wins for membership/title/folder; the json sidecar donates
   * tags/note/id for the same URL so rewrites never drop rich fields.
   */
  function adoptRichFields(htmlModel, jsonModel) {
    var out = normalizeModel(htmlModel);
    if (!isValidModel(jsonModel)) return out;
    var rich = Object.create(null);
    for (var i = 0; i < jsonModel.bookmarks.length; i++) {
      var b = jsonModel.bookmarks[i];
      var key = urlKey(b.url);
      if (key && !rich[key]) rich[key] = b;
    }
    for (var j = 0; j < out.bookmarks.length; j++) {
      var item = out.bookmarks[j];
      var donor = rich[urlKey(item.url)];
      if (!donor) continue;
      if (donor.id) item.id = donor.id;
      if (donor.tags && donor.tags.length) item.tags = donor.tags.slice();
      if (donor.note) item.note = donor.note;
    }
    return out;
  }

  function modelToJsonText(model) {
    return JSON.stringify(normalizeModel(model), null, 2);
  }

  function modelFromJson(text) {
    var parsed;
    try {
      parsed = JSON.parse(String(text || ""));
    } catch (err) {
      return { ok: false, model: emptyModel() };
    }
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.bookmarks)) {
      return { ok: false, model: emptyModel() };
    }
    return { ok: true, model: normalizeModel(parsed) };
  }

  return {
    MODEL_VERSION: MODEL_VERSION,
    addBookmark: addBookmark,
    adoptRichFields: adoptRichFields,
    emptyModel: emptyModel,
    isWebUrl: isWebUrl,
    isValidModel: isValidModel,
    makeId: makeId,
    mergeModels: mergeModels,
    modelFromJson: modelFromJson,
    modelToJsonText: modelToJsonText,
    normalizeModel: normalizeModel,
    parseHtml: parseHtml,
    removeBookmark: removeBookmark,
    serializeHtml: serializeHtml,
    urlKey: urlKey,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = Bookmarks;
}
