/**
 * 文件收集链接的匿名上传页（/collect/{token}）。
 * 风格沿用分享落地页（暖纸色卡片，默认浅色，跟随 prefers-color-scheme）。
 * 只有一段内联脚本负责分块上传（10 MiB/块），由 CSP nonce 放行；
 * 文案全部来自 stringsDictionary（zh/en），按 Accept-Language 选择。
 */
import dictionary from "../src/app/stringsDictionary";
import { COLLECT_PART_SIZE, CollectRecord, collectRemaining } from "./_collect";

export type CollectLang = "zh" | "en";

export function collectLang(request: Request): CollectLang {
  return (request.headers.get("Accept-Language") || "").toLowerCase().includes("zh")
    ? "zh"
    : "en";
}

export function collectText(
  lang: CollectLang,
  key: string,
  params?: Record<string, string | number>
): string {
  const entry = dictionary[key];
  const text = entry ? entry[lang] : key;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (_m, name: string) =>
    params[name] !== undefined ? String(params[name]) : `{${name}}`
  );
}

export function escapeCollectHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatCollectSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 || value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}

/** JSON 嵌入 <script type="application/json">：转义 < > & 与行分隔符，防止闭合标签注入 */
export function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

const PAGE_CSS = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
  padding: 24px; font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  background: #f4f1ec; color: #1a1714; }
.card { background: #fff; border-radius: 16px; padding: 32px 28px; width: min(92vw, 560px);
  box-shadow: 0 8px 24px rgba(26, 23, 20, .08); }
