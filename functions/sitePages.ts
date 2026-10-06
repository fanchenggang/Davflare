// 导航站 / 相册站 / 公开目录 / 文档站的静态页：自包含 HTML，视觉对齐 WebDAV 目录页暖纸感
// （#f4f1ec / #f38020，prefers-color-scheme）。只做校验、转义与渲染；
// 写入 sites/{slug}/ 由 functions/api/sites.ts 负责。
import dictionary from "../src/app/stringsDictionary";
import { ALBUM_MANIFEST_NAME, isSafeManifestRel, parseSiteManifest } from "./siteManifest";

export { ALBUM_MANIFEST_NAME, isSafeManifestRel };

export const NAV_MAX_LINKS = 1000;
export const ALBUM_MAX_IMAGES = 200;
export const ALBUM_MAX_BYTES = 100 * 1024 * 1024;
/** 公开目录：每次最多 500 个文件、总共 2GB（只取文件夹当前层）。 */
export const DIR_MAX_FILES = 500;
export const DIR_MAX_BYTES = 2 * 1024 * 1024 * 1024;
/** 文档站：Markdown + 被引用图片合计最多 200 个文件、100MB。 */
export const DOCS_MAX_FILES = 200;
export const DOCS_MAX_BYTES = 100 * 1024 * 1024;

export type PageLang = "zh" | "en";

export type NavLink = { title: string; href: string };
export type NavGroup = { name: string; links: NavLink[] };

export type AlbumImage = { name: string; src: string };

const RASTER_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "avif"]);

export function pageLang(raw: unknown): PageLang {
  return raw === "zh" ? "zh" : "en";
}

export function pageLabel(
  lang: PageLang,
  key: string,
  params?: Record<string, string | number>
): string {
  const entry = dictionary[key];
  const text = entry ? entry[lang] : key;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (_match, name: string) =>
    params[name] !== undefined ? String(params[name]) : `{${name}}`
  );
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\u0000/g, "");
}

/** JSON embedded in HTML must not be able to close a script tag. */
export function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function isSafeNavHref(href: string): boolean {
  const trimmed = href.trim();
  if (!trimmed || /[\u0000-\u001f\s]/.test(trimmed)) return false;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
}

export function countNavLinks(groups: NavGroup[]): number {
  let count = 0;
  for (const group of groups) count += group.links.length;
  return count;
}

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

export function parseNavPayload(raw: unknown):
  | { ok: true; lang: PageLang; title: string; groups: NavGroup[]; count: number }
  | { ok: false; error: string } {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "bad nav" };
  }
  const body = raw as { lang?: unknown; title?: unknown; groups?: unknown };
  const lang = pageLang(body.lang);
  if (!Array.isArray(body.groups)) return { ok: false, error: "bad nav" };
  if (body.groups.length > NAV_MAX_LINKS) {
    return {
      ok: false,
      error: `bookmark limit exceeded: ${body.groups.length} > ${NAV_MAX_LINKS}`,
    };
  }
  const groups: NavGroup[] = [];
  let count = 0;
  for (const groupRaw of body.groups) {
    if (groupRaw === null || typeof groupRaw !== "object" || Array.isArray(groupRaw)) {
      return { ok: false, error: "bad nav" };
    }
    const group = groupRaw as { name?: unknown; links?: unknown };
    if (typeof group.name !== "string" || !Array.isArray(group.links)) {
      return { ok: false, error: "bad nav" };
    }
    const links: NavLink[] = [];
    for (const linkRaw of group.links) {
      if (linkRaw === null || typeof linkRaw !== "object" || Array.isArray(linkRaw)) {
        return { ok: false, error: "bad nav" };
      }
      const link = linkRaw as { title?: unknown; href?: unknown };
      if (typeof link.title !== "string" || typeof link.href !== "string") {
        return { ok: false, error: "bad nav" };
      }
      const href = clip(link.href.trim(), 4000);
      if (!href) continue;
      const title = clip(link.title.trim(), 500) || href;
      links.push({ title, href });
      count += 1;
      if (count > NAV_MAX_LINKS) {
        return {
          ok: false,
          error: `bookmark limit exceeded: ${count} > ${NAV_MAX_LINKS}`,
        };
      }
    }
    if (!links.length) continue;
    const name = clip(group.name.trim(), 300) || pageLabel(lang, "siteNavUnfiled");
    groups.push({ name, links });
  }
  if (count <= 0) return { ok: false, error: "no bookmarks" };
  const titleRaw = typeof body.title === "string" ? body.title.trim() : "";
  const title = clip(titleRaw, 200) || pageLabel(lang, "siteNavHeading");
  return { ok: true, lang, title, groups, count };
}

