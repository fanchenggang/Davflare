interface SearchEnv {
  BUCKET: R2Bucket;
  WEBDAV_USERNAME: string;
  WEBDAV_PASSWORD: string;
}

function isAuthorized(request: Request, env: SearchEnv) {
  const authorization = request.headers.get("Authorization");
  const expected = `Basic ${btoa(
    `${env.WEBDAV_USERNAME}:${env.WEBDAV_PASSWORD}`
  )}`;
  return Boolean(authorization && authorization === expected);
}

export const onRequestGet: PagesFunction<SearchEnv> = async (context) => {
  const { request, env } = context;

  if (!isAuthorized(request, env)) {
    return new Response("Unauthorized", { status: 401 });
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
      limit: SCAN_PAGE,
      // @ts-ignore `include` is supported by R2 but missing from this types version.
      include: ["httpMetadata", "customMetadata"],
    });

    for (const object of listing.objects) {
      if (object.key.startsWith("_$flaredrive$/")) continue;
      if (!object.key.toLowerCase().includes(lower)) continue;

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
