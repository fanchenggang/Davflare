/**
 * 文件收集链接的匿名上传端点（create / part / complete / abort）。
 * 所有错误以 `{ error: <code> }` JSON 返回，页面按 code 显示本地化文案；
 * 任何响应都不包含既有对象的信息，也不包含服务端选定的最终文件名。
 */
import {
  COLLECT_MAX_PENDING,
  COLLECT_PART_SIZE,
  CollectRecord,
  abortCollectUpload,
  collectFolderExists,
  collectNameBudget,
  collectNameCandidates,
  collectPartCount,
  collectRemaining,
  collectStagingKey,
  collectStatus,
  expectedPartLength,
  hasOwn,
  isPendingLive,
  isValidUploadId,
  livePending,
  loadCollect,
  mutateCollect,
  prunePending,
  safeCollectContentType,
  sanitizeCollectName,
} from "./_collect";
import { isInternalKey } from "./api/_apikey";

export type CollectErrorCode =
  | "not_found"
  | "expired"
  | "disabled"
  | "bad_request"
  | "empty_file"
  | "file_too_large"
  | "too_many_files"
  | "quota_exceeded"
  | "too_many_pending"
  | "folder_gone"
  | "unknown_upload"
  | "bad_part"
  | "length_required"
  | "part_too_large"
  | "incomplete_upload"
  | "size_mismatch"
  | "busy"
  | "store_failed";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

export function collectJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...NO_STORE_HEADERS },
  });
}

export function collectError(code: CollectErrorCode, status: number): Response {
  return collectJson({ error: code }, status);
}

const JSON_BODY_MAX = 16 * 1024;

async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  const length = Number(request.headers.get("Content-Length") || "0");
  if (length > JSON_BODY_MAX) return null;
  let text: string;
  try {
    text = await request.text();
  } catch {
    return null;
  }
  if (text.length > JSON_BODY_MAX) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function statusError(record: CollectRecord, now: number): Response | null {
  const status = collectStatus(record, now);
  if (status === "disabled") return collectError("disabled", 410);
  if (status === "expired") return collectError("expired", 410);
  return null;
}

type LimitCheck = CollectErrorCode | null;

/** create 时按声明大小检查：已用 + 进行中 + 本次 */
function checkCreateLimits(record: CollectRecord, size: number, now: number): LimitCheck {
  if (size > record.limits.maxFileBytes) return "file_too_large";
  const live = livePending(record, now);
  if (live.length >= COLLECT_MAX_PENDING) return "too_many_pending";
  if (record.usage.files + live.length + 1 > record.limits.maxFiles) return "too_many_files";
  const pendingBytes = live.reduce((sum, entry) => sum + entry.size, 0);
  if (record.usage.bytes + pendingBytes + size > record.limits.maxTotalBytes) {
    return "quota_exceeded";
  }
  return null;
}

function limitStatus(code: CollectErrorCode): number {
  return code === "too_many_pending" ? 429 : 413;
}

export async function handleCollectCreate(
  bucket: R2Bucket,
  token: string,
  request: Request,
  now = Date.now()
): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body) return collectError("bad_request", 400);
  const size = Number(body.size);
  if (!Number.isSafeInteger(size) || size < 0) return collectError("bad_request", 400);
  if (size === 0) return collectError("empty_file", 400);
  const contentType = safeCollectContentType(body.type);

  const loaded = await loadCollect(bucket, token);
  if (!loaded) return collectError("not_found", 404);
  const { record } = loaded;
  // 文件名按目标文件夹剩余的键长预算截断，保证最终键（含同名后缀）不超过 R2 的 1024 字节
  const name = sanitizeCollectName(body.name, collectNameBudget(record.folder));
  const blocked = statusError(record, now);
  if (blocked) return blocked;
  const limit = checkCreateLimits(record, size, now);
  if (limit) return collectError(limit, limitStatus(limit));
  if (!(await collectFolderExists(bucket, record.folder))) {
    return collectError("folder_gone", 410);
  }

  const staging = collectStagingKey(token);
  const upload = await bucket.createMultipartUpload(staging, {
    httpMetadata: { contentType },
  });
  const at = new Date(now).toISOString();
  let stale: Array<[string, string]> = [];
  const mutation = await mutateCollect<LimitCheck>(bucket, token, (fresh) => {
    const status = collectStatus(fresh, now);
    if (status !== "active") return { write: false, result: status };
    stale = prunePending(fresh, now);
    const check = checkCreateLimits(fresh, size, now);
    if (check) return { write: false, result: check };
    fresh.pending[upload.uploadId] = { staging, name, size, contentType, at };
    return { write: true, result: null };
  });
  if (!mutation.ok || mutation.result !== null) {
    await abortCollectUpload(bucket, staging, upload.uploadId);
    if (!mutation.ok) {
      return mutation.reason === "missing"
        ? collectError("not_found", 404)
        : collectError("busy", 503);
    }
    const code = mutation.result;
    if (code === null || code === "expired" || code === "disabled") {
      return collectError(code ?? "expired", 410);
    }
    return collectError(code, limitStatus(code));
  }
  // 超过 24 小时未完成的上传已不占额度，顺手中止，别让分块在 R2 里再躺到 7 天自动清理
  await abortStale(bucket, stale);
  return collectJson({
    uploadId: upload.uploadId,
    partSize: COLLECT_PART_SIZE,
    partCount: collectPartCount(size),
  });
}

