/**
 * 文件收集链接（file request）核心逻辑。
 *
 * 这是第一条匿名写入路径，安全模型：
 * - 收集令牌与分享令牌是两种类型：记录分别在 `_$flaredrive$/collects/` 与
 *   `_$flaredrive$/shares/`，各自的端点只读自己的前缀。收集记录用 `folder` 字段
 *   而不是分享的 `key`，并带 `kind: "collect"`，即使被错误前缀读到也会被拒绝。
 * - 匿名端点只写：从不列目录、从不返回任何既有对象的内容/元数据，也不返回
 *   服务端最终选定的文件名（否则可借同名后缀探测文件是否存在）。
 * - uploadId 绑定令牌：create 时记入该令牌记录的 pending 表，part/complete/abort
 *   只接受 pending 表里的 uploadId；分块写到内部暂存键，完成后按服务端选定的
 *   安全文件名以「仅当不存在」条件写入目标文件夹（never overwrite）。
 * - 限额在 create（声明大小）与 complete（实际大小）两处检查；计数器用
 *   R2 etag 条件写（CAS）更新，冲突重试，见 mutateCollect 注释的竞态容忍说明。
 */
import { INTERNAL_PREFIX, isCollectionObject, isInternalKey, splitNameExt } from "./api/_apikey";
import { SITES_PREFIX } from "./_sites";

export const COLLECTS_PREFIX = `${INTERNAL_PREFIX}collects/`;
export const COLLECT_STAGING_PREFIX = `${INTERNAL_PREFIX}collect-staging/`;

export const COLLECT_PART_SIZE = 10 * 1024 * 1024;
export const COLLECT_MAX_FILE_BYTES = 100 * 1024 * 1024;
export const COLLECT_MAX_FILES = 200;
export const COLLECT_MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;
export const COLLECT_MAX_EXPIRY_HOURS = 7 * 24;
/** 每个链接同时进行中的上传数上限：限制记录体积与 CAS 冲突面 */
export const COLLECT_MAX_PENDING = 10;
/** 超过此时长未完成的上传不再占用限额（R2 默认 7 天自动清理未完成的分块上传） */
export const COLLECT_PENDING_TTL_MS = 24 * 60 * 60 * 1000;
export const COLLECT_NOTE_MAX = 200;
export const COLLECT_NAME_MAX = 180;
const CAS_ATTEMPTS = 5;
const TOKEN_RE = /^[a-f0-9]{32}$/;
const UPLOAD_ID_MAX = 1024;

export interface CollectLimits {
  maxFileBytes: number;
  maxFiles: number;
  maxTotalBytes: number;
}

export interface CollectPending {
  staging: string;
  name: string;
  size: number;
  contentType: string;
  at: string;
}

export interface CollectRecord {
  kind: "collect";
  version: 1;
  folder: string;
  note: string;
  createdAt: string;
  expiresAt: string;
  disabledAt: string | null;
  limits: CollectLimits;
  usage: { files: number; bytes: number };
  pending: Record<string, CollectPending>;
}

export type CollectStatus = "active" | "expired" | "disabled";

export const DEFAULT_COLLECT_LIMITS: CollectLimits = {
  maxFileBytes: COLLECT_MAX_FILE_BYTES,
  maxFiles: COLLECT_MAX_FILES,
  maxTotalBytes: COLLECT_MAX_TOTAL_BYTES,
};

export function isCollectToken(token: unknown): token is string {
  return typeof token === "string" && TOKEN_RE.test(token);
}

export function newCollectToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export function collectRecordKey(token: string): string {
  return `${COLLECTS_PREFIX}${token}.json`;
}

export function collectStagingKey(token: string): string {
  return `${COLLECT_STAGING_PREFIX}${token}/${crypto.randomUUID().replace(/-/g, "")}`;
}

export function hasOwn<T>(map: Record<string, T>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(map, key);
}