export function rasterExtension(filename: string): string | null {
  const base = filename.replace(/\\/g, "/").split("/").filter(Boolean).pop() || "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return null;
  const ext = base.slice(dot + 1).toLowerCase();
  return RASTER_EXTS.has(ext) ? ext : null;
}

export function isRasterFileName(filename: string): boolean {
  return rasterExtension(filename) !== null;
}

function albumStem(filename: string, ext: string): string {
  const base = filename.replace(/\\/g, "/").split("/").filter(Boolean).pop() || "";
  let stem = base.slice(0, Math.max(0, base.length - (ext.length + 1)));
  stem = stem.replace(/[\u0000-\u001f\u007f]/g, "");
  stem = stem.replace(/\.\.+/g, ".");
  stem = stem.replace(/[^\p{L}\p{N}._ -]+/gu, "_");
  stem = stem.replace(/^\.+/, "").replace(/\.+$/, "").trim();
  if (!stem || stem === "." || stem === "..") stem = "image";
  return stem.slice(0, 80);
}

/** attempt 从 1 起：1 为原名，之后 stem-2.ext、stem-3.ext… */
export function albumNameCandidate(filename: string, attempt: number): string | null {
  const ext = rasterExtension(filename);
  if (!ext || !Number.isInteger(attempt) || attempt < 1 || attempt > 10000) return null;
  const stem = albumStem(filename, ext);
  const name = attempt === 1 ? `${stem}.${ext}` : `${stem}-${attempt}.${ext}`;
  if (
    name.toLowerCase() === "index.html" ||
    name.toLowerCase() === ALBUM_MANIFEST_NAME
  ) {
    return null;
  }
  if (name.includes("/") || name.includes("\\") || name.includes("..")) return null;
  return name;
}

/**
 * 同步分配文件名。blockedLower 是不能占用的已有名字（小写），
 * 例如站点里不属于相册清单的用户文件。
 */
export function allocateAlbumNames(
  filenames: string[],
  blockedLower: Set<string> = new Set()
): string[] | null {
  const used = new Set<string>();
  for (const blocked of blockedLower) used.add(blocked.toLowerCase());
  const out: string[] = [];
  for (const filename of filenames) {
    if (!rasterExtension(filename)) return null;
    let chosen: string | null = null;
    for (let attempt = 1; attempt <= 10000; attempt += 1) {
      const candidate = albumNameCandidate(filename, attempt);
      if (!candidate) continue;
      if (used.has(candidate.toLowerCase())) continue;
      chosen = candidate;
      break;
    }
    if (!chosen) return null;
    used.add(chosen.toLowerCase());
    out.push(chosen);
  }
  return out;
}

export function checkAlbumLimits(
  count: number,
  bytes: number
): { ok: true } | { ok: false; error: string } {
  if (!Number.isFinite(count) || count <= 0) return { ok: false, error: "no album images" };
  if (count > ALBUM_MAX_IMAGES) {
    return {
      ok: false,
      error: `album image limit exceeded: ${count} > ${ALBUM_MAX_IMAGES}`,
    };
  }
  if (!Number.isFinite(bytes) || bytes < 0) return { ok: false, error: "bad album" };
  if (bytes > ALBUM_MAX_BYTES) {
    return {
      ok: false,
      error: `album size limit exceeded: ${bytes} > ${ALBUM_MAX_BYTES}`,
    };
  }
  return { ok: true };
}

/** 相册清单解析：通用清单解析 + 相册自己的条目上限（行为与 #142 一致）。 */
export function parseAlbumManifest(text: string): string[] {
  return parseSiteManifest(text, ALBUM_MAX_IMAGES + 8).files;
}

