import {
  indexFallbackKey,
  isSitesHost,
  loadSiteConfig,
  parseSitesPath,
  siteNotFoundKey,
  siteSpaKey,
  sitesNotFound,
  sitesNotFoundPage,
  sitesResponse,
} from "./_sites";

interface SitesEnv {
  BUCKET: R2Bucket;
  SITES_HOST?: string;
}

export const onRequest: PagesFunction<SitesEnv> = async (context) => {
  const host = context.request.headers.get("Host") || new URL(context.request.url).host;
  if (!isSitesHost(host, context.env.SITES_HOST)) {
    return context.next();
  }

  const method = context.request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const parsed = parseSitesPath(new URL(context.request.url).pathname);
  if (!parsed.ok) return sitesNotFound();

  let key = parsed.key;
  let object = await context.env.BUCKET.get(key);
  if (!object && parsed.tryIndex) {
    key = indexFallbackKey(parsed.key);
    object = await context.env.BUCKET.get(key);
  }
  if (!object) {
    // SPA/404 兜底：仅在最终 miss 时读一次站点配置，正常命中路径零额外 R2 读
    const config = await loadSiteConfig(context.env.BUCKET, parsed.slug);
    if (config?.spa) {
      const spaObject = await context.env.BUCKET.get(siteSpaKey(parsed.slug));
      if (spaObject) {
        return sitesResponse(
          { body: spaObject.body, httpEtag: spaObject.httpEtag },
          siteSpaKey(parsed.slug),
          method === "HEAD"
        );
      }
      return sitesNotFound();
    }
    const notFoundObject = await context.env.BUCKET.get(siteNotFoundKey(parsed.slug));
    if (notFoundObject) {
      return sitesNotFoundPage({ body: notFoundObject.body }, method === "HEAD");
    }
    return sitesNotFound();
  }

  return sitesResponse(
    { body: object.body, httpEtag: object.httpEtag },
    key,
    method === "HEAD"
  );
};
