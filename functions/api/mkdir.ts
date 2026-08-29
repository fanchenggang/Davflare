import {
  authorizeApiKey,
  decodeRawPath,
  ensureFolderMarkers,
  isCollectionObject,
  isInternalKey,
  isPrefixOnlyFolder,
  jsonResponse,
  splitSafeParts,
  textResponse,
  touchLastUsed,
} from "./_apikey";

interface MkdirEnv {
  BUCKET: R2Bucket;
}

interface MkdirBody {
  path?: string;
}

function normalizeDirKey(raw: string | null): string | Response {
  const decoded = decodeRawPath(raw);
  if (!decoded) return textResponse("缺少 path 参数", 400);
  const parts = splitSafeParts(decoded);
  if (parts instanceof Response) return parts;
  if (parts.length === 0) return textResponse("缺少 path 参数", 400);
  const key = parts.join("/");
  if (isInternalKey(key)) return textResponse("禁止访问内部目录", 400);
  return key;
}

export const onRequestPost: PagesFunction<MkdirEnv> = async (context) => {
  const { request, env } = context;
  const auth = await authorizeApiKey(request, env.BUCKET);
  if (auth instanceof Response) return auth;

  let rawPath: string | null = context.request.headers.get("X-File-Path");
  if (!rawPath && request.headers.get("Content-Type")?.includes("application/json")) {
    try {
      const body = (await request.json()) as MkdirBody;
      rawPath = typeof body?.path === "string" ? body.path : null;
    } catch {
      rawPath = null;
    }
  }
  if (!rawPath) {
    const url = new URL(request.url);
    rawPath = url.searchParams.get("path");
  }

  const key = normalizeDirKey(rawPath);
  if (key instanceof Response) return key;

  const existing = await env.BUCKET.head(key);
  if (existing !== null) {
    if (isCollectionObject(existing)) {
      await touchLastUsed(env.BUCKET, auth);
      return jsonResponse({ key, created: false, existed: "directory" }, 200);
    }
    return textResponse("同名文件已存在，无法创建目录", 409);
  }

  if (await isPrefixOnlyFolder(env.BUCKET, key)) {
    await touchLastUsed(env.BUCKET, auth);
    return jsonResponse({ key, created: false, existed: "prefix" }, 200);
  }

  const slash = key.lastIndexOf("/");
  await ensureFolderMarkers(env.BUCKET, slash >= 0 ? key.slice(0, slash) : "");
  await env.BUCKET.put(key, new Uint8Array(), {
    httpMetadata: { contentType: "application/x-directory" },
    customMetadata: { resourcetype: "<collection />" },
  });
  await touchLastUsed(env.BUCKET, auth);

  return jsonResponse({ key, created: true }, 201);
};
