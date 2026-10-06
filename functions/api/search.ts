import {
  isSessionOrKeyAuthorized,
  textResponse,
} from "./_apikey";

interface SearchEnv {
  BUCKET: R2Bucket;
  WEBDAV_USERNAME: string;
  WEBDAV_PASSWORD: string;
}

export const onRequestGet: PagesFunction<SearchEnv> = async (context) => {
  const { request, env } = context;

  if (
    !(await isSessionOrKeyAuthorized(
      request,
      env.BUCKET,
      env.WEBDAV_USERNAME,
      env.WEBDAV_PASSWORD
    ))
  ) {
    return textResponse("Unauthorized", 401);
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim();
  const requestedLimit = Number(url.searchParams.get("limit") || "100");
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 500)
    : 100;

  if (!query) {
    return new Response(
      JSON.stringify({ items: [], hasMore: false, nextCursor: undefined }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  const lower = query.toLowerCase();
  // 可选 prefix：只在这个目录子树里扫（文档站图片兜底搜索用，#153），也比全盘扫便宜得多
  const prefixRaw = (url.searchParams.get("prefix") || "").replace(/^\/+/, "");
  // 内部目录不可搜：以前是退回全盘扫描，现在直接返回空（#158）
  if (prefixRaw.startsWith("_$flaredrive$")) {
    return new Response(
      JSON.stringify({ items: [], hasMore: false, nextCursor: undefined }),
      { headers: { "Content-Type": "application/json" } }
    );
  }
  const prefix = prefixRaw || undefined;
  // match=name：只要文件名（不含目录）与 q 完全相同（不区分大小写）的结果。
  // 文档站图片兜底用它，常见文件名的子串命中不会把真正的结果挤出 limit（#147）。
  const exactName = url.searchParams.get("match") === "name";
  const items: Array<Record<string, unknown>> = [];
  let cursor: string | undefined = url.searchParams.get("cursor") || undefined;
  let nextCursor: string | undefined;
  let hasMore = false;
  let done = false;

  // 固定小步长扫描：凑满 limit 后继续扫完当前页，保证同页命中不丢；
  // 只有 R2 页还有后续（truncated）时才给 cursor 翻页。最后一页可能返回略多于 limit 条。
  const SCAN_PAGE = 100;

  while (!done) {
    const listing = await env.BUCKET.list({
      cursor,
      prefix,
      limit: SCAN_PAGE,
      include: ["httpMetadata", "customMetadata"],
    });

    for (const object of listing.objects) {
      if (object.key.startsWith("_$flaredrive$/")) continue;
      const keyLower = object.key.toLowerCase();
      if (exactName) {
        if (keyLower.slice(keyLower.lastIndexOf("/") + 1) !== lower) continue;
      } else if (!keyLower.includes(lower)) continue;

      items.push({
        key: object.key,
        size: object.size,
        uploaded: object.uploaded.toISOString(),
        contentType: object.httpMetadata?.contentType || "",
        thumbnail: object.customMetadata?.thumbnail || "",
      });
    }

    if (items.length >= limit) {
      if (listing.truncated) {
        hasMore = true;
        nextCursor = listing.cursor;
      }
      done = true;
      break;
    }
    if (!listing.truncated) {
      done = true;
    } else {
      cursor = listing.cursor;
    }
  }

  return new Response(JSON.stringify({ items, hasMore, nextCursor }), {
    headers: { "Content-Type": "application/json" },
  });
};