const PAGE_CSS = `
:root {
  color-scheme: light dark;
  --bg: #f4f1ec; --paper: #ffffff; --ink: #1a1714;
  --muted: rgba(26, 23, 20, .6); --line: rgba(28, 22, 16, .1);
  --brand: #f38020; --hover: rgba(243, 128, 32, .09);
  --shadow: 0 1px 2px rgba(26, 23, 20, .05), 0 6px 24px rgba(26, 23, 20, .07);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #171310; --paper: #211c17; --ink: #f1ece5;
    --muted: rgba(241, 236, 229, .64); --line: rgba(255, 255, 255, .09);
    --brand: #f79b45; --hover: rgba(243, 128, 32, .14);
    --shadow: 0 8px 28px rgba(0, 0, 0, .4);
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; min-height: 100vh; background: var(--bg); color: var(--ink);
  font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  font-size: 15px; line-height: 1.5;
}
.wrap { width: 100%; max-width: 960px; margin: 0 auto; padding: 28px 16px 48px; }
.brand {
  margin: 0 2px 14px; font-weight: 700; font-size: 1.02rem;
  letter-spacing: -.02em; color: var(--brand);
}
.card {
  background: var(--paper); border-radius: 16px; box-shadow: var(--shadow);
  padding: 18px 16px 16px;
}
h1 { font-size: 1.35rem; margin: 0 0 6px; letter-spacing: -.02em; }
.meta { color: var(--muted); margin: 0 0 14px; font-size: .88rem; }
.empty { color: var(--muted); text-align: center; padding: 28px 0; margin: 0; }
.group { margin: 0 0 18px; }
.group h2 {
  font-size: .95rem; margin: 0 0 8px; padding-bottom: 6px;
  border-bottom: 1px solid var(--line);
}
.links { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.links a, .links .dead {
  display: block; padding: 8px 10px; border-radius: 10px;
  text-decoration: none; color: inherit;
}
.links a:hover { background: var(--hover); color: var(--brand); }
.links .dead { color: var(--muted); }
.grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px; margin: 0; padding: 0; list-style: none;
}
.tile {
  display: block; padding: 0; border: 0; background: transparent; cursor: pointer;
  border-radius: 12px; overflow: hidden; color: inherit; text-align: left;
}
.tile img { width: 100%; height: 140px; object-fit: cover; display: block; background: var(--hover); }
.tile span {
  display: block; padding: 6px 8px 8px; font-size: .82rem; color: var(--muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.tile:hover { background: var(--hover); }
.lightbox {
  position: fixed; inset: 0; background: rgba(26, 23, 20, .78);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 12px; padding: 20px;
}
.lightbox[hidden] { display: none; }
.lightbox img { max-width: min(92vw, 960px); max-height: 78vh; border-radius: 12px; background: var(--paper); }
.lb-bar { display: flex; gap: 8px; align-items: center; }
.lb-bar button {
  border: 0; background: var(--paper); color: var(--ink); border-radius: 999px;
  padding: 8px 14px; font: inherit; cursor: pointer;
}
.lb-cap { color: #fff; margin: 0; font-size: .9rem; }
.files { width: 100%; border-collapse: collapse; font-size: .92rem; }
.files th {
  text-align: left; font-weight: 600; font-size: .8rem; color: var(--muted);
  padding: 6px 10px; border-bottom: 1px solid var(--line);
}
.files td { padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
.files tr:last-child td { border-bottom: 0; }
.files td.name { word-break: break-all; }
.files td.name a { color: inherit; text-decoration: none; }
.files td.name a:hover { color: var(--brand); }
.files td.num, .files th.num { text-align: right; white-space: nowrap; }
.files td.time { color: var(--muted); white-space: nowrap; }
.files a.dl { color: var(--brand); text-decoration: none; white-space: nowrap; }
.files a.dl:hover { text-decoration: underline; }
.note { color: var(--muted); font-size: .85rem; margin: 14px 2px 0; }
@media (max-width: 600px) { .files td.time, .files th.time { display: none; } }
.docs { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 16px; align-items: start; }
.toc {
  position: sticky; top: 16px; max-height: calc(100vh - 32px); overflow: auto;
  background: var(--paper); border-radius: 16px; box-shadow: var(--shadow); padding: 12px 8px;
}
.toc .home {
  display: block; padding: 6px 10px 8px; font-weight: 700; color: inherit; text-decoration: none;
  border-bottom: 1px solid var(--line); margin-bottom: 6px; word-break: break-word;
}
.toc ol { list-style: none; margin: 0; padding: 0; }
.toc li a {
  display: block; padding: 6px 10px; border-radius: 10px; color: inherit;
  text-decoration: none; font-size: .9rem; word-break: break-word;
}
.toc li a:hover { background: var(--hover); color: var(--brand); }
.toc li a[aria-current="page"] { background: var(--hover); color: var(--brand); font-weight: 600; }
.doc { padding: 22px 24px 26px; min-width: 0; }
.md { overflow-wrap: break-word; }
.md > :first-child { margin-top: 0; }
.md h1, .md h2, .md h3, .md h4, .md h5, .md h6 { line-height: 1.3; margin: 1.4em 0 .5em; letter-spacing: -.01em; }
.md h1 { font-size: 1.55rem; }
.md h2 { font-size: 1.25rem; padding-bottom: 4px; border-bottom: 1px solid var(--line); }
.md h3 { font-size: 1.08rem; }
.md p, .md ul, .md ol, .md blockquote, .md pre, .md table { margin: 0 0 1em; }
.md a { color: var(--brand); }
.md img { max-width: 100%; height: auto; border-radius: 8px; }
.md code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .88em;
  background: var(--hover); padding: .1em .35em; border-radius: 5px;
}
.md pre { background: var(--hover); padding: 12px 14px; border-radius: 10px; overflow: auto; }
.md pre code { background: transparent; padding: 0; }
.md blockquote { margin-left: 0; padding: 2px 14px; border-left: 3px solid var(--brand); color: var(--muted); }
.md table { border-collapse: collapse; display: block; overflow-x: auto; }
.md th, .md td { border: 1px solid var(--line); padding: 6px 10px; }
.md hr { border: 0; border-top: 1px solid var(--line); margin: 1.6em 0; }
.doc-list { list-style: none; margin: 0; padding: 0; }
.doc-list li a {
  display: block; padding: 10px; border-radius: 10px; color: inherit; text-decoration: none;
  border-bottom: 1px solid var(--line);
}
.doc-list li:last-child a { border-bottom: 0; }
.doc-list li a:hover { background: var(--hover); color: var(--brand); }
.doc-list small { display: block; color: var(--muted); font-size: .8rem; }
@media (max-width: 760px) {
  .docs { grid-template-columns: 1fr; }
  .toc { position: static; max-height: none; }
  .doc { padding: 18px 16px 20px; }
}
`;

