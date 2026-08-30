interface ShareEnv {
  BUCKET: R2Bucket;
}

import { buildZipStream } from "../api/_zip";

const SHARES_PREFIX = "_$flaredrive$/shares/";

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

function tokenFromParams(params: Record<string, unknown>): string | null {
  const token = params.token;
  if (typeof token === "string") return token;
  if (Array.isArray(token)) return token[0] || null;
  return null;
}

function extractForm(error?: string) {
  const message = error
    ? `<p class="err">${error}</p>`
    : "<p>请输入提取码后查看文件</p>";
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>提取文件</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
      background: #f4f1ec; color: #1a1714; min-height: 100vh; display: flex;
      align-items: center; justify-content: center; }
    .card { background: #fff; border-radius: 16px; padding: 28px 24px; width: min(92vw, 360px);
      box-shadow: 0 8px 24px rgba(26,23,20,.08); }
    h1 { font-size: 1.15rem; margin: 0 0 8px; }
    p { color: rgba(26,23,20,.64); font-size: .9rem; margin: 0 0 16px; }
    .err { color: #c4472c; }
    input { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 8px;
      border: 1px solid rgba(28,22,16,.16); font-size: 1rem; margin-bottom: 12px; }
    button { width: 100%; border: 0; border-radius: 8px; padding: 10px 12px;
      background: #f38020; color: #fff; font-weight: 600; font-size: 1rem; cursor: pointer; }
  </style>
</head>
<body>
  <form class="card" method="GET">
    <h1>提取文件</h1>
    ${message}
    <input name="code" type="text" maxlength="32" autocomplete="off" placeholder="提取码" autofocus />
    <button type="submit">提取</button>
  </form>
</body>
</html>`;
  return new Response(html, {
    status: error ? 403 : 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

type ShareMeta = {
  key?: string;
  isDir?: boolean;
  expiresAt?: string | null;
  extractCode?: string;
};

async function loadMeta(bucket: R2Bucket, token: string): Promise<ShareMeta | null> {
  const metadataObject = await bucket.get(`${SHARES_PREFIX}${token}.json`);
  if (metadataObject === null) return null;
  return (await metadataObject.json()) as ShareMeta;
}

function gateExtractCode(request: Request, metadata: ShareMeta) {
  const required = String(metadata.extractCode || "").trim();
  if (!required) return null;
  const provided = new URL(request.url).searchParams.get("code") || "";
  if (provided === required) return null;
  return extractForm(provided ? "提取码不正确" : undefined);
}

export const onRequestGet: PagesFunction<ShareEnv> = async (context) => {
  const { request, env, params } = context;
  const token = tokenFromParams(params);
  if (!token) return new Response("Not found", { status: 404 });

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

  const gated = gateExtractCode(request, metadata);
  if (gated) return gated;

  const encodedName = encodeURIComponent(
    metadata.key.split("/").pop() || "download"
  );

  // 目录分享：提取码校验后打包整树为 zip 流下载（条目相对分享目录）
  if (metadata.isDir) {
    const stream = await buildZipStream(env.BUCKET, [metadata.key], {
      stripPrefix: metadata.key,
    });
    const headers = new Headers();
    headers.set("Content-Type", "application/zip");
    headers.set("Cache-Control", "no-store");
    applyShareHardening(headers);
    headers.set(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodedName}.zip`
    );
    return new Response(stream, { headers });
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
  const disposition = inlineContentType(contentType) ? "inline" : "attachment";
  headers.set(
    "Content-Disposition",
    `${disposition}; filename*=UTF-8''${encodedName}`
  );

  return new Response(object.body, { headers });
};

export const onRequestHead: PagesFunction<ShareEnv> = async (context) => {
  const { request, env, params } = context;
  const token = tokenFromParams(params);
  if (!token) return new Response(null, { status: 404 });

  const metadata = await loadMeta(env.BUCKET, token);
  if (metadata === null || !metadata.key) return new Response(null, { status: 404 });
  if (
    metadata.expiresAt &&
    new Date(metadata.expiresAt).getTime() <= Date.now()
  ) {
    return new Response(null, { status: 410 });
  }
  if (gateExtractCode(request, metadata)) return new Response(null, { status: 403 });

  // 与 GET 对齐：目录分享（含无 marker 的虚拟目录）下载的是 zip 流，无固定长度
  if (metadata.isDir) {
    return new Response(null, {
      headers: {
        "Content-Type": "application/zip",
        "Cache-Control": "no-store",
      },
    });
  }

  const object = await env.BUCKET.head(metadata.key);
  if (object === null) return new Response(null, { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  return new Response(null, { headers });
};
