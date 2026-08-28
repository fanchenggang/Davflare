import {
  authorizeApiKey,
  isCollectionObject,
  isInternalKey,
  isPrefixOnlyFolder,
  jsonResponse,
  normalizeFileKey,
  textResponse,
  touchLastUsed,
} from "./_apikey";

interface DeleteEnv {
  BUCKET: R2Bucket;
}

export const onRequestDelete: PagesFunction<DeleteEnv> = async (context) => {
  const { request, env } = context;
  const auth = await authorizeApiKey(request, env.BUCKET);
  if (auth instanceof Response) return auth;

  const key = normalizeFileKey(new URL(request.url).searchParams.get("path"));
  if (key instanceof Response) return key;
  if (isInternalKey(key)) return textResponse("禁止访问内部目录", 400);

  const head = await env.BUCKET.head(key);
  if (head === null) {
    if (await isPrefixOnlyFolder(env.BUCKET, key)) {
      return textResponse("只能删除文件，不能删除目录", 400);
    }
    return textResponse("文件不存在", 404);
  }
  if (isCollectionObject(head)) {
    return textResponse("只能删除文件，不能删除目录", 400);
  }

  await env.BUCKET.delete(key);
  await touchLastUsed(env.BUCKET, auth);
  return jsonResponse({ key, deleted: true });
};
