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

export async function authorizeApiKey(
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
