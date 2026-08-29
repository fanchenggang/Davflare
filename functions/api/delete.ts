import {
  authorizeApiKey,
  deleteDirectory,
  isCollectionObject,
  isInternalKey,
  isTruthyParam,
  jsonResponse,
  normalizeDirKey,
  resolveAsDirectory,
  textResponse,
  touchLastUsed,
} from "./_apikey";
import { softDeleteKeys } from "./trash";

interface DeleteEnv {
  BUCKET: R2Bucket;
}

export const onRequestDelete: PagesFunction<DeleteEnv> = async (context) => {
  const { request, env } = context;
  const auth = await authorizeApiKey(request, env.BUCKET);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const soft = isTruthyParam(url.searchParams.get("soft"));
  const key = normalizeDirKey(url.searchParams.get("path"));
  if (key instanceof Response) return key;
  if (isInternalKey(key)) return textResponse("禁止访问内部目录", 400);

  const head = await env.BUCKET.head(key);
  const isDir = head !== null ? isCollectionObject(head) : await resolveAsDirectory(env.BUCKET, key);

  if (head === null && !isDir) {
    return textResponse("文件不存在", 404);
  }

  // 软删除：文件与目录都进回收站（复用网页端语义），可还原
  if (soft) {
    const results = await softDeleteKeys(env.BUCKET, [key]);
    if (results.length === 0) return textResponse("文件不存在", 404);
    await touchLastUsed(env.BUCKET, auth);
    return jsonResponse({
      key,
      deleted: true,
      soft: true,
      trashId: results[0].id,
    });
  }

  if (head !== null && !isDir) {
    await env.BUCKET.delete(key);
    await touchLastUsed(env.BUCKET, auth);
    return jsonResponse({ key, deleted: true });
  }

  const deleted = await deleteDirectory(env.BUCKET, key);
  if (deleted) return deleted;
  await touchLastUsed(env.BUCKET, auth);
  return jsonResponse({ key, deleted: true, kind: "directory" });
};