export async function handleCollectPart(
  bucket: R2Bucket,
  token: string,
  request: Request,
  now = Date.now()
): Promise<Response> {
  const url = new URL(request.url);
  const uploadId = url.searchParams.get("uploadId");
  const partNumber = Number(url.searchParams.get("partNumber"));
  if (!isValidUploadId(uploadId) || !Number.isInteger(partNumber) || partNumber < 1) {
    return collectError("bad_request", 400);
  }
  // 先看 Content-Length：超大块在读记录之前就拒绝，不花 R2 子请求
  const lengthHeader = request.headers.get("Content-Length");
  if (lengthHeader === null || !/^\d+$/.test(lengthHeader.trim())) {
    return collectError("length_required", 411);
  }
  const length = Number(lengthHeader);
  if (length > COLLECT_PART_SIZE) return collectError("part_too_large", 413);
  if (!request.body || length === 0) return collectError("bad_part", 400);

  const loaded = await loadCollect(bucket, token);
  if (!loaded) return collectError("not_found", 404);
  const { record } = loaded;
  const blocked = statusError(record, now);
  if (blocked) return blocked;
  if (!hasOwn(record.pending, uploadId) || !isPendingLive(record.pending[uploadId], now)) {
    return collectError("unknown_upload", 404);
  }
  const pending = record.pending[uploadId];
  if (partNumber > collectPartCount(pending.size)) return collectError("bad_part", 400);
  if (length !== expectedPartLength(pending.size, partNumber)) {
    return collectError("bad_part", 400);
  }
  try {
    const part = await bucket
      .resumeMultipartUpload(pending.staging, uploadId)
      .uploadPart(partNumber, request.body);
    return collectJson({ partNumber: part.partNumber, etag: part.etag });
  } catch {
    return collectError("unknown_upload", 404);
  }
}

function parseParts(raw: unknown, maxParts: number): R2UploadedPart[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > maxParts) return null;
  const parts: R2UploadedPart[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const partNumber = Number((item as Record<string, unknown>).partNumber);
    const etag = (item as Record<string, unknown>).etag;
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > maxParts) return null;
    if (typeof etag !== "string" || !etag || etag.length > 256) return null;
    if (parts.length && partNumber <= parts[parts.length - 1].partNumber) return null;
    parts.push({ partNumber, etag });
  }
  return parts;
}

/**
 * 把暂存对象以「仅当不存在」写到目标文件夹，返回最终键；失败返回 null。
 * 先 head 跳过已占用的候选名，再用 etagDoesNotMatch:"*" 条件写兜住 head 与写之间的竞态。
 */
export async function placeCollectedObject(
  bucket: R2Bucket,
  folder: string,
  name: string,
  staging: string,
  contentType = "application/octet-stream"
): Promise<string | null> {
  let races = 0;
  for (const candidate of collectNameCandidates(name)) {
    const key = `${folder}/${candidate}`;
    if (isInternalKey(key)) continue;
    let source: R2ObjectBody | null = null;
    try {
      if ((await bucket.head(key)) !== null) continue;
      source = await bucket.get(staging);
      if (source === null) return null;
      const written = await bucket.put(key, source.body, {
        // 类型以 create 时的安全白名单结果为准，不信任暂存对象上的元数据
        httpMetadata: { contentType },
        onlyIf: { etagDoesNotMatch: "*" },
      });
      if (written !== null) return key;
    } catch {
      // 非法键（超长等）或 R2 临时错误：交给调用方回滚预占的额度，不让异常变成 500
      await cancelBody(source);
      return null;
    }
    await cancelBody(source);
    races += 1;
    if (races >= 3) return null;
  }
  return null;
}

async function cancelBody(source: R2ObjectBody | null) {
  if (!source) return;
  try {
    await source.body.cancel();
  } catch {
    // body may already be consumed
  }
}

async function deleteQuietly(bucket: R2Bucket, key: string) {
  try {
    await bucket.delete(key);
  } catch {
    // 暂存对象残留不影响限额；DELETE 链接时会按前缀清理
  }
}

async function abortStale(bucket: R2Bucket, stale: Array<[string, string]>) {
  for (const [uploadId, staging] of stale) {
    await abortCollectUpload(bucket, staging, uploadId);
  }
}