function docShell(lang: PageLang, title: string, body: string, extraScript = ""): string {
  const htmlLang = lang === "zh" ? "zh-CN" : "en";
  return `<!DOCTYPE html>
<html lang="${htmlLang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} · Davflare</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<div class="wrap">
  <header class="brand">Davflare</header>
  ${body}
</div>
${extraScript}
</body>
</html>`;
}

export function renderNavPage(options: {
  lang: PageLang;
  title: string;
  groups: NavGroup[];
}): string {
  const count = countNavLinks(options.groups);
  if (count > NAV_MAX_LINKS) {
    throw new Error(`bookmark limit exceeded: ${count} > ${NAV_MAX_LINKS}`);
  }
  const lang = options.lang === "zh" ? "zh" : "en";
  const sections = options.groups
    .filter((group) => group.links.length > 0)
    .map((group) => {
      const items = group.links
        .map((link) => {
          const title = escapeHtml(link.title || link.href);
          if (!isSafeNavHref(link.href)) {
            return `<li><span class="dead">${title}</span></li>`;
          }
          const href = escapeHtml(link.href.trim());
          return `<li><a href="${href}" target="_blank" rel="noopener noreferrer">${title}</a></li>`;
        })
        .join("");
      return `<section class="group"><h2>${escapeHtml(group.name)}</h2><ul class="links">${items}</ul></section>`;
    })
    .join("");
  const body = `<section class="card">
  <h1>${escapeHtml(options.title)}</h1>
  <p class="meta">${escapeHtml(pageLabel(lang, "siteNavCount", { count }))}</p>
  ${sections || `<p class="empty">${escapeHtml(pageLabel(lang, "siteNavEmpty"))}</p>`}
</section>`;
  return docShell(lang, options.title, body);
}

