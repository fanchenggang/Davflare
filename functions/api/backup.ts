import {
  authorizeApiKey,
  conflictBackupKey,
  copyThenDelete,
  formatConflictStamp,
  isCollectionObject,
  isInternalKey,
  isPrefixOnlyFolder,
  jsonResponse,
  moveDirectory,
  normalizeFileKey,
  splitNameExt,
  textResponse,
  touchLastUsed,
} from "./_apikey";

interface BackupEnv {
  BUCKET: R2Bucket;
}

async function readBackupPath(request: Request): Promise<string | Response> {
  const url = new URL(request.url);
  let bodyPath: string | null = null;
  const contentType = request.headers.get("Content-Type") || "";
  if (contentType.toLowerCase().includes("application/json")) {
    try {
      const parsed = (await request.json()) as { path?: unknown };
      if (typeof parsed?.path === "string") bodyPath = parsed.path;
    } catch {
      return textResponse("无法解析 JSON", 400);
    }
  }
  const raw = url.searchParams.get("path") || bodyPath;
  const key = normalizeFileKey(raw);
  if (key instanceof Response) {
    return raw ? key : textResponse("缺少 path 参数", 400);
  }
  if (isInternalKey(key)) return textResponse("禁止访问内部目录", 400);
  return key;
}

async function uniqueBackupKey(bucket: R2Bucket, from: string): Promise<string> {
  const base = conflictBackupKey(from);
  const head = await bucket.head(base);
  if (head === null) return base;

  const slash = base.lastIndexOf("/");
  const name = slash >= 0 ? base.slice(slash + 1) : base;
  const folder = slash >= 0 ? base.slice(0, slash + 1) : "";
  const { stem, ext } = splitNameExt(name);
  let index = 2;
  while (true) {
    const candidate = `${folder}${stem}-${index}${ext}`;
    const exists = await bucket.head(candidate);
    if (exists === null) return candidate;
    index += 1;
    if (index > 99) {
      return `${folder}${stem}-${Date.now()}${ext}`;
    }
  }
}

// 目录备份名：name.conflict-<UTC戳>（目录名不拆扩展名）
async function uniqueDirBackupKey(
  bucket: R2Bucket,
  folder: string,
  name: string
): Promise<string> {
  const base = `${folder}${name}.conflict-${formatConflictStamp()}`;
  const head = await bucket.head(base);
  if (head === null) return base;
  let index = 2;
  while (true) {
    const candidate = `${base}-${index}`;
    const exists = await bucket.head(candidate);
    if (exists === null) return candidate;
    index += 1;
    if (index > 99) {
      return `${base}-${Date.now()}`;
    }
  }
}

export const onRequestPost: PagesFunction<BackupEnv> = async (context) => {
  const { request, env } = context;
  const auth = await authorizeApiKey(request, env.BUCKET);
  if (auth instanceof Response) return auth;

  const from = await readBackupPath(request);
  if (from instanceof Response) return from;

  const sourceHead = await env.BUCKET.head(from);
  const sourceIsDir =
    sourceHead !== null
      ? isCollectionObject(sourceHead)
      : await isPrefixOnlyFolder(env.BUCKET, from);
  if (sourceHead === null && !sourceIsDir) {
    return textResponse("文件不存在", 404);
  }

  if (!sourceIsDir) {
    const to = await uniqueBackupKey(env.BUCKET, from);
    const copied = await copyThenDelete(env.BUCKET, from, to);
    if (copied) return copied;

    await touchLastUsed(env.BUCKET, auth);
    return jsonResponse({ from, to });
  }

  // 目录备份：整树改名 name.conflict-<UTC戳>
  const slash = from.lastIndexOf("/");
  const name = slash >= 0 ? from.slice(slash + 1) : from;
  const folder = slash >= 0 ? from.slice(0, slash + 1) : "";
  const to = await uniqueDirBackupKey(env.BUCKET, folder, name);

  const moved = await moveDirectory(env.BUCKET, from, to);
  if (moved) return moved;

  await touchLastUsed(env.BUCKET, auth);
  return jsonResponse({ from, to, kind: "directory" });
};
