/**
 * 文件收集链接管理（需登录：Basic 会话或 API key，与 /api/shares 相同）。
 *   GET    /api/collects                    列出全部收集链接
 *   POST   /api/collects                    { folder, expiresInHours?, note? } 创建
 *   PATCH  /api/collects?token=             { disabled: true } 停用（不可恢复）
 *   DELETE /api/collects?token=             删除链接记录（已收到的文件保留）
 * 停用/删除会中止该链接所有进行中的上传。
 */
import {
  COLLECTS_PREFIX,
  COLLECT_FOLDER_MAX_BYTES,
  COLLECT_MAX_EXPIRY_HOURS,
  COLLECT_NOTE_MAX,
  COLLECT_STAGING_PREFIX,
  CollectRecord,
  DEFAULT_COLLECT_LIMITS,
  abortCollectUpload,
  collectFolderExists,
  collectRecordKey,
  collectStatus,
  isCollectToken,
  isForbiddenCollectFolder,
  livePending,
  loadCollect,
  mutateCollect,
  newCollectToken,
  saveCollectRecord,
  utf8Length,
} from "../_collect";
import {
  isSessionOrKeyAuthorized,
  jsonResponse,
  normalizeDirKey,
  textResponse,
} from "./_apikey";

interface CollectsEnv {
  BUCKET: R2Bucket;
  WEBDAV_USERNAME: string;
  WEBDAV_PASSWORD: string;
}

async function authorized(request: Request, env: CollectsEnv): Promise<boolean> {
  return isSessionOrKeyAuthorized(request, env.BUCKET, env.WEBDAV_USERNAME, env.WEBDAV_PASSWORD);
}

export function collectView(token: string, record: CollectRecord, origin: string, now = Date.now()) {
  const folder = record.folder;
  return {
    token,
    url: `${origin}/collect/${token}`,
    folder,
    name: folder.split("/").pop() || folder,
    note: record.note,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    disabledAt: record.disabledAt,
    status: collectStatus(record, now),
    limits: record.limits,
    usage: record.usage,
    pendingCount: livePending(record, now).length,
  };
}

// eslint-disable-next-line no-control-regex
const NOTE_STRIP_RE = /[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g;

export function sanitizeCollectNote(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return Array.from(raw.replace(NOTE_STRIP_RE, "").trim()).slice(0, COLLECT_NOTE_MAX).join("");
}

export const onRequestGet: PagesFunction<CollectsEnv> = async ({ request, env }) => {
  if (!(await authorized(request, env))) return textResponse("Unauthorized", 401);
  const origin = new URL(request.url).origin;
  const items: Array<ReturnType<typeof collectView>> = [];
  let cursor: string | undefined;
  do {
    const listing = await env.BUCKET.list({ prefix: COLLECTS_PREFIX, cursor });
    for (const object of listing.objects) {
      const token = object.key.slice(COLLECTS_PREFIX.length).replace(/\.json$/, "");
      if (!object.key.endsWith(".json") || !isCollectToken(token)) continue;
      const loaded = await loadCollect(env.BUCKET, token);
      if (loaded) items.push(collectView(token, loaded.record, origin));
    }
    if (!listing.truncated) break;
    cursor = listing.cursor;
  } while (cursor);
  items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return jsonResponse(items);
};

export const onRequestPost: PagesFunction<CollectsEnv> = async ({ request, env }) => {
  if (!(await authorized(request, env))) return textResponse("Unauthorized", 401);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return textResponse("Bad Request", 400);
  }
  if (!body || typeof body !== "object") return textResponse("Bad Request", 400);
  const folder = normalizeDirKey(typeof body.folder === "string" ? body.folder : null);
  if (folder instanceof Response) return folder;
  if (isForbiddenCollectFolder(folder)) {
    return textResponse("不能在站点目录或内部目录上创建收集链接", 400);
  }
  // 给收到的文件名留出键长：folder + "/" + 文件名 + 同名后缀不能超过 R2 的 1024 字节
  if (utf8Length(folder) > COLLECT_FOLDER_MAX_BYTES) {
    return textResponse("文件夹路径太长，请换一个层级更浅的文件夹", 400);
  }
  let hours = COLLECT_MAX_EXPIRY_HOURS;
  if (body.expiresInHours !== undefined && body.expiresInHours !== null) {
    hours = Number(body.expiresInHours);
    if (!Number.isFinite(hours) || hours <= 0 || hours > COLLECT_MAX_EXPIRY_HOURS) {
      return textResponse(`有效期需在 0–${COLLECT_MAX_EXPIRY_HOURS} 小时之间`, 400);
    }
  }
  if (!(await collectFolderExists(env.BUCKET, folder))) {
    return textResponse("文件夹不存在", 404);
  }
  const now = Date.now();
  const token = newCollectToken();
  const record: CollectRecord = {
    kind: "collect",
    version: 1,
    folder,
    note: sanitizeCollectNote(body.note),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + hours * 60 * 60 * 1000).toISOString(),
    disabledAt: null,
    limits: { ...DEFAULT_COLLECT_LIMITS },
    usage: { files: 0, bytes: 0 },
    pending: {},
  };
  // 新令牌 128 位随机；仍用「仅当不存在」写，绝不覆盖既有记录
  if (!(await saveCollectRecord(env.BUCKET, token, record, { etagDoesNotMatch: "*" }))) {
    return textResponse("Conflict", 409);
  }
  return jsonResponse(collectView(token, record, new URL(request.url).origin, now), 201);
};

