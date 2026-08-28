interface KeysEnv {
  BUCKET: R2Bucket;
  WEBDAV_USERNAME: string;
  WEBDAV_PASSWORD: string;
}

const KEYS_PREFIX = "_$flaredrive$/apikeys/";

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

function isAuthorized(request: Request, env: KeysEnv) {
  const authorization = request.headers.get("Authorization");
  const expected = `Basic ${btoa(
    `${env.WEBDAV_USERNAME}:${env.WEBDAV_PASSWORD}`
  )}`;
  return Boolean(authorization && authorization === expected);
}

function usernameFromBasic(request: Request): string {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Basic ")) return "";
  try {
    const decoded = atob(authorization.slice(6));
    const colon = decoded.indexOf(":");
    return colon >= 0 ? decoded.slice(0, colon) : decoded;
  } catch {
    return "";
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function createId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().replace(/-/g, "")
    : `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
}

function generateApiKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `fd_${hex}`;
}

function keyPrefix(key: string) {
  return key.slice(0, Math.min(8, key.length));
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

function publicKey(record: StoredApiKey) {
  return {
    id: record.id,
    name: record.name,
    prefix: record.prefix,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    createdBy: record.createdBy || null,
    lastUsedAt: record.lastUsedAt || null,
  };
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
  records.sort((a, b) =>
    String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
  );
  return records;
}

export const onRequestGet: PagesFunction<KeysEnv> = async (context) => {
  const { request, env } = context;
  if (!isAuthorized(request, env)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const keys = await listStoredKeys(env.BUCKET);
  return jsonResponse(keys.map(publicKey));
};

export const onRequestPost: PagesFunction<KeysEnv> = async (context) => {
  const { request, env } = context;
  if (!isAuthorized(request, env)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: { name?: string; expiresInHours?: number | null; key?: string };
  try {
    body = await request.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const name = String(body.name || "").trim().slice(0, 64);
  if (!name) {
    return new Response("请填写密钥名称", { status: 400 });
  }

  let rawKey = String(body.key || "").trim();
  if (rawKey) {
    if (/\s/.test(rawKey) || rawKey.length < 8 || rawKey.length > 256) {
      return new Response("自定义密钥需为 8–256 位且不含空白", { status: 400 });
    }
  } else {
    rawKey = generateApiKey();
  }

  const expiresInHours = Number(body.expiresInHours);
  const expiresAt =
    Number.isFinite(expiresInHours) && expiresInHours > 0
      ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString()
      : null;

  const id = createId();
  const createdAt = new Date().toISOString();
  const record: StoredApiKey = {
    id,
    name,
    prefix: keyPrefix(rawKey),
    keyHash: await sha256Hex(rawKey),
    createdAt,
    expiresAt,
    createdBy: usernameFromBasic(request) || env.WEBDAV_USERNAME || "",
    lastUsedAt: null,
  };

  await env.BUCKET.put(
    `${KEYS_PREFIX}${id}.json`,
    JSON.stringify(record),
    { httpMetadata: { contentType: "application/json" } }
  );

  return jsonResponse({
    ...publicKey(record),
    key: rawKey,
  });
};

export const onRequestDelete: PagesFunction<KeysEnv> = async (context) => {
  const { request, env } = context;
  if (!isAuthorized(request, env)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return new Response("Bad Request", { status: 400 });
  await env.BUCKET.delete(`${KEYS_PREFIX}${id}.json`);
  return new Response(null, { status: 204 });
};
