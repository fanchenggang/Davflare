interface TrashEnv {
  BUCKET: R2Bucket;
  WEBDAV_USERNAME: string;
  WEBDAV_PASSWORD: string;
}

const TRASH_PREFIX = "_$flaredrive$/trash/";

function isAuthorized(request: Request, env: TrashEnv) {
  const authorization = request.headers.get("Authorization");
  const expected = `Basic ${btoa(
    `${env.WEBDAV_USERNAME}:${env.WEBDAV_PASSWORD}`
  )}`;
  return Boolean(authorization && authorization === expected);
}

function basename(key: string) {
  return key.replace(/\/$/, "").split("/").pop() ?? "";
}

async function listObjects(bucket: R2Bucket, prefix: string) {
  const objects: R2Object[] = [];
  let cursor: string | undefined;
  do {
    const listing = await bucket.list({
      prefix,
      cursor,
      // @ts-ignore `include` is supported by R2 but missing from this types version.
      include: ["httpMetadata", "customMetadata"],
    });
    objects.push(...listing.objects);
    if (!listing.truncated) break;
    cursor = listing.cursor;
  } while (true);
  return objects;
}

function createTrashId() {
  const random =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(36).slice(2);
  return `${Date.now()}-${random}`;
}

async function listTrashItems(bucket: R2Bucket) {
  const objects = await listObjects(bucket, TRASH_PREFIX);
  const items: Array<Record<string, unknown>> = [];

  for (const object of objects) {
    if (!object.key.endsWith(".json")) continue;
    const data = await bucket.get(object.key);
    if (data === null) continue;
    const parsed = (await data.json()) as Record<string, unknown>;
    items.push({
      trashKey: object.key.slice(TRASH_PREFIX.length).replace(/\.json$/, ""),
      originalKey: parsed.originalKey,
      name: parsed.name || basename(String(parsed.originalKey || "")),
      deletedAt: parsed.deletedAt,
      size: parsed.size || 0,
    });
  }

  return items;
}

export const onRequestGet: PagesFunction<TrashEnv> = async (context) => {
  const { request, env } = context;
  if (!isAuthorized(request, env)) {
    return new Response("Unauthorized", { status: 401 });
  }
  return new Response(
    JSON.stringify(await listTrashItems(env.BUCKET)),
    { headers: { "Content-Type": "application/json" } }
  );
};

export const onRequestPost: PagesFunction<TrashEnv> = async (context) => {
  const { request, env } = context;
  if (!isAuthorized(request, env)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  if (url.searchParams.get("action") === "restore") {
    return handleRestore(request, env);
  }
  return handleSoftDelete(request, env);
};

export const onRequestDelete: PagesFunction<TrashEnv> = async (context) => {
  const { request, env } = context;
  if (!isAuthorized(request, env)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: { trashKeys?: string[]; all?: boolean };
  try {
    body = await request.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  if (body.all) {
    const objects = await listObjects(env.BUCKET, TRASH_PREFIX);
    for (const object of objects) {
      await env.BUCKET.delete(object.key);
    }
    return new Response(null, { status: 204 });
  }

  for (const trashKey of body.trashKeys || []) {
    const objects = await listObjects(
      env.BUCKET,
      `${TRASH_PREFIX}${trashKey}/`
    );
    for (const object of objects) {
      await env.BUCKET.delete(object.key);
    }
    await env.BUCKET.delete(`${TRASH_PREFIX}${trashKey}.json`);
  }
  return new Response(null, { status: 204 });
};

// 软删除核心：复制到回收站前缀再删原对象。供网页回收站与开放接口 /api/delete?soft=1 共用。
export async function softDeleteKeys(bucket: R2Bucket, keys: string[]) {
  const results: Array<{ key: string; id: string }> = [];
  for (const rawKey of keys) {
    const key = String(rawKey).replace(/\/$/, "");
    if (!key) continue;

    const head = await bucket.head(key);
    if (head === null) continue;

    const descendants = await listObjects(bucket, `${key}/`);
    const id = createTrashId();
    const root = `${TRASH_PREFIX}${id}`;
    const items: Array<{
      source: string;
      target: string;
      httpMetadata?: R2Object["httpMetadata"];
      customMetadata?: R2Object["customMetadata"];
      size: number;
    }> = [];

    if (head !== null) {
      items.push({
        source: key,
        target: `${root}/${basename(key)}`,
        httpMetadata: head.httpMetadata,
        customMetadata: head.customMetadata,
        size: head.size,
      });
    }

    for (const object of descendants) {
      if (object.key.startsWith("_$flaredrive$/")) continue;
      const relative = object.key.slice(`${key}/`.length);
      items.push({
        source: object.key,
        target: `${root}/${relative}`,
        httpMetadata: object.httpMetadata,
        customMetadata: object.customMetadata,
        size: object.size,
      });
    }

    let totalSize = 0;
    for (const item of items) {
      const source = await bucket.get(item.source);
      if (source === null) continue;
      await bucket.put(item.target, source.body, {
        httpMetadata: source.httpMetadata,
        customMetadata: source.customMetadata,
      });
      totalSize += source.size;
    }

    for (const item of items) {
      await bucket.delete(item.source);
    }

    await bucket.put(
      `${TRASH_PREFIX}${id}.json`,
      JSON.stringify({
        originalKey: key,
        name: basename(key),
        deletedAt: new Date().toISOString(),
        size: totalSize,
        items: items.map(({ source, target }) => ({
          source,
          target,
        })),
      }),
      { httpMetadata: { contentType: "application/json" } }
    );

    results.push({ key, id });
  }
  return results;
}

async function handleSoftDelete(request: Request, env: TrashEnv) {
  let body: { keys?: string[] };
  try {
    body = await request.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const keys = body.keys || [];
  if (keys.length === 0) return new Response("Bad Request", { status: 400 });

  const results = await softDeleteKeys(env.BUCKET, keys);

  return new Response(JSON.stringify({ results }), {
    headers: { "Content-Type": "application/json" },
  });
}

async function handleRestore(request: Request, env: TrashEnv) {
  let body: { trashKeys?: string[] };
  try {
    body = await request.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const results: Array<{
    trashKey: string;
    status: string;
    message?: string;
  }> = [];

  for (const trashKey of body.trashKeys || []) {
    const metadataKey = `${TRASH_PREFIX}${trashKey}.json`;
    const metadataObject = await env.BUCKET.get(metadataKey);
    if (metadataObject === null) {
      results.push({ trashKey, status: "error", message: "回收站项目不存在" });
      continue;
    }

    const metadata = (await metadataObject.json()) as {
      originalKey?: string;
      items?: Array<{ source: string; target: string }>;
    };
    if (!metadata.originalKey || !metadata.items) {
      results.push({ trashKey, status: "error", message: "回收站项目损坏" });
      continue;
    }

    if (await env.BUCKET.head(metadata.originalKey)) {
      results.push({
        trashKey,
        status: "conflict",
        message: `目标位置已存在：${metadata.originalKey}`,
      });
      continue;
    }

    for (const item of metadata.items) {
      const source = await env.BUCKET.get(item.target);
      if (source === null) continue;
      await env.BUCKET.put(item.source, source.body, {
        httpMetadata: source.httpMetadata,
        customMetadata: source.customMetadata,
      });
      await env.BUCKET.delete(item.target);
    }
    await env.BUCKET.delete(metadataKey);
    results.push({ trashKey, status: "restored" });
  }

  return new Response(JSON.stringify(results), {
    headers: { "Content-Type": "application/json" },
  });
}