function finiteNonNegative(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** 限额只允许比默认更严：记录被篡改成更大的值也按默认上限执行 */
function clampLimit(value: unknown, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return max;
  return Math.min(Math.floor(n), max);
}

/** 校验并规范化存储的收集记录；任何结构不符都按「不存在」处理。 */
export function parseCollectRecord(raw: unknown): CollectRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (data.kind !== "collect") return null;
  const folder = typeof data.folder === "string" ? data.folder : "";
  if (!folder || isInternalKey(folder) || folder.startsWith("/") || folder.endsWith("/")) {
    return null;
  }
  const expiresAt = typeof data.expiresAt === "string" ? data.expiresAt : "";
  if (!Number.isFinite(Date.parse(expiresAt))) return null;
  const limits = (data.limits || {}) as Record<string, unknown>;
  const usage = (data.usage || {}) as Record<string, unknown>;
  const pendingRaw =
    data.pending && typeof data.pending === "object" && !Array.isArray(data.pending)
      ? (data.pending as Record<string, unknown>)
      : {};
  const pending: Record<string, CollectPending> = {};
  for (const id of Object.keys(pendingRaw)) {
    const entry = pendingRaw[id] as Record<string, unknown> | null;
    if (!entry || typeof entry !== "object") continue;
    if (typeof entry.staging !== "string" || !entry.staging.startsWith(COLLECT_STAGING_PREFIX)) {
      continue;
    }
    pending[id] = {
      staging: entry.staging,
      name: typeof entry.name === "string" ? entry.name : "file",
      size: finiteNonNegative(entry.size, 0),
      contentType:
        typeof entry.contentType === "string" ? entry.contentType : "application/octet-stream",
      at: typeof entry.at === "string" ? entry.at : new Date(0).toISOString(),
    };
  }
  return {
    kind: "collect",
    version: 1,
    folder,
    note: typeof data.note === "string" ? data.note.slice(0, COLLECT_NOTE_MAX) : "",
    createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
    expiresAt,
    disabledAt: typeof data.disabledAt === "string" ? data.disabledAt : null,
    limits: {
      maxFileBytes: clampLimit(limits.maxFileBytes, COLLECT_MAX_FILE_BYTES),
      maxFiles: clampLimit(limits.maxFiles, COLLECT_MAX_FILES),
      maxTotalBytes: clampLimit(limits.maxTotalBytes, COLLECT_MAX_TOTAL_BYTES),
    },
    usage: {
      files: finiteNonNegative(usage.files, 0),
      bytes: finiteNonNegative(usage.bytes, 0),
    },
    pending,
  };
}

export function collectStatus(record: CollectRecord, now = Date.now()): CollectStatus {
  if (record.disabledAt) return "disabled";
  if (Date.parse(record.expiresAt) <= now) return "expired";
  return "active";
}

export function isPendingLive(entry: CollectPending, now = Date.now()): boolean {
  const at = Date.parse(entry.at);
  return Number.isFinite(at) && now - at < COLLECT_PENDING_TTL_MS;
}

export function livePending(record: CollectRecord, now = Date.now()): CollectPending[] {
  return Object.values(record.pending).filter((entry) => isPendingLive(entry, now));
}

/** 移除超时的 pending，返回被移除的 [uploadId, staging]，调用方写回成功后据此中止分块上传 */
export function prunePending(record: CollectRecord, now = Date.now()): Array<[string, string]> {
  const pruned: Array<[string, string]> = [];
  for (const id of Object.keys(record.pending)) {
    if (!isPendingLive(record.pending[id], now)) {
      pruned.push([id, record.pending[id].staging]);
      delete record.pending[id];
    }
  }
  return pruned;
}

/** 剩余额度（不含进行中的上传），页面展示用 */
export function collectRemaining(record: CollectRecord, now = Date.now()) {
  const live = livePending(record, now);
  const files = Math.max(0, record.limits.maxFiles - record.usage.files - live.length);
  const bytes = Math.max(
    0,
    record.limits.maxTotalBytes -
      record.usage.bytes -
      live.reduce((sum, entry) => sum + entry.size, 0)
  );
  return { files, bytes };
}

export async function loadCollect(
  bucket: R2Bucket,
  token: string
): Promise<{ record: CollectRecord; etag: string } | null> {
  if (!isCollectToken(token)) return null;
  const object = await bucket.get(collectRecordKey(token));
  if (object === null) return null;
  let parsed: unknown;
  try {
    parsed = await object.json();
  } catch {
    return null;
  }
  const record = parseCollectRecord(parsed);
  return record ? { record, etag: object.etag } : null;
}

export async function saveCollectRecord(
  bucket: R2Bucket,
  token: string,
  record: CollectRecord,
  onlyIf?: R2Conditional
): Promise<boolean> {
  const result = await bucket.put(collectRecordKey(token), JSON.stringify(record), {
    httpMetadata: { contentType: "application/json" },
    ...(onlyIf ? { onlyIf } : {}),
  });
  return result !== null;
}

export type MutateResult<T> =
  | { ok: true; result: T }
  | { ok: false; reason: "missing" | "conflict" };

/**
 * 读-改-条件写（etagMatches）更新收集记录，冲突时重新读取并重试。
 *
 * 竞态容忍：所有计数器变更都走这条 CAS 路径，因此并发请求不会互相覆盖；
 * 连续 CAS_ATTEMPTS 次冲突时返回 conflict，调用方按「繁忙，请重试」处理并
 * 回滚已做的副作用。唯一的放宽是：complete 先预占额度、再写目标对象，写入
 * 失败时回滚预占；回滚本身再冲突时额度会多算（偏保守方向，永不超额）。
 */
