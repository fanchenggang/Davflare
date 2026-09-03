import { loadFeatureFlags } from "../_flags";

export const KEYS_PREFIX = "_$flaredrive$/apikeys/";
export const INTERNAL_PREFIX = "_$flaredrive$/";

export interface StoredApiKey {
  id: string;
  name: string;
  prefix: string;
  keyHash: string;
  createdAt: string;
  expiresAt: string | null;
  createdBy?: string;
  lastUsedAt?: string | null;
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export function textResponse(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
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

/** True when the caller presented Bearer / X-Api-Key (not a Basic session). */
export function hasApiKeyHeader(request: Request): boolean {
  return Boolean(extractApiKey(request));
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// UTF-8 安全 Base64：btoa 只接受 Latin-1，非 ASCII 用户名/密码会抛异常。
// TextEncoder 输出 UTF-8 bytes 后按字节转 binary string。
export function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// Basic 认证统一入口：常数时间比较整个 Authorization 头，
// 各端点不要再用 `===` 明文比对凭据。
export function verifyBasicAuth(
  request: Request,
  username: string,
  password: string
): boolean {
  // fail closed：凭据未配置或为空时一律拒绝，避免 btoa("undefined:undefined")/
  // btoa(":") 这类固定值成为可被猜中的有效 Basic 头。
  if (!username || !password) return false;
  const authorization = request.headers.get("Authorization") || "";
  const expected = `Basic ${utf8ToBase64(`${username}:${password}`)}`;
  return timingSafeEqual(authorization, expected);
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

export async function authorizeApiKey(
  request: Request,
  bucket: R2Bucket
): Promise<StoredApiKey | Response> {
  const flags = await loadFeatureFlags(bucket);
  if (!flags.apiKey) {
    return textResponse("API 密钥已关闭", 401);
  }
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

export async function touchLastUsed(bucket: R2Bucket, record: StoredApiKey) {
  try {
    const next = { ...record, lastUsedAt: new Date().toISOString() };
    await bucket.put(`${KEYS_PREFIX}${record.id}.json`, JSON.stringify(next), {
      httpMetadata: { contentType: "application/json" },
    });
  } catch {
    // last-used is best-effort
  }
}

export function isInternalKey(key: string) {
  return key.startsWith(INTERNAL_PREFIX) || key.includes("/_$flaredrive$/");
}

export function isCollectionObject(
  object: { httpMetadata?: R2HTTPMetadata; customMetadata?: Record<string, string> } | null
) {
  if (!object) return false;
  return (
    object.customMetadata?.resourcetype === "<collection />" ||
    object.httpMetadata?.contentType === "application/x-directory"
  );
}

export function decodeRawPath(raw: string | null): string {
  let path = (raw || "").trim();
  try {
    path = decodeURIComponent(path);
  } catch {
    // keep raw
  }
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

export function splitSafeParts(path: string): string[] | Response {
  const parts = path.split("/").filter((part) => part && part !== ".");
  if (parts.some((part) => part === "..")) {
    return textResponse("路径不合法", 400);
  }
  return parts;
}

export function isTruthyParam(raw: unknown): boolean {
  if (raw === true || raw === 1) return true;
  if (typeof raw !== "string") return false;
  const value = raw.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function normalizeFileKey(raw: string | null): string | Response {
  const decoded = decodeRawPath(raw);
  if (!decoded) return textResponse("缺少 path 参数", 400);
  const parts = splitSafeParts(decoded);
  if (parts instanceof Response) return parts;
  if (parts.length === 0) return textResponse("缺少 path 参数", 400);
  const key = parts.join("/");
  if (isInternalKey(key)) return textResponse("禁止访问内部目录", 400);
  if (decoded.endsWith("/")) return textResponse("不能操作目录", 400);
  return key;
}

// 目录键：允许结尾斜杠（自动剥掉），文件与目录通用
export function normalizeDirKey(raw: string | null): string | Response {
  const decoded = decodeRawPath(raw);
  if (!decoded) return textResponse("缺少 path 参数", 400);
  const parts = splitSafeParts(decoded);
  if (parts instanceof Response) return parts;
  if (parts.length === 0) return textResponse("缺少 path 参数", 400);
  const key = parts.join("/");
  if (isInternalKey(key)) return textResponse("禁止访问内部目录", 400);
  return key;
}

// 目录递归操作的单次对象数上限，超出时要求调用方分批
export const MAX_DIR_OBJECTS = 1000;

export interface DirDescendants {
  objects: R2Object[];
}

// 列出目录下全部后代对象（不含目录标记本身），超过上限返回 400
export async function listDescendants(
  bucket: R2Bucket,
  dirKey: string,
  limit = MAX_DIR_OBJECTS
): Promise<DirDescendants | Response> {
  const objects: R2Object[] = [];
  let cursor: string | undefined;
  do {
    const listing = await bucket.list({
      prefix: `${dirKey}/`,
      cursor,
      // @ts-ignore `include` is supported by R2 but missing from this types version.
      include: ["httpMetadata", "customMetadata"],
    });
    for (const object of listing.objects) {
      if (isInternalKey(object.key)) continue;
      objects.push(object);
      if (objects.length > limit) {
        return textResponse(`目录包含超过 ${limit} 个对象，请分批处理`, 400);
      }
    }
    if (!listing.truncated) break;
    cursor = listing.cursor;
  } while (true);
  return { objects };
}

// 判断 key 是「目录」：有目录标记，或是只有前缀的虚拟目录
export async function resolveAsDirectory(
  bucket: R2Bucket,
  key: string
): Promise<boolean> {
  const head = await bucket.head(key);
  if (head !== null) return isCollectionObject(head);
  return isPrefixOnlyFolder(bucket, key);
}

// 目录整体移动：先复制后代到新前缀，再删源，最后搬目录标记
export async function moveDirectory(
  bucket: R2Bucket,
  from: string,
  to: string
): Promise<Response | null> {
  const descendants = await listDescendants(bucket, from);
  if (descendants instanceof Response) return descendants;

  for (const object of descendants.objects) {
    const target = `${to}/${object.key.slice(from.length + 1)}`;
    const body = await bucket.get(object.key);
    if (body === null) continue;
    await bucket.put(target, body.body, {
      httpMetadata: body.httpMetadata,
      customMetadata: body.customMetadata,
    });
  }
  for (const object of descendants.objects) {
    await bucket.delete(object.key);
  }

  const marker = await bucket.get(from);
  if (marker !== null) {
    await bucket.put(to, marker.body, {
      httpMetadata: marker.httpMetadata,
      customMetadata: marker.customMetadata,
    });
    await bucket.delete(from);
  } else {
    await bucket.put(to, new Uint8Array(), {
      httpMetadata: { contentType: "application/x-directory" },
      customMetadata: { resourcetype: "<collection />" },
    });
  }
  return null;
}

// 目录整体删除（递归硬删）：先删后代，再删目录标记
export async function deleteDirectory(
  bucket: R2Bucket,
  dirKey: string
): Promise<Response | null> {
  const descendants = await listDescendants(bucket, dirKey);
  if (descendants instanceof Response) return descendants;
  for (const object of descendants.objects) {
    await bucket.delete(object.key);
  }
  await bucket.delete(dirKey);
  return null;
}

export function splitNameExt(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return { stem: name, ext: "" };
  return { stem: name.slice(0, dot), ext: name.slice(dot) };
}

export function formatConflictStamp(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${d}T${hh}${mm}${ss}`;
}

export function conflictBackupKey(fromKey: string, date = new Date()): string {
  const slash = fromKey.lastIndexOf("/");
  const folder = slash >= 0 ? fromKey.slice(0, slash + 1) : "";
  const name = slash >= 0 ? fromKey.slice(slash + 1) : fromKey;
  const { stem, ext } = splitNameExt(name);
  return `${folder}${stem}.conflict-${formatConflictStamp(date)}${ext}`;
}

export async function isPrefixOnlyFolder(
  bucket: R2Bucket,
  key: string
): Promise<boolean> {
  const listing = await bucket.list({
    prefix: `${key}/`,
    limit: 1,
  });
  const prefixes = (listing as { delimitedPrefixes?: string[] }).delimitedPrefixes;
  return listing.objects.length > 0 || Boolean(prefixes && prefixes.length > 0);
}

export async function ensureFolderMarkers(bucket: R2Bucket, folder: string) {
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

/**
 * 拷贝单个对象（保留 httpMetadata/customMetadata）。
 * 目录与源不存在返回错误 Response；成功返回 null。
 * 默认目标已存在时 409（move 语义传 overwrite: true 保持原行为）。
 */
export async function copyObject(
  bucket: R2Bucket,
  from: string,
  to: string,
  options?: { overwrite?: boolean }
): Promise<Response | null> {
  if (!options?.overwrite) {
    const dest = await bucket.head(to);
    if (dest !== null) {
      return textResponse("目标已存在", 409);
    }
  }
  const source = await bucket.get(from);
  if (source === null) return textResponse("文件不存在", 404);
  if (isCollectionObject(source)) {
    return textResponse("只能操作文件，不能操作目录", 400);
  }
  await bucket.put(to, source.body, {
    httpMetadata: source.httpMetadata,
    customMetadata: source.customMetadata,
  });
  return null;
}

export async function copyThenDelete(
  bucket: R2Bucket,
  from: string,
  to: string
): Promise<Response | null> {
  const error = await copyObject(bucket, from, to, { overwrite: true });
  if (error) return error;
  await bucket.delete(from);
  return null;
}
