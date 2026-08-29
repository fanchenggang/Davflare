import { isCollectionObject, isTruthyParam } from "./_apikey";

interface UploadEnv {
  BUCKET: R2Bucket;
}

const KEYS_PREFIX = "_$flaredrive$/apikeys/";
const INTERNAL_PREFIX = "_$flaredrive$/";
const MAX_BYTES = 100 * 1024 * 1024;
const MULTIPART_PART_MAX = 10000;

interface StoredApiKey {
  id: string;
  name: string;
  prefix: string;
  keyHash: string;
  createdAt: string;
  expiresAt: string | null;
  createdBy?: string;
  lastUsedAt?: string | null;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function textResponse(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function tooLarge() {
  return textResponse(
    "单次上传超过 Cloudflare Workers 约 100MB 的请求限制。更大的文件请改用网页端分块上传。",
    413
  );
}

function extractApiKey(request: Request): string {
  const xKey = (request.headers.get("X-Api-Key") || "").trim();
  if (xKey) return xKey;
  const authorization = request.headers.get("Authorization") || "";
  if (authorization.startsWith("Bearer ")) {
    return authorization.slice(7).trim();
  }
  return "";
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function isExpired(expiresAt: string | null | undefined) {
  if (!expiresAt) return false;
  const ts = Date.parse(expiresAt);
  return Number.isFinite(ts) && ts <= Date.now();
}

async function listStoredKeys(bucket: R2Bucket): Promise<StoredApiKey[]> {
  const records: StoredApiKey[] = [];
  let cursor: string | undefined;
  do {
    const listing = await bucket.list({
      prefix: KEYS_PREFIX,
      cursor,
    });
    for (const object of listing.objects) {
      if (!object.key.endsWith(".json")) continue;
      const data = await bucket.get(object.key);
      if (data === null) continue;
      try {
        records.push((await data.json()) as StoredApiKey);
      } catch {
        // skip corrupt metadata
      }
    }
    if (!listing.truncated) break;
    cursor = listing.cursor;
  } while (true);
  return records;
}

async function authorizeApiKey(
  request: Request,
  bucket: R2Bucket
): Promise<StoredApiKey | Response> {
  const rawKey = extractApiKey(request);
  if (!rawKey) {
    return textResponse("缺少 API 密钥", 401);
  }
  const incomingHash = await sha256Hex(rawKey);
  const records = await listStoredKeys(bucket);
  let matched: StoredApiKey | null = null;
  for (const record of records) {
    if (record.keyHash && timingSafeEqual(record.keyHash, incomingHash)) {
      matched = record;
      break;
    }
  }
  if (!matched) {
    return textResponse("无效的 API 密钥", 401);
  }
  if (isExpired(matched.expiresAt)) {
    return textResponse("API 密钥已过期", 401);
  }
  return matched;
}

function normalizeFolder(raw: string | null): string | Response {
  let path = (raw || "").trim();
  try {
    path = decodeURIComponent(path);
  } catch {
    // keep raw
  }
  path = path.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!path) return "";
  const parts = path.split("/").filter((part) => part && part !== ".");
  if (parts.some((part) => part === "..")) {
    return textResponse("路径不合法", 400);
  }
  const joined = parts.join("/");
  if (joined.startsWith(INTERNAL_PREFIX) || joined.includes("/_$flaredrive$/")) {
    return textResponse("禁止写入内部目录", 400);
  }
  return `${joined}/`;
}

function sanitizeFileName(name: string) {
  const cleaned = name.replace(/\\/g, "/").split("/").pop() || "";
  return cleaned.replace(/[\u0000-\u001f]/g, "").trim();
}

function uniqueName(name: string, taken: Set<string>) {
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let index = 2;
  while (taken.has(`${stem} (${index})${ext}`)) index++;
  return `${stem} (${index})${ext}`;
}

async function listTakenNames(bucket: R2Bucket, folder: string) {
  const taken = new Set<string>();
  let cursor: string | undefined;
  do {
    const listing = await bucket.list({
      prefix: folder,
      delimiter: "/",
      cursor,
    });
    for (const object of listing.objects) {
      const name = object.key.slice(folder.length);
      if (name && !name.includes("/")) taken.add(name);
    }
    const prefixes = (listing as { delimitedPrefixes?: string[] })
      .delimitedPrefixes;
    if (prefixes) {
      for (const prefix of prefixes) {
        const name = prefix.slice(folder.length).replace(/\/$/, "");
        if (name) taken.add(name);
      }
    }
    if (!listing.truncated) break;
    cursor = listing.cursor;
  } while (true);
  return taken;
}

async function ensureFolders(bucket: R2Bucket, folder: string) {
  if (!folder) return;
  const parts = folder.replace(/\/$/, "").split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    const head = await bucket.head(current);
    if (head === null) {
      await bucket.put(current, new Uint8Array(), {
        httpMetadata: { contentType: "application/x-directory" },
        customMetadata: { resourcetype: "<collection />" },
      });
    }
  }
}

async function touchLastUsed(bucket: R2Bucket, record: StoredApiKey) {
  try {
    const next = { ...record, lastUsedAt: new Date().toISOString() };
    await bucket.put(`${KEYS_PREFIX}${record.id}.json`, JSON.stringify(next), {
      httpMetadata: { contentType: "application/json" },
    });
  } catch {
    // last-used is best-effort; do not fail the upload
  }
}

async function readUpload(
  request: Request
): Promise<{ name: string; body: ArrayBuffer; contentType: string } | Response> {
  const contentLength = Number(request.headers.get("Content-Length") || "0");
  if (Number.isFinite(contentLength) && contentLength >= MAX_BYTES) {
    return tooLarge();
  }

  const contentType = request.headers.get("Content-Type") || "";
  if (contentType.toLowerCase().includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return textResponse("无法解析上传内容", 400);
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      return textResponse("请使用 multipart 字段 file 上传文件", 400);
    }
    if (file.size >= MAX_BYTES) return tooLarge();
    const name = sanitizeFileName(file.name);
    if (!name) return textResponse("文件名无效", 400);
    return {
      name,
      body: await file.arrayBuffer(),
      contentType: file.type || "application/octet-stream",
    };
  }

