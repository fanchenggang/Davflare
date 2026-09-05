interface ShareEnv {
  BUCKET: R2Bucket;
}

import { buildZipStream } from "../api/_zip";
import { isInternalKey, sha256Hex, timingSafeEqual } from "../api/_apikey";

const SHARES_PREFIX = "_$flaredrive$/shares/";
const SHARE_COOKIE = "fd_share_code";

type Lang = "zh" | "en";

function inlineContentType(contentType: string) {
  return (
    contentType.startsWith("image/") ||
    contentType.startsWith("video/") ||
    contentType.startsWith("audio/") ||
    contentType === "application/pdf" ||
    contentType.startsWith("text/")
  );
}

// 分享内容来自用户上传、Content-Type 由上传方控制（可含 text/html、image/svg+xml）。
// CSP sandbox 使响应文档运行在 opaque origin 且默认禁脚本，杜绝同源 XSS 读取站内凭据；
// nosniff 防止浏览器嗅探改判类型。图片/音视频/PDF/纯文本预览不受影响。
function applyShareHardening(headers: Headers) {
  headers.set("Content-Security-Policy", "sandbox");
  headers.set("X-Content-Type-Options", "nosniff");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function acceptLanguage(request: Request): Lang {
  return (request.headers.get("Accept-Language") || "")
    .toLowerCase()
    .includes("zh")
    ? "zh"
    : "en";
}

function tokenFromParams(params: Record<string, unknown>): string | null {
  const token = params.token;
  if (typeof token === "string") return token;
  if (Array.isArray(token)) return token[0] || null;
  return null;
}

function sharePath(token: string): string {
  return `/share/${encodeURIComponent(token)}`;
}

// 落地页内的下载/预览链接要继承 ?code=（旧式门禁直链），
// 让这些子请求能通过与页面相同的提取码授予（cookie 之外的路径）
function actionHref(request: Request, token: string, extra: Record<string, string>): string {
  const code = new URL(request.url).searchParams.get("code");
  const params = new URLSearchParams(extra);
  if (code) params.set("code", code);
  const query = params.toString();
  return query ? `${sharePath(token)}?${query}` : sharePath(token);
}

const PAGE_TEXT = {
  zh: {
    title: "文件分享",
    download: "下载",
    preview: "在线预览",
    sizeLabel: "大小",
    sharedAtLabel: "分享时间",
    folderBadge: "文件夹（zip 下载）",
    incorrectCode: "提取码不正确",
    formTitle: "提取文件",
    formHint: "请输入提取码后查看文件",
    formPlaceholder: "提取码",
    formSubmit: "提取",
  },
  en: {
    title: "Shared file",
    download: "Download",
    preview: "Preview",
    sizeLabel: "Size",
    sharedAtLabel: "Shared at",
    folderBadge: "Folder (zip download)",
    incorrectCode: "Incorrect extract code",
    formTitle: "Extract file",
    formHint: "Enter the extract code to view the file",
    formPlaceholder: "Extract code",
    formSubmit: "Extract",
  },
};

const PAGE_CSS = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
  padding: 24px; font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  background: #f4f1ec; color: #1a1714; }
.card { background: #fff; border-radius: 16px; padding: 32px 28px; width: min(92vw, 520px);
  box-shadow: 0 8px 24px rgba(26, 23, 20, .08); }
h1 { font-size: 1.2rem; margin: 10px 0 6px; word-break: break-all; line-height: 1.45; }
.badge { display: inline-block; font-size: .78rem; font-weight: 600; color: #c45f10;
  background: rgba(243, 128, 32, .12); border-radius: 999px; padding: 3px 10px; }
p { color: rgba(26, 23, 20, .64); font-size: .9rem; margin: 0 0 16px; }
.err { color: #c4472c; }
.meta { margin: 14px 0 0; }
.meta div { display: flex; gap: 10px; font-size: .9rem; padding: 3px 0; }
.meta dt { color: rgba(26, 23, 20, .64); flex: 0 0 auto; }
.meta dd { margin: 0; word-break: break-all; }
.ptitle { font-size: .95rem; margin: 20px 0 8px; }
.preview { border-radius: 8px; overflow: hidden; background: rgba(243, 128, 32, .06);
  display: flex; justify-content: center; }
.preview img, .preview video { display: block; max-width: 100%; max-height: 60vh; }
.preview audio { width: 100%; }
.preview iframe { display: block; width: 100%; height: 320px; border: 0; background: #fff; }
input { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid rgba(28, 22, 16, .16);
  font-size: 1rem; margin-bottom: 12px; background: transparent; color: inherit; }
button { width: 100%; border: 0; border-radius: 8px; padding: 11px 12px;
  background: #f38020; color: #fff; font-weight: 600; font-size: 1rem; cursor: pointer; }
.btn { display: block; margin-top: 20px; border-radius: 8px; padding: 11px 12px;
  background: #f38020; color: #fff; font-weight: 600; font-size: 1rem; cursor: pointer;
  text-align: center; text-decoration: none; }
button:hover, .btn:hover { background: #d96e12; }
@media (prefers-color-scheme: dark) {
  body { background: #171310; color: #f1ece5; }
  .card { background: #211c17; box-shadow: 0 8px 24px rgba(0, 0, 0, .45); }
  .badge { color: #ff9a45; background: rgba(243, 128, 32, .2); }
  p, .meta dt { color: rgba(241, 236, 229, .66); }
  input { border-color: rgba(255, 255, 255, .18); }
  .preview iframe { background: #171310; }
}
`;

function htmlResponse(html: string, status = 200) {
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function typeLabel(contentType: string, lang: Lang): string {
  const t = contentType.toLowerCase();
  const zh = lang === "zh";
  if (t.startsWith("image/")) return zh ? "图片" : "Image";
  if (t.startsWith("video/")) return zh ? "视频" : "Video";
  if (t.startsWith("audio/")) return zh ? "音频" : "Audio";
  if (t === "application/pdf") return zh ? "PDF 文档" : "PDF document";
  if (t.startsWith("text/")) return zh ? "文本文件" : "Text file";
  if (t === "application/zip" || t === "application/gzip") {
    return zh ? "压缩包" : "Archive";
  }
  if (t === "application/json") return zh ? "JSON 文件" : "JSON file";
  return zh ? "文件" : "File";
}

// 与前端 inlineContentType 对齐的预览形态；embed = iframe（PDF/文本）
function previewKind(contentType: string): "image" | "video" | "audio" | "embed" | null {
  const t = contentType.toLowerCase();
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("audio/")) return "audio";
  if (t === "application/pdf" || t.startsWith("text/")) return "embed";
  return null;
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

// 无 JS 的稳定时间格式（服务端一律 UTC）
function formatUtcDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

function previewElement(kind: "image" | "video" | "audio" | "embed", href: string, name: string, previewText: string) {
  const src = escapeHtml(href);
  switch (kind) {
    case "image":
      return `<img src="${src}" alt="${escapeHtml(name)}" />`;
    case "video":
      return `<video src="${src}" controls preload="metadata"></video>`;
    case "audio":
      return `<audio src="${src}" controls preload="metadata"></audio>`;
    case "embed":
      return `<iframe src="${src}" title="${escapeHtml(previewText)}"></iframe>`;
  }
}

type LandingPage = {
  lang: Lang;
  name: string;
  isDir: boolean;
  contentType: string;
  size: number | null;
  createdAt: string | null;
  downloadHref: string;
  previewHref: string;
};

function renderLandingPage(options: LandingPage) {
  const t = PAGE_TEXT[options.lang];
  const name = escapeHtml(options.name);
  const badge = options.isDir ? t.folderBadge : typeLabel(options.contentType, options.lang);
  const created = options.createdAt ? formatUtcDate(options.createdAt) : "";
  const kind = options.isDir ? null : previewKind(options.contentType);
  const previewMarkup =
    kind && options.previewHref
      ? `<h2 class="ptitle">${t.preview}</h2>
  <div class="preview">${previewElement(kind, options.previewHref, options.name, t.preview)}</div>`
      : "";
  const html = `<!DOCTYPE html>
<html lang="${options.lang === "zh" ? "zh-CN" : "en"}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${name} · ${t.title}</title>
  <style>${PAGE_CSS}</style>
</head>
<body>
  <main class="card">
    <span class="badge">${escapeHtml(badge)}</span>
    <h1>${name}</h1>
    <dl class="meta">
      ${options.size !== null ? `<div><dt>${t.sizeLabel}</dt><dd>${escapeHtml(formatSize(options.size))}</dd></div>` : ""}
      ${created ? `<div><dt>${t.sharedAtLabel}</dt><dd>${escapeHtml(created)}</dd></div>` : ""}
    </dl>
    ${previewMarkup}
    <a class="btn" href="${escapeHtml(options.downloadHref)}" download>${t.download}</a>
  </main>
</body>
</html>`;
  return htmlResponse(html);
}

function extractForm(error: string | undefined, action: string, lang: Lang) {
  const t = PAGE_TEXT[lang];
  const message = error
    ? `<p class="err">${escapeHtml(error)}</p>`
    : `<p>${t.formHint}</p>`;
  const html = `<!DOCTYPE html>
<html lang="${lang === "zh" ? "zh-CN" : "en"}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${t.formTitle}</title>
  <style>${PAGE_CSS}</style>
</head>
<body>
  <form class="card" method="post" action="${escapeHtml(action)}">
    <h1>${t.formTitle}</h1>
    ${message}
    <input name="code" type="text" maxlength="32" autocomplete="off" placeholder="${t.formPlaceholder}" autofocus />
    <button type="submit">${t.formSubmit}</button>
  </form>
</body>
</html>`;
  return htmlResponse(html, error ? 403 : 200);
}

type ShareMeta = {
  key?: string;
  isDir?: boolean;
  expiresAt?: string | null;
  createdAt?: string | null;
  extractCode?: string;
};

async function loadMeta(bucket: R2Bucket, token: string): Promise<ShareMeta | null> {
  const metadataObject = await bucket.get(`${SHARES_PREFIX}${token}.json`);
  if (metadataObject === null) return null;
  const parsed = (await metadataObject.json()) as ShareMeta;
  // 防御性：拒绝历史遗留/绕过校验创建的内部对象分享（apikeys、trash 等元数据）
  if (parsed && typeof parsed.key === "string" && isInternalKey(parsed.key)) {
    return null;
  }
  return parsed;
}

// 与 /api/download、WebDAV GET 相同的 Content-Range 计算（R2 range 语义）
function calcContentRange(object: R2ObjectBody) {
  let rangeOffset = 0;
  let rangeEnd = object.size - 1;
  if (object.range) {
    if ("suffix" in object.range) {
      rangeOffset = Math.max(object.size - object.range.suffix, 0);
    } else {
      rangeOffset = object.range.offset ?? 0;
      const length = object.range.length ?? object.size - rangeOffset;
      rangeEnd = Math.min(rangeOffset + length - 1, object.size - 1);
    }
  }
  return { rangeOffset, rangeEnd };
}

function getCookieValue(cookieHeader: string | null, name: string): string {
  if (!cookieHeader) return "";
  for (const pair of cookieHeader.split(";")) {
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    if (pair.slice(0, eq).trim() === name) return pair.slice(eq + 1).trim();
  }
  return "";
}

// 提取码门禁：兼容 ?code= 查询参数（旧链接/直链），也接受表单 POST 成功后
// 种下的 path 级 cookie（cookie 里存的是码的 SHA-256，不回存明文）。
async function gateExtractCode(request: Request, metadata: ShareMeta, action: string) {
  const required = String(metadata.extractCode || "").trim();
  if (!required) return null;
  const provided = new URL(request.url).searchParams.get("code") || "";
  if (provided === required) return null;
  const cookieHash = getCookieValue(request.headers.get("Cookie"), SHARE_COOKIE);
  if (cookieHash && timingSafeEqual(cookieHash, await sha256Hex(required))) return null;
  const lang = acceptLanguage(request);
  return extractForm(
    provided || cookieHash ? PAGE_TEXT[lang].incorrectCode : undefined,
    action,
    lang
  );
}

async function loadFormCode(request: Request): Promise<string> {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("application/x-www-form-urlencoded")) {
    return "";
  }
  try {
    return (new URLSearchParams(await request.text()).get("code") || "").trim();
  } catch {
    return "";
  }
}

export const onRequestPost: PagesFunction<ShareEnv> = async (context) => {
  const { request, env, params } = context;
  const token = tokenFromParams(params);
  if (!token) return new Response("Not found", { status: 404 });
  const target = sharePath(token);

  const metadata = await loadMeta(env.BUCKET, token);
  if (metadata === null || !metadata.key) {
    return new Response("分享链接不存在或已撤销", { status: 404 });
  }
  if (
    metadata.expiresAt &&
    new Date(metadata.expiresAt).getTime() <= Date.now()
  ) {
    return new Response("分享链接已过期", { status: 410 });
  }

  const required = String(metadata.extractCode || "").trim();
  if (!required) {
    return new Response(null, { status: 303, headers: { Location: target } });
  }

  const provided = await loadFormCode(request);
  if (!provided) return extractForm(undefined, target, acceptLanguage(request));
  if (!timingSafeEqual(provided, required)) {
    return extractForm(PAGE_TEXT[acceptLanguage(request)].incorrectCode, target, acceptLanguage(request));
  }

  // 校验通过：种下 Path 限定到本分享的 HttpOnly 会话 cookie（存码的哈希），
  // 303 回不带 code 的干净链接。后续 GET/HEAD（含视频拖动的 Range 请求）
  // 自动带上 cookie，提取码不再出现在 URL、浏览器历史和访问日志里。
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  const headers = new Headers({ Location: target });
  headers.append(
    "Set-Cookie",
    `${SHARE_COOKIE}=${await sha256Hex(required)}; Path=${target}; HttpOnly; SameSite=Lax${secure}`
  );
  return new Response(null, { status: 303, headers });
};

export const onRequestGet: PagesFunction<ShareEnv> = async (context) => {
  const { request, env, params } = context;
  const token = tokenFromParams(params);
  if (!token) return new Response("Not found", { status: 404 });
  const target = sharePath(token);

  const metadata = await loadMeta(env.BUCKET, token);
  if (metadata === null) {
    return new Response("分享链接不存在或已撤销", { status: 404 });
  }
  if (!metadata.key) return new Response("Not found", { status: 404 });

  if (
    metadata.expiresAt &&
    new Date(metadata.expiresAt).getTime() <= Date.now()
  ) {
    return new Response("分享链接已过期", { status: 410 });
  }

  const gated = await gateExtractCode(request, metadata, target);
  if (gated) return gated;

  const url = new URL(request.url);
  const wantsDownload = url.searchParams.get("download") === "1";
  const wantsRaw = url.searchParams.get("raw") === "1";
  const name = metadata.key.split("/").pop() || "download";
  const downloadHref = actionHref(request, token, { download: "1" });

  // 目录分享没有内容预览：默认落地页，?download=1 / ?raw=1 都给 zip 流
  if (metadata.isDir) {
    if (!wantsDownload && !wantsRaw) {
      return renderLandingPage({
        lang: acceptLanguage(request),
        name,
        isDir: true,
        contentType: "application/x-directory",
        size: null,
        createdAt: metadata.createdAt ?? null,
        downloadHref,
        previewHref: "",
      });
    }
    const stream = await buildZipStream(env.BUCKET, [metadata.key], {
      stripPrefix: metadata.key,
    });
    const headers = new Headers();
    headers.set("Content-Type", "application/zip");
    headers.set("Cache-Control", "no-store");
    applyShareHardening(headers);
    headers.set(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(name)}.zip`
    );
    return new Response(stream, { headers });
  }

  if (!wantsDownload && !wantsRaw) {
    const head = await env.BUCKET.head(metadata.key);
    if (head === null) return new Response("File not found", { status: 404 });
    return renderLandingPage({
      lang: acceptLanguage(request),
      name,
      isDir: false,
      contentType: head.httpMetadata?.contentType || "application/octet-stream",
      size: head.size,
      createdAt: metadata.createdAt ?? null,
      downloadHref,
      previewHref: actionHref(request, token, { raw: "1" }),
    });
  }

  const object = await env.BUCKET.get(metadata.key, {
    range: request.headers,
  });
  if (object === null || !("body" in object)) {
    return new Response("File not found", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "no-store");
  applyShareHardening(headers);

  const contentType = object.httpMetadata?.contentType || "application/octet-stream";
  // ?download=1 固定 attachment 直链下载；?raw=1 内联给落地页预览，
  // 非预览安全类型回退 attachment（octet-stream 等浏览器也不会内联渲染）
  const disposition =
    wantsDownload || !inlineContentType(contentType) ? "attachment" : "inline";
  headers.set(
    "Content-Disposition",
    `${disposition}; filename*=UTF-8''${encodeURIComponent(name)}`
  );

  // Range 支持（视频拖动/断点续传）：R2 返回部分对象时给出 206 与正确的
  // Content-Range/Content-Length，覆盖 writeHttpMetadata 写入的全量 Content-Length。
  const rangeRequested =
    request.headers.has("Range") && object.range !== undefined;
  let status = 200;
  if (rangeRequested) {
    const { rangeOffset, rangeEnd } = calcContentRange(object);
    headers.set(
      "Content-Range",
      `bytes ${rangeOffset}-${rangeEnd}/${object.size}`
    );
    headers.set("Content-Length", String(rangeEnd - rangeOffset + 1));
    status = 206;
  }

  return new Response(object.body, { status, headers });
};

export const onRequestHead: PagesFunction<ShareEnv> = async (context) => {
  const { request, env, params } = context;
  const token = tokenFromParams(params);
  if (!token) return new Response(null, { status: 404 });
  const target = sharePath(token);

  const metadata = await loadMeta(env.BUCKET, token);
  if (metadata === null || !metadata.key) return new Response(null, { status: 404 });
  if (
    metadata.expiresAt &&
    new Date(metadata.expiresAt).getTime() <= Date.now()
  ) {
    return new Response(null, { status: 410 });
  }
  if (await gateExtractCode(request, metadata, target)) {
    return new Response(null, { status: 403 });
  }

  const url = new URL(request.url);
  const wantsDownload = url.searchParams.get("download") === "1";
  const wantsRaw = url.searchParams.get("raw") === "1";

  // HEAD 与 GET 语义对齐：默认落地页 text/html；?download=1 / ?raw=1 才是 zip/文件本体
  if (!wantsDownload && !wantsRaw) {
    return new Response(null, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  // 目录分享下载的是 zip 流，无固定长度
  if (metadata.isDir) {
    return new Response(null, {
      headers: {
        "Content-Type": "application/zip",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const object = await env.BUCKET.head(metadata.key);
  if (object === null) return new Response(null, { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  return new Response(null, { headers });
};