export function renderAlbumPage(options: {
  lang: PageLang;
  title: string;
  images: AlbumImage[];
}): string {
  if (options.images.length > ALBUM_MAX_IMAGES) {
    throw new Error(
      `album image limit exceeded: ${options.images.length} > ${ALBUM_MAX_IMAGES}`
    );
  }
  const lang = options.lang === "zh" ? "zh" : "en";
  const images = options.images.filter(
    (image) => image.name && image.name !== ALBUM_MANIFEST_NAME && image.src
  );
  const tiles = images
    .map((image, index) => {
      const src = escapeHtml(image.src);
      const name = escapeHtml(image.name);
      return `<li><button type="button" class="tile" data-i="${index}"><img src="${src}" alt="${name}"><span>${name}</span></button></li>`;
    })
    .join("");
  const payload = safeJson(
    images.map((image) => ({ src: image.src, name: image.name }))
  );
  const body = `<section class="card">
  <h1>${escapeHtml(options.title)}</h1>
  <p class="meta">${escapeHtml(pageLabel(lang, "siteAlbumCount", { count: images.length }))}</p>
  ${
    tiles
      ? `<ul class="grid">${tiles}</ul>`
      : `<p class="empty">${escapeHtml(pageLabel(lang, "siteAlbumEmpty"))}</p>`
  }
</section>
<div id="lightbox" class="lightbox" hidden>
  <img id="lb-img" alt="">
  <p id="lb-cap" class="lb-cap"></p>
  <div class="lb-bar">
    <button type="button" id="lb-prev">${escapeHtml(pageLabel(lang, "siteAlbumPrev"))}</button>
    <button type="button" id="lb-next">${escapeHtml(pageLabel(lang, "siteAlbumNext"))}</button>
    <button type="button" id="lb-close">${escapeHtml(pageLabel(lang, "siteAlbumClose"))}</button>
  </div>
</div>`;
  const script = `<script type="application/json" id="album-data">${payload}</script>
<script>
(function () {
  var dataNode = document.getElementById("album-data");
  var items = [];
  try { items = JSON.parse(dataNode ? dataNode.textContent || "[]" : "[]"); } catch (e) { items = []; }
  var box = document.getElementById("lightbox");
  var img = document.getElementById("lb-img");
  var cap = document.getElementById("lb-cap");
  var i = 0;
  function show(n) {
    if (!items.length || !box || !img) return;
    i = (n + items.length) % items.length;
    img.src = items[i].src;
    img.alt = items[i].name;
    if (cap) cap.textContent = items[i].name + "  " + (i + 1) + " / " + items.length;
    box.hidden = false;
  }
  function hide() {
    if (!box || !img) return;
    box.hidden = true;
    img.removeAttribute("src");
  }
  var tiles = document.querySelectorAll(".tile");
  for (var t = 0; t < tiles.length; t++) {
    tiles[t].addEventListener("click", function (event) {
      var btn = event.currentTarget;
      var idx = Number(btn.getAttribute("data-i") || "0");
      show(idx);
    });
  }
  var prev = document.getElementById("lb-prev");
  var next = document.getElementById("lb-next");
  var closeBtn = document.getElementById("lb-close");
  if (prev) prev.addEventListener("click", function () { show(i - 1); });
  if (next) next.addEventListener("click", function () { show(i + 1); });
  if (closeBtn) closeBtn.addEventListener("click", hide);
  document.addEventListener("keydown", function (event) {
    if (!box || box.hidden) return;
    if (event.key === "ArrowLeft") show(i - 1);
    else if (event.key === "ArrowRight") show(i + 1);
    else if (event.key === "Escape") hide();
  });
})();
</script>`;
  return docShell(lang, options.title, body, script);
}

export type DirFile = { name: string; size: number; uploaded: string };

