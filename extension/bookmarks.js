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
    return { version: MODEL_VERSION, bookmarks: [], folders: [] };
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
      folder: sanitizeFolderPath(asString(src.folder)),
      tags: sanitizeTags(src.tags),
      note: asString(src.note),
      added: added,
      // Issue #63: pinned bookmarks lead the library; pinnedAt orders the
      // pinned section (newest pin on top). Survives via the JSON sidecar.
      pinned: src.pinned === true,
      pinnedAt:
        typeof src.pinnedAt === "number" && isFinite(src.pinnedAt) && src.pinnedAt > 0
          ? src.pinnedAt
          : 0,
    };
  }

  /**
   * Declared folder paths (issue #63): lets empty folders exist — folders
   * are otherwise implied by bookmark paths only. Kept sorted and unique;
   * path segments must be non-empty and free of "." / "..".
   */
  /** One folder path: trim, drop empties / "." / ".."; "" means unfiled. */
  function sanitizeFolderPath(value) {
    var path =
      typeof value === "string" ? value.trim().replace(/^\/+|\/+$/g, "") : "";
    if (!path) return "";
    var segs = path.split("/");
    for (var j = 0; j < segs.length; j++) {
      if (!segs[j] || segs[j] === "." || segs[j] === "..") return "";
    }
    return path;
  }

  function sanitizeFolderList(value) {
    if (!Array.isArray(value)) return [];
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < value.length; i++) {
      var path = sanitizeFolderPath(value[i]);
      if (!path || seen[path]) continue;
      seen[path] = true;
      out.push(path);
    }
    out.sort(function (a, b) {
      return a.localeCompare(b);
    });
    return out;
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
    return {
      version: MODEL_VERSION,
      bookmarks: out,
      folders: sanitizeFolderList(raw.folders),
    };
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

  function walkLevel(node, path, out, folders, state) {
    var children = node.children;
    for (var i = 0; i < children.length; i++) {
      var el = children[i];
      var tag = el.tagName;
      if (tag === "DL") {
        var childPath = joinFolder(path, state.heading);
        if (childPath) folders.push(childPath);
        collectLevel(el, childPath, out, folders);
        state.heading = null;
      } else if (tag === "A") {
        pushAnchor(el, joinFolder(path, state.heading), out);
      } else if (tag === "H2" || tag === "H3" || tag === "H4" || tag === "H5") {
        var heading = (el.textContent || "").trim();
        if (heading) state.heading = heading;
      } else if (el.children && el.children.length) {
        walkLevel(el, path, out, folders, state);
      }
    }
  }

  function collectLevel(dl, path, out, folders) {
    walkLevel(dl, path, out, folders, { heading: null });
  }

  function decodeBasicEntities(value) {
    return String(value == null ? "" : value)
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, function (_, n) {
        return String.fromCharCode(parseInt(n, 10));
      })
      .replace(/&#x([0-9a-f]+);/gi, function (_, n) {
        return String.fromCharCode(parseInt(n, 16));
      });
  }

  /**
   * Netscape HTML tokenizer for environments without DOMParser (MV3 service
   * workers — #75). Mirrors walkLevel/collectLevel: Hn names the next A/DL at
   * this level; nested DL inherits joinFolder(path, heading).
   */
  function parseHtmlFallback(text) {
    var src = String(text || "");
    var out = [];
    var folders = [];
    var stack = [];
    var pendingHeading = null;
    var i = 0;

    function currentPath() {
      return stack.length ? stack[stack.length - 1] : "";
    }

    while (i < src.length) {
      if (src.charAt(i) !== "<") {
        var nextLt = src.indexOf("<", i + 1);
        i = nextLt === -1 ? src.length : nextLt;
        continue;
      }
      var slice = src.slice(i);
      var mDlOpen = /^<DL\b[^>]*>/i.exec(slice);
      if (mDlOpen) {
        var dlPath = joinFolder(currentPath(), pendingHeading);
        if (dlPath) folders.push(dlPath);
        stack.push(dlPath);
        pendingHeading = null;
        i += mDlOpen[0].length;
        continue;
      }
      var mDlClose = /^<\/DL\b[^>]*>/i.exec(slice);
      if (mDlClose) {
        if (stack.length) stack.pop();
        pendingHeading = null;
        i += mDlClose[0].length;
        continue;
      }
      var mH = /^<H([2-5])\b[^>]*>([\s\S]*?)<\/H\1>/i.exec(slice);
      if (mH) {
        var heading = decodeBasicEntities(mH[2].replace(/<[^>]+>/g, "")).trim();
        pendingHeading = heading || null;
        i += mH[0].length;
        continue;
      }
      var mA = /^<A\s+([^>]*)>([\s\S]*?)<\/A>/i.exec(slice);
      if (mA) {
        var attrs = mA[1];
        var hrefM =
          /\bHREF\s*=\s*"([^"]*)"/i.exec(attrs) ||
          /\bHREF\s*=\s*'([^']*)'/i.exec(attrs) ||
          /\bHREF\s*=\s*([^\s>]+)/i.exec(attrs);
        var addM =
          /\bADD_DATE\s*=\s*"([^"]*)"/i.exec(attrs) ||
          /\bADD_DATE\s*=\s*'([^']*)'/i.exec(attrs) ||
          /\bADD_DATE\s*=\s*([^\s>]+)/i.exec(attrs);
        var href = hrefM ? decodeBasicEntities(hrefM[1]).trim() : "";
        var title = decodeBasicEntities(mA[2].replace(/<[^>]+>/g, "")).trim();
        if (isWebUrl(href)) {
          var addRaw = addM ? parseInt(addM[1], 10) : NaN;
          out.push(
            sanitizeBookmark({
              title: title,
              url: href,
              folder: joinFolder(currentPath(), pendingHeading),
              added: isFinite(addRaw) && addRaw > 0 ? addRaw * 1000 : 0,
            })
          );
        }
        i += mA[0].length;
        continue;
      }
      i += 1;
    }
    return { version: MODEL_VERSION, bookmarks: out, folders: sanitizeFolderList(folders) };
  }

  function parseHtml(text) {
    if (typeof DOMParser !== "undefined") {
      var doc = new DOMParser().parseFromString(String(text || ""), "text/html");
      var rootDl = doc.querySelector("dl");
      var out = [];
      var folders = [];
      if (rootDl) collectLevel(rootDl, "", out, folders);
      return {
        version: MODEL_VERSION,
        bookmarks: out,
        folders: sanitizeFolderList(folders),
      };
    }
    return parseHtmlFallback(text);
  }

  /**
   * Build a model from a getBookmarks() response.
   *
   * Prefer the JSON sidecar when present — it is complete for Davflare writes
   * and parses without DOMParser, which MV3 service workers lack (#75). When
   * both HTML and JSON exist in a DOM context, keep html-wins membership and
   * adopt rich fields from JSON (same as the library page).
   */
  function parseRemoteLibrary(res) {
    res = res || {};
    var jsonModel = null;
    if (res.jsonText) {
      var parsed = modelFromJson(res.jsonText);
      if (parsed.ok) jsonModel = parsed.model;
    }
    var html = res.html || "";
    if (jsonModel && html && typeof DOMParser !== "undefined") {
      return adoptRichFields(parseHtml(html), jsonModel);
    }
    if (jsonModel) return jsonModel;
    return parseHtml(html);
  }

  function buildTree(model) {
    var root = { folders: Object.create(null), links: [], name: "" };
    var norm = normalizeModel(model);
    var items = norm.bookmarks;
    // Seed declared folders first so empty ones survive serialization (#63).
    for (var s = 0; s < norm.folders.length; s++) {
      ensureFolderNode(root, norm.folders[s]);
    }
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var node = root;
      var folder = item.folder.replace(/^\/+|\/+$/g, "");
      if (folder) {
        node = ensureFolderNode(root, folder);
      }
      node.links.push(item);
    }
    return root;
  }

  function ensureFolderNode(root, folder) {
    var node = root;
    var segs = folder.split("/");
    for (var j = 0; j < segs.length; j++) {
      var seg = segs[j] || "";
      if (!node.folders[seg]) {
        node.folders[seg] = { folders: Object.create(null), links: [], name: seg };
      }
      node = node.folders[seg];
    }
    return node;
  }

  /**
   * Sorted unique folder paths for picker UIs (action popup datalist). Every
   * ancestor prefix is included so "Dev/Rust" also offers "Dev" as a target.
   */
  function folderPaths(model) {
    var seen = Object.create(null);
    var norm = normalizeModel(model);
    var items = norm.bookmarks;
    for (var i = 0; i < items.length; i++) {
      var folder = String(items[i].folder || "").trim().replace(/^\/+|\/+$/g, "");
      if (!folder) continue;
      markFolderPaths(seen, folder);
    }
    // Declared (possibly empty) folders join with their ancestor prefixes.
    for (var d = 0; d < norm.folders.length; d++) markFolderPaths(seen, norm.folders[d]);
    return Object.keys(seen).sort(function (a, b) {
      return a.localeCompare(b);
    });
  }

  function markFolderPaths(seen, folder) {
    var segs = folder.split("/");
    for (var j = 0; j < segs.length; j++) {
      var path = segs.slice(0, j + 1).join("/");
      if (path) seen[path] = true;
    }
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
    if (add.folders.length) {
      out.folders = sanitizeFolderList(out.folders.concat(add.folders));
    }
    return out;
  }

  function removeBookmark(model, id) {
    return removeBookmarks(model, [id]);
  }

  /** Batch remove by ids (issue #63); unknown ids are ignored. */
  function removeBookmarks(model, ids) {
    var next = normalizeModel(model);
    var drop = idSet(ids);
    if (!drop) return next;
    var kept = [];
    for (var i = 0; i < next.bookmarks.length; i++) {
      if (!drop[next.bookmarks[i].id]) kept.push(next.bookmarks[i]);
    }
    next.bookmarks = kept;
    return next;
  }

  function idSet(ids) {
    if (!Array.isArray(ids) || !ids.length) return null;
    var set = Object.create(null);
    for (var i = 0; i < ids.length; i++) {
      if (typeof ids[i] === "string" && ids[i]) set[ids[i]] = true;
    }
    return set;
  }

  /** Batch move to one folder path; empty string files under the root. */
  function moveBookmarks(model, ids, folder) {
    var next = normalizeModel(model);
    var drop = idSet(ids);
    if (!drop) return next;
    var raw = String(folder == null ? "" : folder).trim().replace(/^\/+|\/+$/g, "");
    var target = sanitizeFolderPath(raw);
    // Reject junk paths (e.g. "../x") instead of silently unfiling.
    if (raw && !target) return next;
    for (var i = 0; i < next.bookmarks.length; i++) {
      if (drop[next.bookmarks[i].id]) next.bookmarks[i].folder = target;
    }
    return next;
  }

  /** Batch tag adjust: `add` merged in, `remove` filtered out (issue #63). */
  function adjustTags(model, ids, add, remove) {
    var next = normalizeModel(model);
    var drop = idSet(ids);
    if (!drop) return next;
    var toAdd = sanitizeTags(add);
    var toRemove = sanitizeTags(remove);
    for (var i = 0; i < next.bookmarks.length; i++) {
      var item = next.bookmarks[i];
      if (!drop[item.id]) continue;
      var tags = item.tags.slice();
      for (var a = 0; a < toAdd.length; a++) {
        if (tags.indexOf(toAdd[a]) === -1) tags.push(toAdd[a]);
      }
      var kept = [];
      for (var b = 0; b < tags.length; b++) {
        if (toRemove.indexOf(tags[b]) === -1) kept.push(tags[b]);
      }
      item.tags = kept;
    }
    return next;
  }

  /** Batch pin / unpin. Pinning stamps pinnedAt (kept if already pinned). */
  function setPinned(model, ids, pinned) {
    var next = normalizeModel(model);
    var drop = idSet(ids);
    if (!drop) return next;
    var stamp = Date.now();
    for (var i = 0; i < next.bookmarks.length; i++) {
      var item = next.bookmarks[i];
      if (!drop[item.id]) continue;
      if (pinned) {
        if (!item.pinned) {
          item.pinned = true;
          item.pinnedAt = item.pinnedAt || stamp;
        }
      } else {
        item.pinned = false;
        item.pinnedAt = 0;
      }
    }
    return next;
  }

  /**
   * Rename a folder prefix: exact path and every descendant path are
   * rewritten on bookmarks and declared folders (issue #63). Returns the
   * model unchanged when either path is empty or they are equal.
   */
  function renameFolder(model, fromPath, toPath) {
    var next = normalizeModel(model);
    var from = sanitizeFolderPath(fromPath);
    var to = sanitizeFolderPath(toPath);
    if (!from || !to || from === to) return next;
    function mapPath(path) {
      if (path === from) return to;
      if (path.indexOf(from + "/") === 0) return to + path.slice(from.length);
      return null;
    }
    for (var i = 0; i < next.bookmarks.length; i++) {
      var mapped = mapPath(next.bookmarks[i].folder.replace(/^\/+|\/+$/g, ""));
      if (mapped !== null) next.bookmarks[i].folder = mapped;
    }
    var folders = [];
    for (var j = 0; j < next.folders.length; j++) {
      mapped = mapPath(next.folders[j]);
      folders.push(mapped !== null ? mapped : next.folders[j]);
    }
    next.folders = sanitizeFolderList(folders);
    return next;
  }

  /** Declare an empty folder path; no-op when it already exists. */
  function addFolder(model, path) {
    var next = normalizeModel(model);
    var clean = sanitizeFolderPath(path);
    if (!clean) return next;
    next.folders = sanitizeFolderList(next.folders.concat(clean));
    return next;
  }

  /** Drop a declared folder entry (folder paths implied by bookmarks stay). */
  function removeFolder(model, path) {
    var next = normalizeModel(model);
    var clean = String(path == null ? "" : path).trim().replace(/^\/+|\/+$/g, "");
    if (!clean) return next;
    next.folders = next.folders.filter(function (p) {
      return p !== clean;
    });
    return next;
  }

  /** Patch title/note/tags/folder on one bookmark by id; url and id stay put. */
  function updateBookmark(model, id, patch) {
    var next = normalizeModel(model);
    var src = patch && typeof patch === "object" ? patch : {};
    for (var i = 0; i < next.bookmarks.length; i++) {
      var item = next.bookmarks[i];
      if (item.id !== id) continue;
      if (typeof src.title === "string") item.title = src.title;
      if (typeof src.note === "string") item.note = src.note;
      if (typeof src.folder === "string") item.folder = src.folder;
      if (src.tags !== undefined) item.tags = sanitizeTags(src.tags);
      return next;
    }
    return next;
  }

  /**
   * html parse wins for membership/title/folder; the json sidecar donates
   * tags/note/id (and pin state, issue #63) for the same URL so rewrites
   * never drop rich fields. Declared folders are the union of both inputs.
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
      if (donor.pinned) {
        item.pinned = true;
        if (donor.pinnedAt) item.pinnedAt = donor.pinnedAt;
      }
    }
    if (Array.isArray(jsonModel.folders) && jsonModel.folders.length) {
      out.folders = sanitizeFolderList(out.folders.concat(jsonModel.folders));
    }
    return out;
  }

  /**
   * Issue #64: ordered creation plan for writing the library back into the
   * Chrome bookmarks tree. Nested {title, url?, children} nodes; folders
   * (including declared empty ones) keep their structure, links optionally
   * skip URLs already present under the target folder.
   */
  function buildChromeWritePlan(model, existingUrlKeys, opts) {
    var options = opts || {};
    var skip = options.skipDuplicates !== false;
    var known = Object.create(null);
    if (Array.isArray(existingUrlKeys)) {
      for (var i = 0; i < existingUrlKeys.length; i++) known[existingUrlKeys[i]] = true;
    }
    function walk(node) {
      var out = [];
      var links = node.links || [];
      for (var i = 0; i < links.length; i++) {
        var b = links[i];
        if (skip && known[urlKey(b.url)]) continue;
        out.push({ title: b.title || b.url, url: b.url });
      }
      var names = Object.keys(node.folders || {});
      for (var j = 0; j < names.length; j++) {
        out.push({ title: names[j], children: walk(node.folders[names[j]]) });
      }
      return out;
    }
    return walk(buildTree(model));
  }

  /**
   * Issue #65: tell a Davflare backup JSON from a HamHome backup JSON before
   * parsing. Both wrap a bookmarks array, but only Davflare entries carry
   * folder/note/added while HamHome uses categoryId/description/createdAt —
   * feeding HamHome data through modelFromJson would silently drop those
   * fields. Bare arrays are HamHome's shape; version field alone decides for
   * entries with no distinguishing keys (or an empty list).
   * Returns {flavor: "davflare"|"hamhome", parsed} or null when the text is
   * not a bookmark JSON at all.
   */
  function sniffJsonImport(text) {
    var parsed;
    try {
      parsed = JSON.parse(String(text || ""));
    } catch (err) {
      return null;
    }
    if (!parsed || typeof parsed !== "object") return null;
    var items = Array.isArray(parsed) ? parsed : parsed.bookmarks;
    if (!Array.isArray(items)) return null;
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (!item || typeof item !== "object") continue;
      if ("categoryId" in item || "description" in item || "createdAt" in item) {
        return { flavor: "hamhome", parsed: parsed };
      }
      if ("folder" in item || "note" in item || "added" in item || "id" in item) {
        return { flavor: "davflare", parsed: parsed };
      }
    }
    return { flavor: "davflare", parsed: parsed };
  }

  /**
   * Parse one imported backup file into a model. Accepts Davflare JSON,
   * HamHome JSON (meta.json shape, optionally with inline `categories`) and
   * Netscape HTML; hamhome is injected because it loads after this file in
   * the page. Returns {ok, model} or {ok: false, reason: "invalid"|"empty"}.
   */
  function importBackup(text, hamhome) {
    var trimmed = String(text || "").replace(/^\uFEFF/, "").trim();
    var model;
    if (trimmed.charAt(0) === "{" || trimmed.charAt(0) === "[") {
      var sniff = sniffJsonImport(trimmed);
      if (!sniff) return { ok: false, reason: "invalid" };
      if (sniff.flavor === "hamhome") {
        var hh = hamhome.importFrom(
          sniff.parsed,
          sniff.parsed && !Array.isArray(sniff.parsed) ? sniff.parsed.categories : null
        );
        if (!hh.ok) return { ok: false, reason: "invalid" };
        model = hh.model;
      } else {
        var parsed = modelFromJson(trimmed);
        if (!parsed.ok) return { ok: false, reason: "invalid" };
        model = parsed.model;
      }
    } else {
      model = parseHtml(trimmed);
    }
    if (!model.bookmarks.length) return { ok: false, reason: "empty" };
    return { ok: true, model: model };
  }

  /**
   * Omnibox search (issue #62): case-insensitive substring AND-match over
   * title/url/tags/folder. Deliberately lighter than the library page's
   * pinyin-aware filter so the service worker never loads the pinyin
   * dictionary. Returns up to `limit` normalized bookmarks.
   */
  function searchBookmarks(model, query, limit) {
    var terms = String(query || "")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (!terms.length) return [];
    var cap = typeof limit === "number" && isFinite(limit) && limit > 0 ? limit : 8;
    var items = normalizeModel(model).bookmarks;
    var out = [];
    for (var i = 0; i < items.length && out.length < cap; i++) {
      var item = items[i];
      var hay = (
        item.title + "\n" + item.url + "\n" + item.tags.join(" ") + "\n" + item.folder
      ).toLowerCase();
      var hit = true;
      for (var j = 0; j < terms.length; j++) {
        if (hay.indexOf(terms[j]) === -1) {
          hit = false;
          break;
        }
      }
      if (hit) out.push(item);
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
    addFolder: addFolder,
    adoptRichFields: adoptRichFields,
    adjustTags: adjustTags,
    buildChromeWritePlan: buildChromeWritePlan,
    emptyModel: emptyModel,
    folderPaths: folderPaths,
    importBackup: importBackup,
    isWebUrl: isWebUrl,
    isValidModel: isValidModel,
    makeId: makeId,
    mergeModels: mergeModels,
    modelFromJson: modelFromJson,
    modelToJsonText: modelToJsonText,
    moveBookmarks: moveBookmarks,
    normalizeModel: normalizeModel,
    parseHtml: parseHtml,
    parseRemoteLibrary: parseRemoteLibrary,
    removeBookmark: removeBookmark,
    removeBookmarks: removeBookmarks,
    removeFolder: removeFolder,
    renameFolder: renameFolder,
    searchBookmarks: searchBookmarks,
    serializeHtml: serializeHtml,
    setPinned: setPinned,
    sniffJsonImport: sniffJsonImport,
    updateBookmark: updateBookmark,
    urlKey: urlKey,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = Bookmarks;
}