/** 中止该链接全部进行中的上传并清空 pending；返回最新记录 */
async function stopCollect(
  bucket: R2Bucket,
  token: string,
  mark: (record: CollectRecord) => void
): Promise<CollectRecord | null | "conflict"> {
  const aborted: Array<[string, string]> = [];
  const mutation = await mutateCollect<CollectRecord>(bucket, token, (record) => {
    for (const [id, entry] of Object.entries(record.pending)) aborted.push([entry.staging, id]);
    record.pending = {};
    mark(record);
    return { write: true, result: record };
  });
  if (!mutation.ok) return mutation.reason === "missing" ? null : "conflict";
  const seen = new Set<string>();
  for (const [staging, id] of aborted) {
    if (seen.has(id)) continue;
    seen.add(id);
    await abortCollectUpload(bucket, staging, id);
  }
  return mutation.result;
}

function tokenParam(request: Request): string | null {
  const token = new URL(request.url).searchParams.get("token");
  return isCollectToken(token) ? token : null;
}

export const onRequestPatch: PagesFunction<CollectsEnv> = async ({ request, env }) => {
  if (!(await authorized(request, env))) return textResponse("Unauthorized", 401);
  const token = tokenParam(request);
  if (!token) return textResponse("Bad Request", 400);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return textResponse("Bad Request", 400);
  }
  if (!body || body.disabled !== true) return textResponse("Bad Request", 400);
  const stamp = new Date().toISOString();
  const result = await stopCollect(env.BUCKET, token, (record) => {
    if (!record.disabledAt) record.disabledAt = stamp;
  });
  if (result === null) return textResponse("Not Found", 404);
  if (result === "conflict") return textResponse("Busy, retry", 503);
  return jsonResponse(collectView(token, result, new URL(request.url).origin));
};

export const onRequestDelete: PagesFunction<CollectsEnv> = async ({ request, env }) => {
  if (!(await authorized(request, env))) return textResponse("Unauthorized", 401);
  const token = tokenParam(request);
  if (!token) return textResponse("Bad Request", 400);
  // 先停用（让并发的匿名请求立刻失效并中止进行中的上传），再删记录与残留暂存
  const stamp = new Date().toISOString();
  const result = await stopCollect(env.BUCKET, token, (record) => {
    if (!record.disabledAt) record.disabledAt = stamp;
  });
  if (result === "conflict") return textResponse("Busy, retry", 503);
  await env.BUCKET.delete(collectRecordKey(token));
  const staging = await env.BUCKET.list({ prefix: `${COLLECT_STAGING_PREFIX}${token}/`, limit: 1000 });
  if (staging.objects.length) await env.BUCKET.delete(staging.objects.map((object) => object.key));
  return new Response(null, { status: 204 });
};