export async function mutateCollect<T>(
  bucket: R2Bucket,
  token: string,
  fn: (record: CollectRecord) => { write: boolean; result: T }
): Promise<MutateResult<T>> {
  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
    const loaded = await loadCollect(bucket, token);
    if (!loaded) return { ok: false, reason: "missing" };
    const { write, result } = fn(loaded.record);
    if (!write) return { ok: true, result };
    if (await saveCollectRecord(bucket, token, loaded.record, { etagMatches: loaded.etag })) {
      return { ok: true, result };
    }
  }
  return { ok: false, reason: "conflict" };
}

/** 目标文件夹是否仍存在（目录标记对象，或仅前缀形态的目录） */
export async function collectFolderExists(bucket: R2Bucket, folder: string): Promise<boolean> {
  const head = await bucket.head(folder);
  if (head !== null) return isCollectionObject(head);
  const listing = await bucket.list({ prefix: `${folder}/`, limit: 1 });
  const prefixes = (listing as { delimitedPrefixes?: string[] }).delimitedPrefixes;
  return listing.objects.length > 0 || Boolean(prefixes && prefixes.length > 0);
}

/** 收集目标不能落在公开站点目录（sites/ 由 SITES_HOST 公开托管） */
export function isForbiddenCollectFolder(folder: string): boolean {
  const sitesRoot = SITES_PREFIX.replace(/\/$/, "");
  return folder === sitesRoot || folder.startsWith(SITES_PREFIX) || isInternalKey(folder);
}