export function checkDirLimits(
  count: number,
  bytes: number
): { ok: true } | { ok: false; error: string } {
  if (!Number.isFinite(count) || count <= 0) return { ok: false, error: "no files" };
  if (count > DIR_MAX_FILES) {
    return { ok: false, error: `file limit exceeded: ${count} > ${DIR_MAX_FILES}` };
  }
  if (!Number.isFinite(bytes) || bytes < 0) return { ok: false, error: "bad dir" };
  if (bytes > DIR_MAX_BYTES) {
    return { ok: false, error: `size limit exceeded: ${bytes} > ${DIR_MAX_BYTES}` };
  }
  return { ok: true };
}

/** 1536 → "1.5 KB"；与网盘的 humanReadableSize 同一套 1024 进制单位。 */
export function formatSiteBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const text = unit === 0 ? String(Math.round(value)) : value.toFixed(value >= 100 ? 0 : 1);
  return `${text} ${units[unit]}`;
}

/** 零 JS 页面没法按访客时区显示，统一用 UTC 并标注。 */
export function formatSiteTime(value: string): { iso: string; text: string } | null {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  const iso = new Date(time).toISOString();
  return { iso, text: `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` };
}

export function renderDirPage(options: {
  lang: PageLang;
  title: string;
  files: DirFile[];
  subdirs?: number;
}): string {
  if (options.files.length > DIR_MAX_FILES) {
    throw new Error(`file limit exceeded: ${options.files.length} > ${DIR_MAX_FILES}`);
  }
  const lang = options.lang === "zh" ? "zh" : "en";
  const files = options.files.filter((file) => file.name);
  const total = files.reduce((sum, file) => sum + (Number.isFinite(file.size) ? file.size : 0), 0);
  const rows = files
    .map((file) => {
      const name = escapeHtml(file.name);
      const href = escapeHtml(encodeURIComponent(file.name));
      const time = formatSiteTime(file.uploaded);
      const timeCell = time
        ? `<time datetime="${escapeHtml(time.iso)}">${escapeHtml(time.text)}</time>`
        : "";
      return `<tr><td class="name"><a href="${href}" download="${name}">${name}</a></td><td class="num">${escapeHtml(formatSiteBytes(file.size))}</td><td class="time">${timeCell}</td><td class="num"><a class="dl" href="${href}" download="${name}">${escapeHtml(pageLabel(lang, "siteDirDownload"))}</a></td></tr>`;
    })
    .join("");
  const subdirs = Math.max(0, Math.floor(options.subdirs || 0));
  const table = rows
    ? `<table class="files"><thead><tr><th>${escapeHtml(pageLabel(lang, "siteDirName"))}</th><th class="num">${escapeHtml(pageLabel(lang, "siteDirSize"))}</th><th class="time">${escapeHtml(pageLabel(lang, "siteDirModified"))}</th><th class="num"></th></tr></thead><tbody>${rows}</tbody></table>`
    : `<p class="empty">${escapeHtml(pageLabel(lang, "siteDirEmpty"))}</p>`;
  const body = `<section class="card">
  <h1>${escapeHtml(options.title)}</h1>
  <p class="meta">${escapeHtml(pageLabel(lang, "siteDirCount", { count: files.length, size: formatSiteBytes(total) }))}</p>
  ${table}
</section>
${subdirs > 0 ? `<p class="note">${escapeHtml(pageLabel(lang, "siteDirSubdirsNote", { count: subdirs }))}</p>` : ""}`;
  return docShell(lang, options.title, body);
}

/**
 * 文档站的「发布范围」（#153）：所选笔记的公共目录。图片只能来自这个目录的子树。
 * 范围是网盘根目录（笔记在根目录，或分散在不同顶层文件夹）时只认根目录当前层，绝不放开到全盘。
 */
export function docsScopeOf(keys: string[]): string {
  let common: string[] | null = null;
  for (const key of keys) {
    const parts = key.split("/").filter(Boolean);
    parts.pop();
    if (common === null) {
      common = parts;
      continue;
    }
    let i = 0;
    while (i < common.length && i < parts.length && common[i] === parts[i]) i += 1;
    common = common.slice(0, i);
  }
  return (common ?? []).join("/");
}

export function isInDocsScope(key: string, scope: string): boolean {
  if (!key || key.includes("_$flaredrive$")) return false;
  if (key.split("/").some((part) => !part || part === "." || part === "..")) return false;
  if (!scope) return !key.includes("/");
  return key.startsWith(`${scope}/`);
}

