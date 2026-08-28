import {
  authorizeApiKey,
  decodeRawPath,
  isCollectionObject,
  isInternalKey,
  splitSafeParts,
  textResponse,
  touchLastUsed,
} from "./_apikey";

interface DownloadEnv {
  BUCKET: R2Bucket;
}

function basename(key: string) {
  const name = key.split("/").filter(Boolean).pop() || "download";
  return name.replace(/[\u0000-\u001f]/g, "");
}

function attachmentDisposition(filename: string) {
  const fallback = filename.replace(/["\\\r\n]/g, "_") || "download";
  const encoded = encodeURIComponent(filename || "download").replace(
    /['()]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function normalizeObjectKey(raw: string | null): string | Response {
  const decoded = decodeRawPath(raw);
  if (!decoded) {
    return textResponse("缺少 path 参数", 400);
  }
  const parts = splitSafeParts(decoded);
  if (parts instanceof Response) return parts;
  if (parts.length === 0) {
    return textResponse("缺少 path 参数", 400);
  }
  const key = parts.join("/");
  if (isInternalKey(key)) {
    return textResponse("禁止访问内部目录", 400);
  }
  if (decoded.endsWith("/")) {
    return textResponse("不能下载目录，请逐个文件下载", 400);
  }
  return key;
}

async function isPrefixOnlyFolder(bucket: R2Bucket, key: string) {
  const listing = await bucket.list({
    prefix: `${key}/`,
    limit: 1,
  });
  const prefixes = (listing as { delimitedPrefixes?: string[] }).delimitedPrefixes;
  return listing.objects.length > 0 || (prefixes && prefixes.length > 0);
}

export const onRequestGet: PagesFunction<DownloadEnv> = async (context) => {
  const { request, env } = context;
  const auth = await authorizeApiKey(request, env.BUCKET);
  if (auth instanceof Response) return auth;

  const key = normalizeObjectKey(new URL(request.url).searchParams.get("path"));
  if (key instanceof Response) return key;

  const object = await env.BUCKET.get(key);
  if (object === null) {
    if (await isPrefixOnlyFolder(env.BUCKET, key)) {
      return textResponse("不能下载目录，请逐个文件下载", 400);
    }
    return textResponse("文件不存在", 404);
  }
  if (isCollectionObject(object)) {
    return textResponse("不能下载目录，请逐个文件下载", 400);
  }
  if (!("body" in object) || object.body === null) {
    return textResponse("文件不存在", 404);
  }

  await touchLastUsed(env.BUCKET, auth);

  const headers = new Headers();
  const contentType =
    object.httpMetadata?.contentType || "application/octet-stream";
  headers.set("Content-Type", contentType);
  headers.set("Content-Disposition", attachmentDisposition(basename(key)));
  if (Number.isFinite(object.size)) {
    headers.set("Content-Length", String(object.size));
  }
  headers.set("Cache-Control", "no-store");
  if (object.httpEtag) headers.set("ETag", object.httpEtag);
  if (object.uploaded) {
    headers.set("Last-Modified", object.uploaded.toUTCString());
  }

  return new Response(object.body, { status: 200, headers });
};
