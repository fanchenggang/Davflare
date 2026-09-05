import {
  KEYS_PREFIX,
  StoredApiKey,
  jsonResponse,
  listStoredKeys,
  sha256Hex,
  textResponse,
  verifyBasicAuth,
} from "./_apikey";

interface KeysEnv {
  BUCKET: R2Bucket;
  WEBDAV_USERNAME: string;
  WEBDAV_PASSWORD: string;
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

async function listKeysSorted(bucket: R2Bucket): Promise<StoredApiKey[]> {
  const records = await listStoredKeys(bucket);
  records.sort((a, b) =>
    String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
  );
  return records;
}

export const onRequestGet: PagesFunction<KeysEnv> = async (context) => {
  const { request, env } = context;
  if (!verifyBasicAuth(request, env.WEBDAV_USERNAME, env.WEBDAV_PASSWORD)) {
    return textResponse("Unauthorized", 401);
  }
  const keys = await listKeysSorted(env.BUCKET);
  return jsonResponse(keys.map(publicKey));
};

export const onRequestPost: PagesFunction<KeysEnv> = async (context) => {
  const { request, env } = context;
  if (!verifyBasicAuth(request, env.WEBDAV_USERNAME, env.WEBDAV_PASSWORD)) {
    return textResponse("Unauthorized", 401);
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
  if (!verifyBasicAuth(request, env.WEBDAV_USERNAME, env.WEBDAV_PASSWORD)) {
    return textResponse("Unauthorized", 401);
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return new Response("Bad Request", { status: 400 });
  await env.BUCKET.delete(`${KEYS_PREFIX}${id}.json`);
  return new Response(null, { status: 204 });
};
