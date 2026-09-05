import {
  isInternalKey,
  jsonResponse,
  normalizeDirKey,
  textResponse,
  verifyBasicAuth,
} from "./_apikey";

interface CountsEnv {
  BUCKET: R2Bucket;
  WEBDAV_USERNAME: string;
  WEBDAV_PASSWORD: string;
}

const MAX_COUNT_PATHS = 100;

// 统计目录的直接子项数：objects（含目录标记）+ delimitedPrefixes（虚拟目录），
// 与 PROPFIND Depth-1 的子项语义一致（不含目录自身），内部前缀排除。
async function countDirectChildren(
  bucket: R2Bucket,
  key: string
): Promise<number> {
  let count = 0;
  let cursor: string | undefined;
  do {
    const listing = await bucket.list({
      prefix: `${key}/`,
      delimiter: "/",
      cursor,
    });
    for (const object of listing.objects) {
      if (isInternalKey(object.key)) continue;
      count += 1;
    }
    for (const prefix of listing.delimitedPrefixes) {
      if (isInternalKey(prefix)) continue;
      count += 1;
    }
    if (!listing.truncated) break;
    cursor = listing.cursor;
  } while (true);
  return count;
}

/**
 * POST /api/counts  { paths: string[] }
 * 批量统计文件夹直接子项数，替代前端逐目录 PROPFIND 的 N+1 计数。
 * 单个路径失败不进结果（前端保留占位文案）。
 */
export const onRequestPost: PagesFunction<CountsEnv> = async (context) => {
  const { request, env } = context;
  if (!verifyBasicAuth(request, env.WEBDAV_USERNAME, env.WEBDAV_PASSWORD)) {
    return textResponse("Unauthorized", 401);
  }

  let body: { paths?: unknown };
  try {
    body = await request.json();
  } catch {
    return textResponse("Bad Request", 400);
  }
  const rawPaths = Array.isArray(body.paths) ? body.paths : [];
  const paths = rawPaths.map(String).slice(0, MAX_COUNT_PATHS);

  const counts: Record<string, number> = {};
  await Promise.all(
    paths.map(async (raw) => {
      const key = normalizeDirKey(raw);
      if (key instanceof Response) return;
      try {
        counts[key] = await countDirectChildren(env.BUCKET, key);
      } catch {
        // 单个目录统计失败静默跳过
      }
    })
  );
  return jsonResponse({ counts });
};