  const name = sanitizeFileName(request.headers.get("X-File-Name") || "");
  if (!name) {
    return textResponse("原始请求体上传需要提供 X-File-Name 头", 400);
  }
  const body = await request.arrayBuffer();
  if (body.byteLength >= MAX_BYTES) return tooLarge();
  if (body.byteLength === 0) return textResponse("文件内容为空", 400);
  return {
    name,
    body,
    contentType: contentType || "application/octet-stream",
  };
}

// 分块上传：path 为完整文件键（目录/文件名）
function multipartFileKey(raw: string | null): string | Response {
  let path = (raw || "").trim();
  try {
    path = decodeURIComponent(path);
  } catch {
    // keep raw
  }
  if (!path) return textResponse("分块上传需要 path 指向完整文件键", 400);
  const parts = path
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== ".");
  if (parts.some((part) => part === "..")) {
    return textResponse("路径不合法", 400);
  }
  const key = parts.join("/");
  if (!key) return textResponse("分块上传需要 path 指向完整文件键", 400);
  if (key.startsWith(INTERNAL_PREFIX) || key.includes("/_$flaredrive$/")) {
    return textResponse("禁止写入内部目录", 400);
  }
  return key;
}

function parsePartNumber(raw: string | null): number | Response {
  if (!raw || !/^\d+$/.test(raw)) {
    return textResponse("partNumber 不合法", 400);
  }
  const partNumber = parseInt(raw, 10);
  if (partNumber < 1 || partNumber > MULTIPART_PART_MAX) {
    return textResponse(`partNumber 需在 1-${MULTIPART_PART_MAX}`, 400);
  }
  return partNumber;
}

