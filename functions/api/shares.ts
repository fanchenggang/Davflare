import { isCollectionObject } from "./_apikey";

interface SharesEnv {
  BUCKET: R2Bucket;
  WEBDAV_USERNAME: string;
  WEBDAV_PASSWORD: string;
}

const SHARES_PREFIX = "_$flaredrive$/shares/";

function isAuthorized(request: Request, env: SharesEnv) {
  const authorization = request.headers.get("Authorization");
  const expected = `Basic ${btoa(
    `${env.WEBDAV_USERNAME}:${env.WEBDAV_PASSWORD}`
  )}`;
  return Boolean(authorization && authorization === expected);
}

function basename(key: string) {
  return key.replace(/\/$/, "").split("/").pop() ?? "";
}

async function readShares(
  bucket: R2Bucket,
  request: Request
): Promise<Array<Record<string, unknown>>> {
  const shares: Array<Record<string, unknown>> = [];
  let cursor: string | undefined;

  do {
    const listing = await bucket.list({
      prefix: SHARES_PREFIX,
      cursor,
    });
    for (const object of listing.objects) {
      if (!object.key.endsWith(".json")) continue;
      const data = await bucket.get(object.key);
      if (data === null) continue;
      const parsed = (await data.json()) as Record<string, unknown>;
      const token = object.key
        .slice(SHARES_PREFIX.length)
        .replace(/\.json$/, "");
      const extractCode = typeof parsed.extractCode === "string" ? parsed.extractCode : "";
      shares.push({
        token,
        key: parsed.key,
        name: parsed.name || basename(String(parsed.key || "")),
        expiresAt: parsed.expiresAt || null,
        createdAt: parsed.createdAt,
        url: `${new URL(request.url).origin}/share/${token}`,
        extractCode: extractCode || null,
        hasExtractCode: Boolean(extractCode),
        isDir: Boolean(parsed.isDir),
      });
    }
    if (!listing.truncated) break;
    cursor = listing.cursor;
  } while (true);

  return shares;
}

export const onRequestGet: PagesFunction<SharesEnv> = async (context) => {
  const { request, env } = context;
  if (!isAuthorized(request, env)) {
    return new Response("Unauthorized", { status: 401 });
  }
  return new Response(JSON.stringify(await readShares(env.BUCKET, request)), {
    headers: { "Content-Type": "application/json" },
  });
};

export const onRequestPost: PagesFunction<SharesEnv> = async (context) => {
  const { request, env } = context;
  if (!isAuthorized(request, env)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: { key?: string; expiresInHours?: number; extractCode?: string };
  try {
    body = await request.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const key = String(body.key || "").trim();
  if (!key) return new Response("Bad Request", { status: 400 });

  const object = await env.BUCKET.head(key);
  // 目录判定与其他端点一致：contentType 或 resourcetype 任一标记都算目录
  let isDir = isCollectionObject(object);
  if (object === null) {
    // 目录可能没有标记对象（仅前缀），检查是否有子对象
    const children = await env.BUCKET.list({ prefix: `${key}/`, limit: 1 });
    if (children.objects.length === 0) {
      return new Response("File not found", { status: 404 });
    }
    isDir = true;
  }

  const token =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  const expiresInHours = Number(body.expiresInHours);
  const expiresAt = expiresInHours
    ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString()
    : null;
  const createdAt = new Date().toISOString();
  const name = basename(key);
  const extractCode = String(body.extractCode || "").trim().slice(0, 32);
  // 提取码在 /share 端点无限流，过短的码可被秒级爆破，因此强制最短 4 位
  if (extractCode && extractCode.length < 4) {
    return new Response("提取码需为 4–32 位", { status: 400 });
  }

  await env.BUCKET.put(
    `${SHARES_PREFIX}${token}.json`,
    JSON.stringify({
      key,
      name,
      isDir,
      expiresAt,
      createdAt,
      ...(extractCode ? { extractCode } : {}),
    }),
    { httpMetadata: { contentType: "application/json" } }
  );

  return new Response(
    JSON.stringify({
      token,
      key,
      name,
      expiresAt,
      createdAt,
      url: `${new URL(request.url).origin}/share/${token}`,
      extractCode: extractCode || null,
      hasExtractCode: Boolean(extractCode),
      isDir,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
};

export const onRequestDelete: PagesFunction<SharesEnv> = async (context) => {
  const { request, env } = context;
  if (!isAuthorized(request, env)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const token = new URL(request.url).searchParams.get("token");
  if (!token) return new Response("Bad Request", { status: 400 });
  await env.BUCKET.delete(`${SHARES_PREFIX}${token}.json`);
  return new Response(null, { status: 204 });
};
