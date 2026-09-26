// WebDAV 浏览目录页：服务端渲染、零 JS 的单 HTML，视觉对齐主站暖纸感主题
// （#f4f1ec 底 / #f38020 品牌橙，prefers-color-scheme 亮暗双套）。
// renderListingPage 只做渲染与转义；条目数据与排序由 protocol.ts 提供，便于单测。

export type ListingLang = "zh" | "en";

export type ListingEntry = {
  name: string;
  href: string;
  isCollection: boolean;
  /** 目录条目为占位合成数据，不展示大小与时间 */
  size: number | null;
  uploaded: Date | null;
  contentType: string;
};

const PAGE_TEXT: Record<ListingLang, { root: string; empty: string }> = {
  zh: { root: "根目录", empty: "此文件夹为空" },
  en: { root: "Root", empty: "This folder is empty" },
};

// Accept-Language 首段命中 zh 视为中文，与分享落地页的判定口径一致
export function acceptListingLang(request: Request): ListingLang {
  return (request.headers.get("Accept-Language") || "")
    .split(",")[0]
    .trim()
    .toLowerCase()
    .startsWith("zh")
    ? "zh"
    : "en";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${i === 0 ? value : value.toFixed(1)} ${units[i]}`;
}

// 零 JS 页面用 UTC 日期，与分享落地页的时间口径一致
function formatDate(date: Date): string {
  const iso = date.toISOString();
  return iso.slice(0, 10);
}

function iconKind(entry: ListingEntry): string {
  if (entry.isCollection) return "folder";
  const type = entry.contentType.toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  if (
    type === "application/zip" ||
    type === "application/gzip" ||
    type === "application/x-gzip" ||
    type === "application/x-tar" ||
    type === "application/x-7z-compressed" ||
    type === "application/x-rar-compressed"
  ) {
    return "archive";
  }
  return "file";
}

const ICON_SYMBOLS = `
<symbol id="li-folder" viewBox="0 0 16 16"><path d="M2.5 5c0-.8.7-1.5 1.5-1.5h2.4c.45 0 .87.2 1.15.55l.75.95h3.95c.8 0 1.45.65 1.45 1.45v5.1c0 .8-.65 1.45-1.45 1.45H4c-.8 0-1.5-.7-1.5-1.5z" fill="currentColor"/></symbol>
<symbol id="li-file" viewBox="0 0 16 16"><path d="M4 2.5h4.6l3.4 3.4v6.9c0 .7-.6 1.2-1.2 1.2H4c-.7 0-1.2-.5-1.2-1.2V3.7c0-.7.5-1.2 1.2-1.2z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M8.4 2.9V6h3.3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></symbol>
<symbol id="li-image" viewBox="0 0 16 16"><rect x="2.4" y="2.4" width="11.2" height="11.2" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="5.9" cy="6" r="1.15" fill="currentColor"/><path d="M3.4 11.6l2.7-2.9 2.3 2.3 1.8-1.8 2.4 2.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></symbol>
<symbol id="li-video" viewBox="0 0 16 16"><rect x="2" y="2.8" width="12" height="10.4" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M6.7 5.8l3.4 2.2-3.4 2.2z" fill="currentColor"/></symbol>
<symbol id="li-audio" viewBox="0 0 16 16"><path d="M6.1 11.9V4.5l6.1-1.3v7.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="4.4" cy="12" r="1.7" fill="currentColor"/><circle cx="10.5" cy="10.7" r="1.7" fill="currentColor"/></symbol>
<symbol id="li-archive" viewBox="0 0 16 16"><rect x="2.8" y="2.4" width="10.4" height="11.2" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 2.6v10.8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="1.7 1.7"/></symbol>`;

const LISTING_CSS = `
:root {
  color-scheme: light dark;
  --bg: #f4f1ec; --paper: #ffffff; --ink: #1a1714;
  --muted: rgba(26, 23, 20, .6); --line: rgba(28, 22, 16, .1);
  --brand: #f38020; --hover: rgba(243, 128, 32, .09);
  --c-folder: #f38020; --c-image: #2e7d4f; --c-video: #3d6b99;
  --c-audio: #7c5cbf; --c-archive: #b57317; --c-file: #6b6259;
  --shadow: 0 1px 2px rgba(26, 23, 20, .05), 0 6px 24px rgba(26, 23, 20, .07);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #171310; --paper: #211c17; --ink: #f1ece5;
    --muted: rgba(241, 236, 229, .64); --line: rgba(255, 255, 255, .09);
    --brand: #f79b45; --hover: rgba(243, 128, 32, .14);
    --c-folder: #f79b45; --c-image: #6fbf8f; --c-video: #7fa8d9;
    --c-audio: #a98fe0; --c-archive: #d9a04a; --c-file: #a89e92;
    --shadow: 0 8px 28px rgba(0, 0, 0, .4);
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; min-height: 100vh; background: var(--bg); color: var(--ink);
  display: flex; justify-content: center; padding: 28px 16px 40px;
  font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  font-size: 15px; line-height: 1.5;
}
main { width: 100%; max-width: 760px; }
.brand {
  display: flex; align-items: center; gap: 9px; margin: 0 2px 14px;
  font-weight: 700; font-size: 1.02rem; letter-spacing: -.02em; color: var(--brand);
}
.brand img { width: 22px; height: 22px; display: block; }
.card {
  background: var(--paper); border-radius: 16px; box-shadow: var(--shadow);
  padding: 18px 14px 14px;
}
.crumbs {
  display: flex; flex-wrap: wrap; align-items: center; gap: 2px 7px;
  padding: 2px 8px 12px; font-size: .88rem; border-bottom: 1px solid var(--line);
  margin-bottom: 8px;
}
.crumbs a { color: var(--muted); text-decoration: none; border-radius: 6px; padding: 1px 3px; }
.crumbs a:hover { color: var(--brand); background: var(--hover); }
.crumbs .cur { color: var(--brand); font-weight: 600; padding: 1px 3px; }
.empty { color: var(--muted); text-align: center; padding: 34px 0 26px; margin: 0; }
.list { list-style: none; margin: 0; padding: 0; }
.row {
  display: flex; align-items: center; gap: 11px; padding: 8px 9px;
  border-radius: 10px; text-decoration: none; color: inherit;
}
.row:hover { background: var(--hover); }
.row .icon { width: 18px; height: 18px; flex: none; }
.row .name {
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.row.dir .name { font-weight: 700; }
.row .size, .row .date {
  flex: none; color: var(--muted); font-size: .82rem;
  font-variant-numeric: tabular-nums;
}
.row .size { min-width: 64px; text-align: right; }
.row .date { min-width: 78px; text-align: right; }
.kind-folder { color: var(--c-folder); }
.kind-image { color: var(--c-image); }
.kind-video { color: var(--c-video); }
.kind-audio { color: var(--c-audio); }
.kind-archive { color: var(--c-archive); }
.kind-file { color: var(--c-file); }
@media (max-width: 520px) { .row .date { display: none; } }
`;

// 品牌标直接用站点 favicon（橙云），与主站视觉统一
const BRAND_MARK = `<img src="/favicon.png" alt="" width="22" height="22">`;

function renderCrumbs(path: string, rootLabel: string): string {
  const parts = path ? path.split("/") : [];
  let walked = "";
  const nodes: string[] = [`<a href="/webdav/">${escapeHtml(rootLabel)}</a>`];
  parts.forEach((part, index) => {
    walked += `${walked ? "/" : ""}${part}`;
    if (index === parts.length - 1) {
      nodes.push(`<span class="cur">${escapeHtml(part)}</span>`);
    } else {
      nodes.push(`<a href="/webdav/${encodeURIComponent(walked)}/">${escapeHtml(part)}</a>`);
    }
  });
  return nodes.join(`<span class="sep" aria-hidden="true">/</span>`);
}

export function renderListingPage(options: {
  lang: ListingLang;
  path: string;
  entries: ListingEntry[];
}): string {
  const t = PAGE_TEXT[options.lang];
  const rows = options.entries
    .map((entry) => {
      const kind = iconKind(entry);
      const size = entry.size !== null ? formatSize(entry.size) : "";
      const date = entry.uploaded !== null ? formatDate(entry.uploaded) : "";
      return `<li><a class="row${entry.isCollection ? " dir" : ""}" href="${escapeHtml(entry.href)}">
  <svg class="icon kind-${kind}" aria-hidden="true"><use href="#li-${kind}" /></svg>
  <span class="name">${escapeHtml(entry.name)}</span>
  <span class="size">${escapeHtml(size)}</span>
  <span class="date">${escapeHtml(date)}</span>
</a></li>`;
    })
    .join("\n");

  const title = options.path || t.root;
  return `<!DOCTYPE html>
<html lang="${options.lang === "zh" ? "zh-CN" : "en"}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} · Davflare</title>
<link rel="icon" href="/favicon.png">
<style>${LISTING_CSS}</style>
</head>
<body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${ICON_SYMBOLS}</defs></svg>
<main>
  <header class="brand">${BRAND_MARK}Davflare</header>
  <section class="card">
    <nav class="crumbs" aria-label="Breadcrumb">${renderCrumbs(options.path, t.root)}</nav>
    ${
      rows
        ? `<ul class="list">${rows}</ul>`
        : `<p class="empty">${escapeHtml(t.empty)}</p>`
    }
  </section>
</main>
</body>
</html>`;
}