export const onRequestPost: PagesFunction<UploadEnv> = async (context) => {
  const { request, env } = context;
  const auth = await authorizeApiKey(request, env.BUCKET);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);

  // —— 分块上传 ①：创建（POST /api/upload?uploads&path=<文件键>）——
  if (url.searchParams.has("uploads")) {
    const key = multipartFileKey(url.searchParams.get("path"));
    if (key instanceof Response) return key;
    const slash = key.lastIndexOf("/");
    if (slash > 0) await ensureFolders(env.BUCKET, key.slice(0, slash + 1));
    const contentType = request.headers.get("Content-Type") || "";
    const multipart = await env.BUCKET.createMultipartUpload(key, {
      httpMetadata: {
        contentType: contentType || "application/octet-stream",
      },
    });
    await touchLastUsed(env.BUCKET, auth);
    return jsonResponse(
      { key: multipart.key, uploadId: multipart.uploadId },
      201
    );
  }

  // —— 分块上传 ③：完成（POST /api/upload?path=&uploadId=，body { parts }）——
  const completeUploadId = url.searchParams.get("uploadId");
  if (completeUploadId) {
    const key = multipartFileKey(url.searchParams.get("path"));
    if (key instanceof Response) return key;
    let body: { parts?: Array<{ partNumber?: unknown; etag?: unknown }> };
    try {
      body = await request.json();
    } catch {
      return textResponse("无法解析 JSON", 400);
    }
    const parts = (body.parts || []).map((part) => ({
      partNumber: Number(part.partNumber),
      etag: String(part.etag ?? ""),
    }));
    const invalid =
      parts.length === 0 ||
      parts.length > MULTIPART_PART_MAX ||
      parts.some(
        (part) =>
          !Number.isInteger(part.partNumber) ||
          part.partNumber < 1 ||
          part.partNumber > MULTIPART_PART_MAX ||
          !part.etag
      );
    if (invalid) {
      return textResponse("parts 参数不合法", 400);
    }
    try {
      const multipart = env.BUCKET.resumeMultipartUpload(key, completeUploadId);
      const object = await multipart.complete(parts);
      await touchLastUsed(env.BUCKET, auth);
      return jsonResponse({
        key: object.key,
        size: object.size,
        etag: (object as { httpEtag?: string }).httpEtag ?? "",
      });
    } catch (error) {
      return textResponse((error as Error)?.message || "完成分块上传失败", 400);
    }
  }

  const folder = normalizeFolder(url.searchParams.get("path"));
  if (folder instanceof Response) return folder;

  const upload = await readUpload(request);
  if (upload instanceof Response) return upload;
  if (upload.body.byteLength >= MAX_BYTES) return tooLarge();

  const overwrite = isTruthyParam(url.searchParams.get("overwrite"));

  await ensureFolders(env.BUCKET, folder);
  let fileName = upload.name;
  let overwritten = false;
  if (overwrite) {
    const existing = await env.BUCKET.head(`${folder}${fileName}`);
    if (existing && isCollectionObject(existing)) {
      return textResponse("目标已存在且为目录，无法覆盖", 409);
    }
    if (existing) overwritten = true;
    else {
      const listing = await env.BUCKET.list({
        prefix: `${folder}${fileName}/`,
        limit: 1,
      });
      if (listing.objects.length > 0) {
        return textResponse("目标已存在且为目录，无法覆盖", 409);
      }
    }
  } else {
    const taken = await listTakenNames(env.BUCKET, folder);
    fileName = uniqueName(upload.name, taken);
  }
  const key = `${folder}${fileName}`;
  if (key.startsWith(INTERNAL_PREFIX)) {
    return textResponse("禁止写入内部目录", 400);
  }

  await env.BUCKET.put(key, upload.body, {
    httpMetadata: { contentType: upload.contentType },
  });
  await touchLastUsed(env.BUCKET, auth);

  return jsonResponse(
    {
      key,
      name: fileName,
      size: upload.body.byteLength,
      path: folder || "/",
      overwritten,
    },
    201
  );
};

// —— 分块上传 ②：上传分块（PUT /api/upload?path=&uploadId=&partNumber=，原始请求体）——
export const onRequestPut: PagesFunction<UploadEnv> = async (context) => {
  const { request, env } = context;
  const auth = await authorizeApiKey(request, env.BUCKET);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const key = multipartFileKey(url.searchParams.get("path"));
  if (key instanceof Response) return key;
  const uploadId = url.searchParams.get("uploadId");
  if (!uploadId) return textResponse("缺少 uploadId", 400);
  const partNumber = parsePartNumber(url.searchParams.get("partNumber"));
  if (partNumber instanceof Response) return partNumber;
  if (!request.body) return textResponse("缺少分块内容", 400);

  try {
    const multipart = env.BUCKET.resumeMultipartUpload(key, uploadId);
    const part = await multipart.uploadPart(partNumber, request.body);
    await touchLastUsed(env.BUCKET, auth);
    return jsonResponse({ partNumber: part.partNumber, etag: part.etag });
  } catch (error) {
    return textResponse((error as Error)?.message || "上传分块失败", 400);
  }
};

// —— 分块上传 ④：放弃（DELETE /api/upload?path=&uploadId=）——
export const onRequestDelete: PagesFunction<UploadEnv> = async (context) => {
  const { request, env } = context;
  const auth = await authorizeApiKey(request, env.BUCKET);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const key = multipartFileKey(url.searchParams.get("path"));
  if (key instanceof Response) return key;
  const uploadId = url.searchParams.get("uploadId");
  if (!uploadId) return textResponse("缺少 uploadId", 400);

  try {
    const multipart = env.BUCKET.resumeMultipartUpload(key, uploadId);
    await multipart.abort();
  } catch {
    // 未知的 uploadId 视为已失效，幂等返回
  }
  await touchLastUsed(env.BUCKET, auth);
  return new Response(null, { status: 204 });
};
