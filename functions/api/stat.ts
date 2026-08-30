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

interface StatEnv {
  BUCKET: R2Bucket;
}

/** 单对象元数据：供 MCP stat 工具与脚本判断存在性/大小/类型 */
export const onRequestGet: PagesFunction<StatEnv> = async (context) => {
  const { request, env } = context;
  const auth = await authorizeApiKey(request, env.BUCKET);
  if (auth instanceof Response) return auth;

  const key = normalizeFileKey(
    new URL(request.url).searchParams.get("path")
  );
  if (key instanceof Response) {
    return textResponse("缺少 path 参数", 400);
  }
  if (isInternalKey(key)) {
    return textResponse("禁止访问内部目录", 400);
  }

  const head = await env.BUCKET.head(key);
  if (head === null) {
    if (await isPrefixOnlyFolder(env.BUCKET, key)) {
      return jsonResponse({ key, kind: "directory", marker: false });
    }
    return textResponse("文件不存在", 404);
  }
  if (isCollectionObject(head)) {
    return jsonResponse({ key, kind: "directory", marker: true });
  }

  await touchLastUsed(env.BUCKET, auth);
  return jsonResponse({
    key,
    kind: "file",
    size: head.size,
    etag: head.httpEtag ?? null,
    uploaded: head.uploaded ? head.uploaded.toISOString() : null,
    contentType: head.httpMetadata?.contentType || "application/octet-stream",
  });
};