/** 文件名按 UTF-16 长度截短但保留扩展名，且不切断代理对（#153：长文件名不再让整次发布 400）。 */
export function shortenFileName(name: string, max: number): string {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 && name.length - dot <= 16 ? name.slice(dot) : "";
  const budget = Math.max(1, max - ext.length);
  let stem = "";
  for (const ch of Array.from(ext ? name.slice(0, dot) : name)) {
    if (stem.length + ch.length > budget) break;
    stem += ch;
  }
  return `${stem.trimEnd() || "file"}${ext}`;
}

export function checkDocsLimits(
  pages: number,
  images: number,
  bytes: number
): { ok: true } | { ok: false; error: string } {
  if (!Number.isFinite(pages) || pages <= 0) return { ok: false, error: "no files" };
  const count = pages + (Number.isFinite(images) && images > 0 ? images : 0);
  if (count > DOCS_MAX_FILES) {
    return { ok: false, error: `file limit exceeded: ${count} > ${DOCS_MAX_FILES}` };
  }
  if (!Number.isFinite(bytes) || bytes < 0) return { ok: false, error: "bad docs" };
  if (bytes > DOCS_MAX_BYTES) {
    return { ok: false, error: `size limit exceeded: ${bytes} > ${DOCS_MAX_BYTES}` };
  }
  return { ok: true };
}

export type DocsNavItem = { href: string; title: string; file?: string };

function renderDocsToc(lang: PageLang, siteTitle: string, nav: DocsNavItem[], current: string | null) {
  const items = nav
    .map((item) => {
      const currentAttr = item.href === current ? ' aria-current="page"' : "";
      return `<li><a href="${escapeHtml(encodeURIComponent(item.href))}"${currentAttr}>${escapeHtml(item.title)}</a></li>`;
    })
    .join("");
  const homeCurrent = current === null ? ' aria-current="page"' : "";
  return `<nav class="toc" aria-label="${escapeHtml(pageLabel(lang, "siteDocsToc"))}"><a class="home" href="index.html"${homeCurrent}>${escapeHtml(siteTitle)}</a><ol>${items}</ol></nav>`;
}

/**
 * 文档站单篇页面。bodyHtml 来自浏览器端 markdown-it（html:false，原始 HTML 已被转义、危险链接已被拦截），
 * 这里原样嵌入；其余所有文本都在这里转义。零 JS。
 */
export function renderDocsPage(options: {
  lang: PageLang;
  siteTitle: string;
  pageTitle: string;
  nav: DocsNavItem[];
  current: string;
  bodyHtml: string;
}): string {
  const lang = options.lang === "zh" ? "zh" : "en";
  const body = `<div class="docs">
  ${renderDocsToc(lang, options.siteTitle, options.nav, options.current)}
  <main class="card doc"><article class="md">${options.bodyHtml}</article></main>
</div>`;
  return docShell(lang, `${options.pageTitle} · ${options.siteTitle}`, body);
}

/** 文档站首页：侧边栏目录 + 文档列表。 */
export function renderDocsIndex(options: {
  lang: PageLang;
  siteTitle: string;
  nav: DocsNavItem[];
}): string {
  const lang = options.lang === "zh" ? "zh" : "en";
  const list = options.nav.length
    ? `<ol class="doc-list">${options.nav
        .map((item) => {
          const file = item.file && item.file !== item.title ? `<small>${escapeHtml(item.file)}</small>` : "";
          return `<li><a href="${escapeHtml(encodeURIComponent(item.href))}">${escapeHtml(item.title)}${file}</a></li>`;
        })
        .join("")}</ol>`
    : `<p class="empty">${escapeHtml(pageLabel(lang, "siteDocsEmpty"))}</p>`;
  const body = `<div class="docs">
  ${renderDocsToc(lang, options.siteTitle, options.nav, null)}
  <main class="card doc">
    <h1>${escapeHtml(options.siteTitle)}</h1>
    <p class="meta">${escapeHtml(pageLabel(lang, "siteDocsCount", { count: options.nav.length }))}</p>
    ${list}
  </main>
</div>`;
  return docShell(lang, options.siteTitle, body);
}