// 控制字符、C1、软连字符、零宽/不可见填充与双向覆盖字符（防止 "gpj.exe" 之类的显示欺骗）
// eslint-disable-next-line no-control-regex
const STRIP_CHARS_RE = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u115f\u1160\u180e\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2064\u2066-\u2069\u3164\ufeff\uffa0\ufff9-\ufffb]/g;
// 孤立代理项：R2 键按 UTF-8 编码时会被替换成 U+FFFD，head 与 put 看到的键可能不一致
const LONE_SURROGATE_RE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;
// Windows 保留字符替换为下划线，保证下载到任意系统都能落盘
const RESERVED_CHARS_RE = /[<>:"|?*]/g;
// 收到的文件名里不保留任何 `%XX` 序列：/api/* 现在只解码一次，但第三方客户端可能
// 自己多解码一次，收集来的匿名文件名不值得冒这个险。
const PERCENT_ESCAPE_RE = /%(?=[0-9a-fA-F]{2})/g;
// Windows 设备名（CON、NUL、COM1.txt …）在 Windows 上无法落盘
const WINDOWS_DEVICE_RE = /^(con|prn|aux|nul|com[0-9\u00b9\u00b2\u00b3]|lpt[0-9\u00b9\u00b2\u00b3])(\.|$)/i;

const utf8 = new TextEncoder();

export function utf8Length(value: string): number {
  return utf8.encode(value).length;
}

/** 按码点截断，保证 UTF-8 字节数不超过 maxBytes（不会切开代理对） */
function truncateUtf8(value: string, maxBytes: number): string {
  if (utf8Length(value) <= maxBytes) return value;
  let out = "";
  let bytes = 0;
  for (const ch of value) {
    const size = utf8Length(ch);
    if (bytes + size > maxBytes) break;
    out += ch;
    bytes += size;
  }
  return out;
}

function truncateName(name: string, maxChars: number, maxBytes: number): string {
  const chars = Array.from(name);
  if (chars.length <= maxChars && utf8Length(name) <= maxBytes) return name;
  const { stem, ext } = splitNameExt(name);
  const extChars = Array.from(ext).length;
  const extBytes = utf8Length(ext);
  if (ext && extChars <= 16 && extChars < maxChars && extBytes < maxBytes) {
    const stemPart = Array.from(stem).slice(0, maxChars - extChars).join("");
    return `${truncateUtf8(stemPart, maxBytes - extBytes)}${ext}`;
  }
  return truncateUtf8(chars.slice(0, maxChars).join(""), maxBytes);
}

/** 文件名字节上限：常见文件系统单个文件名 255 字节，再给同名后缀（最长 "-xxxxxxxx"）留余量 */
export const COLLECT_NAME_MAX_BYTES = 240;
const COLLECT_SUFFIX_MAX_BYTES = 9;
const R2_KEY_MAX_BYTES = 1024;
/** 目标文件夹键的字节上限：保证 folder + "/" + 最长文件名 + 后缀不超过 R2 的 1024 字节键长 */
export const COLLECT_FOLDER_MAX_BYTES =
  R2_KEY_MAX_BYTES - 1 - COLLECT_NAME_MAX_BYTES - COLLECT_SUFFIX_MAX_BYTES;

/** 给定目标文件夹时文件名可用的字节数（兼容记录里过长的旧文件夹，至少留 1 字节） */
export function collectNameBudget(folder: string): number {
  const room = R2_KEY_MAX_BYTES - 1 - COLLECT_SUFFIX_MAX_BYTES - utf8Length(folder);
  return Math.max(1, Math.min(COLLECT_NAME_MAX_BYTES, room));
}

function trimEdges(name: string): string {
  return name.replace(/^[\s.]+/, "").replace(/[\s.]+$/, "");
}

/**
 * 服务端决定最终文件名：只取最后一段（剥掉任何 / 与 \ 路径），去掉控制/零宽/
 * 双向字符与孤立代理项，替换 Windows 保留字符与 `%XX` 转义，去掉首尾空白与点
 * （杜绝 "."、".." 与隐藏文件），Windows 设备名前加下划线，按码点
 * （COLLECT_NAME_MAX）与 UTF-8 字节（maxBytes）截断；结果为空时回落 "file"。
 */
export function sanitizeCollectName(raw: unknown, maxBytes = COLLECT_NAME_MAX_BYTES): string {
  let name = typeof raw === "string" ? raw : "";
  name = name.replace(LONE_SURROGATE_RE, "");
  try {
    name = name.normalize("NFC");
  } catch {
    // keep as-is
  }
  const segments = name.split(/[\\/]/);
  name = segments[segments.length - 1] ?? "";
  name = name
    .replace(STRIP_CHARS_RE, "")
    .replace(RESERVED_CHARS_RE, "_")
    .replace(PERCENT_ESCAPE_RE, "_");
  name = trimEdges(name);
  if (WINDOWS_DEVICE_RE.test(name)) name = `_${name}`;
  const budget = Math.max(1, Math.min(COLLECT_NAME_MAX_BYTES, Math.floor(maxBytes)));
  name = trimEdges(truncateName(name, COLLECT_NAME_MAX, budget));
  if (!name) return "file";
  if (name === "_$flaredrive$") return `_${name}`;
  return name;
}

/** 候选名：原名，然后 name-2 … name-99，最后两个随机后缀兜底 */
export function* collectNameCandidates(name: string): Generator<string> {
  yield name;
  const { stem, ext } = splitNameExt(name);
  for (let n = 2; n < 100; n++) yield `${stem}-${n}${ext}`;
  for (let i = 0; i < 2; i++) {
    yield `${stem}-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}${ext}`;
  }
}

// 只接受被动类型；其它（含 text/html、image/svg+xml、XML、JS）一律存成
// application/octet-stream，避免收到的文件在网盘同源下被渲染成可执行文档。
const PASSIVE_TYPE_RE =
  /^(image\/(png|jpeg|gif|webp|avif|bmp|heic|heif|tiff)|video\/(mp4|webm|ogg|quicktime|x-matroska|x-msvideo|mpeg|3gpp)|audio\/(mpeg|mp4|ogg|wav|x-wav|webm|aac|flac|x-flac|x-m4a)|application\/pdf|text\/plain|text\/csv|text\/markdown|application\/json|application\/zip|application\/x-zip-compressed|application\/x-7z-compressed|application\/x-rar-compressed|application\/vnd\.rar|application\/gzip|application\/x-tar|application\/msword|application\/vnd\.ms-(excel|powerpoint)|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|application\/vnd\.oasis\.opendocument\.(text|spreadsheet|presentation))$/;

export function safeCollectContentType(declared: unknown): string {
  const type = typeof declared === "string" ? declared.trim().toLowerCase().split(";")[0].trim() : "";
  return PASSIVE_TYPE_RE.test(type) ? type : "application/octet-stream";
}

export function isValidUploadId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= UPLOAD_ID_MAX;
}

export function collectPartCount(size: number): number {
  return Math.max(1, Math.ceil(size / COLLECT_PART_SIZE));
}

/** 第 partNumber 块必须的精确字节数（最后一块为余数） */
export function expectedPartLength(size: number, partNumber: number): number {
  const count = collectPartCount(size);
  if (partNumber < count) return COLLECT_PART_SIZE;
  return size - (count - 1) * COLLECT_PART_SIZE;
}

/** 尽力中止一个分块上传（已结束/不存在时忽略） */
export async function abortCollectUpload(
  bucket: R2Bucket,
  staging: string,
  uploadId: string
): Promise<void> {
  try {
    await bucket.resumeMultipartUpload(staging, uploadId).abort();
  } catch {
    // already completed / aborted / expired
  }
}