async function dropPending(bucket: R2Bucket, token: string, uploadId: string) {
  await mutateCollect(bucket, token, (fresh) => {
    if (!hasOwn(fresh.pending, uploadId)) return { write: false, result: null };
    delete fresh.pending[uploadId];
    return { write: true, result: null };
  });
}

export async function handleCollectComplete(
  bucket: R2Bucket,
  token: string,
  request: Request,
  now = Date.now()
): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body || !isValidUploadId(body.uploadId)) return collectError("bad_request", 400);
  const uploadId = body.uploadId;

  const loaded = await loadCollect(bucket, token);
  if (!loaded) return collectError("not_found", 404);
  const { record } = loaded;
  const blocked = statusError(record, now);
  if (blocked) return blocked;
  if (!hasOwn(record.pending, uploadId) || !isPendingLive(record.pending[uploadId], now)) {
    return collectError("unknown_upload", 404);
  }
  const pending = record.pending[uploadId];
  const parts = parseParts(body.parts, collectPartCount(pending.size));
  if (!parts) return collectError("bad_request", 400);

  let size: number;
  try {
    const object = await bucket
      .resumeMultipartUpload(pending.staging, uploadId)
      .complete(parts);
    size = object.size;
  } catch {
    // 缺块 / etag 不符：保留 pending，客户端随后 abort
    return collectError("incomplete_upload", 400);
  }

  // 实际大小复核：分块阶段已逐块校验长度，这里兜底
  if (size !== pending.size || size > record.limits.maxFileBytes) {
    await bucket.delete(pending.staging);
    await dropPending(bucket, token, uploadId);
    return size > record.limits.maxFileBytes
      ? collectError("file_too_large", 413)
      : collectError("size_mismatch", 400);
  }

  // 预占额度（实际大小）并移除 pending：并发 complete 不会一起越过总量
  let stale: Array<[string, string]> = [];
  const reserve = await mutateCollect<CollectErrorCode | null>(bucket, token, (fresh) => {
    if (!hasOwn(fresh.pending, uploadId)) return { write: false, result: "unknown_upload" };
    const status = collectStatus(fresh, now);
    if (status !== "active") return { write: false, result: status };
    if (size > fresh.limits.maxFileBytes) return { write: false, result: "file_too_large" };
    if (fresh.usage.files + 1 > fresh.limits.maxFiles) {
      return { write: false, result: "too_many_files" };
    }
    if (fresh.usage.bytes + size > fresh.limits.maxTotalBytes) {
      return { write: false, result: "quota_exceeded" };
    }
    delete fresh.pending[uploadId];
    stale = prunePending(fresh, now);
    fresh.usage.files += 1;
    fresh.usage.bytes += size;
    return { write: true, result: null };
  });
  if (!reserve.ok || reserve.result !== null) {
    await bucket.delete(pending.staging);
    if (!reserve.ok) {
      if (reserve.reason === "missing") return collectError("not_found", 404);
      await dropPending(bucket, token, uploadId);
      return collectError("busy", 503);
    }
    const code = reserve.result;
    if (code === "file_too_large" || code === "too_many_files" || code === "quota_exceeded") {
      await dropPending(bucket, token, uploadId);
      return collectError(code, 413);
    }
    if (code === "disabled" || code === "expired") return collectError(code, 410);
    return collectError("unknown_upload", 404);
  }

  await abortStale(bucket, stale);
  const finalKey = await placeCollectedObject(
    bucket,
    record.folder,
    pending.name,
    pending.staging,
    safeCollectContentType(pending.contentType)
  );
  await deleteQuietly(bucket, pending.staging);
  if (finalKey === null) {
    await mutateCollect(bucket, token, (fresh) => {
      fresh.usage.files = Math.max(0, fresh.usage.files - 1);
      fresh.usage.bytes = Math.max(0, fresh.usage.bytes - size);
      return { write: true, result: null };
    });
    return collectError("store_failed", 500);
  }

  const after = await loadCollect(bucket, token);
  const remaining = after ? collectRemaining(after.record, now) : { files: 0, bytes: 0 };
  return collectJson({ ok: true, size, remainingFiles: remaining.files, remainingBytes: remaining.bytes });
}

export async function handleCollectAbort(
  bucket: R2Bucket,
  token: string,
  request: Request
): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body || !isValidUploadId(body.uploadId)) return collectError("bad_request", 400);
  const uploadId = body.uploadId;
  const loaded = await loadCollect(bucket, token);
  if (!loaded) return collectError("not_found", 404);
  if (!hasOwn(loaded.record.pending, uploadId)) return collectError("unknown_upload", 404);
  const pending = loaded.record.pending[uploadId];
  await abortCollectUpload(bucket, pending.staging, uploadId);
  await bucket.delete(pending.staging);
  await dropPending(bucket, token, uploadId);
  return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
}