h1 { font-size: 1.2rem; margin: 10px 0 6px; line-height: 1.45; }
.bmark { display: flex; align-items: center; gap: 7px; font-weight: 700; font-size: .95rem;
  letter-spacing: -.02em; color: #f38020; margin-bottom: 14px; }
.bmark img { width: 20px; height: 20px; display: block; }
.badge { display: inline-block; font-size: .78rem; font-weight: 600; color: #c45f10;
  background: rgba(243, 128, 32, .12); border-radius: 999px; padding: 3px 10px; }
p { color: rgba(26, 23, 20, .64); font-size: .9rem; margin: 0 0 14px; line-height: 1.6; }
.note { white-space: pre-wrap; word-break: break-word; color: inherit; background: rgba(243, 128, 32, .06);
  border-radius: 8px; padding: 10px 12px; }
.meta { margin: 14px 0; }
.meta div { display: flex; gap: 10px; font-size: .9rem; padding: 3px 0; }
.meta dt { color: rgba(26, 23, 20, .64); flex: 0 0 auto; }
.meta dd { margin: 0; word-break: break-word; }
.pick { display: block; border: 2px dashed rgba(243, 128, 32, .45); border-radius: 12px; padding: 22px 12px;
  text-align: center; cursor: pointer; font-weight: 600; color: #c45f10; }
.pick.drag { background: rgba(243, 128, 32, .08); }
.pick input { position: absolute; width: 1px; height: 1px; opacity: 0; }
button { width: 100%; border: 0; border-radius: 8px; padding: 11px 12px; margin-top: 14px;
  background: #f38020; color: #fff; font-weight: 600; font-size: 1rem; cursor: pointer; }
button:hover { background: #d96e12; }
button:disabled { opacity: .5; cursor: default; }
ul { list-style: none; padding: 0; margin: 14px 0 0; }
li { padding: 8px 0; border-bottom: 1px solid rgba(28, 22, 16, .08); font-size: .9rem; }
li .row { display: flex; justify-content: space-between; gap: 10px; }
li .name { word-break: break-all; }
li .state { flex: 0 0 auto; color: rgba(26, 23, 20, .64); }
li.ok .state { color: #2e7d32; }
li.err .state { color: #c4472c; }
progress { width: 100%; height: 6px; accent-color: #f38020; }
.summary { margin-top: 14px; font-weight: 600; }
.err { color: #c4472c; }
@media (prefers-color-scheme: dark) {
  body { background: #171310; color: #f1ece5; }
  .card { background: #211c17; box-shadow: 0 8px 24px rgba(0, 0, 0, .45); }
  .badge { color: #ff9a45; background: rgba(243, 128, 32, .2); }
  .bmark, .pick { color: #ff9a45; }
  p, .meta dt, li .state { color: rgba(241, 236, 229, .66); }
  li { border-color: rgba(255, 255, 255, .08); }
  li.ok .state { color: #81c784; }
}
`;

// 分块上传脚本：顺序上传选中的文件，每个文件 create → part×N（10 MiB）→ complete，
// 失败时 abort。不使用模板字符串，避免与外层 TS 模板冲突。
const UPLOAD_SCRIPT = `
(function () {
  var data = JSON.parse(document.getElementById("collect-data").textContent);
  var T = data.t;
  var base = data.base;
  var PART = data.partSize;
  var remainingFiles = data.remainingFiles;
  var remainingBytes = data.remainingBytes;
  var input = document.getElementById("files");
  var pick = document.getElementById("pick");
  var btn = document.getElementById("start");
  var list = document.getElementById("list");
  var summary = document.getElementById("summary");
  var queue = [];
  var busy = false;
  document.getElementById("nojs").remove();
  document.getElementById("uploader").hidden = false;
  var exp = document.getElementById("expires");
  if (exp) { try { exp.textContent = new Date(exp.getAttribute("datetime")).toLocaleString(); } catch (e) {} }

  function fmt(text, vars) {
    return text.replace(/\\{(\\w+)\\}/g, function (m, k) { return vars && vars[k] !== undefined ? String(vars[k]) : m; });
  }
  function size(n) {
    var u = ["B", "KB", "MB", "GB"], i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return (i === 0 || n >= 10 ? Math.round(n) : Math.round(n * 10) / 10) + " " + u[i];
  }
  function errText(code) {
    return T.errors[code] || T.errors.generic;
  }
  function addFiles(files) {
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var li = document.createElement("li");
      var row = document.createElement("div");
      row.className = "row";
      var name = document.createElement("span");
      name.className = "name";
      name.textContent = f.name + " · " + size(f.size);
      var state = document.createElement("span");
      state.className = "state";
      state.textContent = T.queued;
      row.appendChild(name);
      row.appendChild(state);
      var bar = document.createElement("progress");
      bar.max = 1; bar.value = 0;
      li.appendChild(row);
      li.appendChild(bar);
      list.appendChild(li);
      queue.push({ file: f, li: li, state: state, bar: bar, done: false });
    }
    btn.disabled = busy || !queue.some(function (q) { return !q.done; });
  }
  function call(path, opts) {
    return fetch(base + path, opts).then(function (res) {
      if (res.ok) return res;
      return res.json().catch(function () { return {}; }).then(function (body) {
        var e = new Error(body && body.error ? body.error : "generic");
        e.code = body && body.error ? body.error : (res.status === 503 ? "busy" : "generic");
        throw e;
      });
    }, function () { var e = new Error("network"); e.code = "network"; throw e; });
  }
  function json(path, body) {
    return call(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }
  function withRetry(fn, tries) {
    return fn().catch(function (e) {
      if (tries > 1 && (e.code === "network" || e.code === "busy")) {
        return new Promise(function (r) { setTimeout(r, 1500); }).then(function () { return withRetry(fn, tries - 1); });
      }
      throw e;
    });
  }
  function uploadOne(item) {
    var f = item.file;
    if (f.size === 0) return Promise.reject({ code: "empty_file" });
    if (f.size > data.maxFileBytes) return Promise.reject({ code: "file_too_large" });
    if (remainingFiles <= 0) return Promise.reject({ code: "too_many_files" });
    if (f.size > remainingBytes) return Promise.reject({ code: "quota_exceeded" });
    return withRetry(function () {
      return json("/create", { name: f.name, size: f.size, type: f.type });
    }, 3).then(function (res) { return res.json(); }).then(function (created) {
      var parts = [];
      var n = 0;
      function next() {
        if (n >= created.partCount) return Promise.resolve();
        var idx = n++;
        var blob = f.slice(idx * PART, Math.min(f.size, (idx + 1) * PART));
        return withRetry(function () {
          return call("/part?uploadId=" + encodeURIComponent(created.uploadId) + "&partNumber=" + (idx + 1), { method: "PUT", body: blob });
        }, 3).then(function (res) { return res.json(); }).then(function (part) {
          parts.push({ partNumber: part.partNumber, etag: part.etag });
          item.bar.value = n / created.partCount;
          return next();
        });
      }
      return next().then(function () {
        return json("/complete", { uploadId: created.uploadId, parts: parts });
      }).then(function (res) { return res.json(); }).then(function (done) {
        remainingFiles = done.remainingFiles;
        remainingBytes = done.remainingBytes;
      }, function (e) {
        json("/abort", { uploadId: created.uploadId }).catch(function () {});
        throw e;
      });
    });
  }
  function run() {
    if (busy) return;
    busy = true;
    btn.disabled = true;
    input.disabled = true;
    var todo = queue.filter(function (q) { return !q.done; });
    var ok = 0, failed = 0, i = 0;
    function step() {
      if (i >= todo.length) {
        busy = false;
        input.disabled = false;
        summary.textContent = failed ? fmt(T.someFailed, { ok: ok, failed: failed }) : fmt(T.allDone, { n: ok });
        summary.className = failed ? "summary err" : "summary";
        btn.disabled = true;
        return;
      }
      var item = todo[i++];
      item.state.textContent = fmt(T.uploading, { done: i, total: todo.length });
      uploadOne(item).then(function () {
        item.done = true; ok++;
        item.li.className = "ok";
        item.bar.value = 1;
        item.state.textContent = T.done;
      }, function (e) {
        item.done = true; failed++;
        item.li.className = "err";
        item.state.textContent = errText(e && e.code);
      }).then(step);
    }
    summary.textContent = "";
    step();
  }
  input.addEventListener("change", function () { addFiles(input.files); input.value = ""; });
  btn.addEventListener("click", run);
  ["dragenter", "dragover"].forEach(function (t) {
    pick.addEventListener(t, function (e) { e.preventDefault(); pick.classList.add("drag"); });
  });
  ["dragleave", "drop"].forEach(function (t) {
    pick.addEventListener(t, function (e) { e.preventDefault(); pick.classList.remove("drag"); });
  });
  pick.addEventListener("drop", function (e) { if (!busy && e.dataTransfer) addFiles(e.dataTransfer.files); });
})();
`;

const ERROR_KEYS: Record<string, string> = {
  not_found: "collectErrNotFound",
  expired: "collectErrExpired",
  disabled: "collectErrDisabled",
  empty_file: "collectErrEmpty",
  file_too_large: "collectErrFileTooLarge",
  too_many_files: "collectErrTooManyFiles",
  quota_exceeded: "collectErrQuota",
  too_many_pending: "collectErrTooManyPending",
  folder_gone: "collectErrFolderGone",
  busy: "collectErrBusy",
  network: "collectErrNetwork",
  generic: "collectErrGeneric",
};

function pageShell(lang: CollectLang, title: string, body: string, nonce?: string, script?: string) {
  return `<!DOCTYPE html>
<html lang="${lang === "zh" ? "zh-CN" : "en"}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <meta name="referrer" content="no-referrer" />
  <title>${escapeCollectHtml(title)} · Davflare</title>
  <link rel="icon" href="/favicon.png" />
  <style>${PAGE_CSS}</style>
</head>
<body>
  <main class="card">
    <header class="bmark"><img src="/favicon.png" alt="" width="20" height="20">Davflare</header>
${body}
  </main>${script && nonce ? `\n  <script nonce="${nonce}">${script}</script>` : ""}
</body>
</html>`;
}

function collectHtmlResponse(html: string, status: number, nonce?: string): Response {
  const scriptSrc = nonce ? `'nonce-${nonce}'` : "'none'";
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
      "Content-Security-Policy": `default-src 'none'; script-src ${scriptSrc}; style-src 'unsafe-inline'; img-src 'self'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'`,
    },
  });
}

export type CollectMessageKind = "notFound" | "expired" | "disabled" | "full";

const MESSAGE_KEYS: Record<CollectMessageKind, [string, string]> = {
  notFound: ["collectPageNotFoundTitle", "collectPageNotFoundBody"],
  expired: ["collectPageExpiredTitle", "collectPageExpiredBody"],
  disabled: ["collectPageDisabledTitle", "collectPageDisabledBody"],
  full: ["collectPageFullTitle", "collectPageFullBody"],
};

export function renderCollectMessage(
  kind: CollectMessageKind,
  lang: CollectLang,
  head = false
): Response {
  const [titleKey, bodyKey] = MESSAGE_KEYS[kind];
  const title = collectText(lang, titleKey);
  const html = pageShell(
    lang,
    title,
    `    <span class="badge">${escapeCollectHtml(collectText(lang, "collectPageBadge"))}</span>
    <h1>${escapeCollectHtml(title)}</h1>
    <p>${escapeCollectHtml(collectText(lang, bodyKey))}</p>`
  );
  const status = kind === "notFound" ? 404 : kind === "full" ? 200 : 410;
  return collectHtmlResponse(head ? "" : html, status);
}

export function renderCollectPage(
  record: CollectRecord,
  token: string,
  lang: CollectLang,
  options: { head?: boolean; now?: number } = {}
): Response {
  const now = options.now ?? Date.now();
  const remaining = collectRemaining(record, now);
  if (remaining.files <= 0 || remaining.bytes <= 0) {
    return renderCollectMessage("full", lang, options.head);
  }
  const t = (key: string, params?: Record<string, string | number>) => collectText(lang, key, params);
  const nonce = newNonce();
  const expires = new Date(record.expiresAt);
  const expiresFallback = `${expires.toISOString().slice(0, 16).replace("T", " ")} UTC`;
  const errors: Record<string, string> = {};
  for (const [code, key] of Object.entries(ERROR_KEYS)) {
    errors[code] = t(key, { max: formatCollectSize(record.limits.maxFileBytes) });
  }
  const payload = {
    base: `/collect/${token}`,
    partSize: COLLECT_PART_SIZE,
    maxFileBytes: record.limits.maxFileBytes,
    remainingFiles: remaining.files,
    remainingBytes: remaining.bytes,
    t: {
      queued: t("collectPageQueued"),
      uploading: t("collectPageUploading"),
      done: t("collectPageDone"),
      allDone: t("collectPageAllDone"),
      someFailed: t("collectPageSomeFailed"),
      errors,
    },
  };
  const note = record.note
    ? `    <p class="note">${escapeCollectHtml(record.note)}</p>\n`
    : "";
  const body = `    <span class="badge">${escapeCollectHtml(t("collectPageBadge"))}</span>
    <h1>${escapeCollectHtml(t("collectPageTitle"))}</h1>
    <p>${escapeCollectHtml(t("collectPageIntro"))}</p>
${note}    <dl class="meta">
      <div><dt>${escapeCollectHtml(t("collectPageExpires"))}</dt><dd><time id="expires" datetime="${escapeCollectHtml(expires.toISOString())}">${escapeCollectHtml(expiresFallback)}</time></dd></div>
      <div><dt>${escapeCollectHtml(t("collectPageLimitsLabel"))}</dt><dd>${escapeCollectHtml(
        t("collectPageLimits", {
          maxFile: formatCollectSize(record.limits.maxFileBytes),
          files: remaining.files,
          bytes: formatCollectSize(remaining.bytes),
        })
      )}</dd></div>
    </dl>
    <p id="nojs" class="err">${escapeCollectHtml(t("collectPageNoJs"))}</p>
    <section id="uploader" hidden>
      <label id="pick" class="pick">${escapeCollectHtml(t("collectPageChoose"))}<input id="files" type="file" multiple></label>
      <ul id="list"></ul>
      <button id="start" type="button" disabled>${escapeCollectHtml(t("collectPageStart"))}</button>
      <div id="summary" class="summary" role="status" aria-live="polite"></div>
    </section>
    <script id="collect-data" type="application/json">${safeJsonForScript(payload)}</script>`;
  const html = pageShell(lang, t("collectPageTitle"), body, nonce, UPLOAD_SCRIPT);
  return collectHtmlResponse(options.head ? "" : html, 200, nonce);
}
