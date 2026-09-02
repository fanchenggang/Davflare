import { gateDriveProductRoute, loadFeatureFlags } from "./_flags";
import {
  imageObjectKey,
  imageResponseHeaders,
  resolveSitesHostRoute,
} from "./_images";
import {
  indexFallbackKey,
  isSitesHost,
  loadSiteConfig,
  siteNotFoundKey,
  siteSpaKey,
  sitesNotFound,
  sitesNotFoundPage,
  sitesResponse,
} from "./_sites";

interface MiddlewareEnv {
  BUCKET: R2Bucket;
  SITES_HOST?: string;
}

async function serveImage(
  bucket: R2Bucket,
  id: string,
  head: boolean
): Promise<Response> {
  const object = await bucket.get(imageObjectKey(id));
  if (object === null) return sitesNotFound();
  const contentType =
    object.customMetadata?.contentType ||
    object.httpMetadata?.contentType ||
    "application/octet-stream";
  const filename = object.customMetadata?.name;
  const headers = imageResponseHeaders({
    contentType,
    filename,
    etag: object.httpEtag,
  });
  return new Response(head ? null : object.body, { status: 200, headers });
}

async function serveSlugSite(
  context: EventContext<MiddlewareEnv, any, any>,
  parsed: { slug: string; key: string; tryIndex: boolean }
): Promise<Response> {
  const method = context.request.method.toUpperCase();
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
    const notFoundObject = await context.env.BUCKET.get(
      siteNotFoundKey(parsed.slug)
    );
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
}

export const onRequest: PagesFunction<MiddlewareEnv> = async (context) => {
  const host =
    context.request.headers.get("Host") ||
    new URL(context.request.url).host;
  const url = new URL(context.request.url);

  if (isSitesHost(host, context.env.SITES_HOST)) {
    const method = context.request.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: {
          Allow: "GET, HEAD",
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }

    const flags = await loadFeatureFlags(context.env.BUCKET);
    const route = resolveSitesHostRoute(url.pathname, flags);
    if (route.kind === "notFound") return sitesNotFound();
    if (route.kind === "image") {
      return serveImage(context.env.BUCKET, route.id, method === "HEAD");
    }
    return serveSlugSite(context, route);
  }

  // Only hit R2 for product routes; static assets and /api/* skip the extra read.
  if (
    url.pathname === "/webdav" ||
    url.pathname.startsWith("/webdav/") ||
    url.pathname === "/mcp" ||
    url.pathname.startsWith("/mcp/")
  ) {
    const flags = await loadFeatureFlags(context.env.BUCKET);
    const blocked = gateDriveProductRoute(url.pathname, flags, context.request);
    if (blocked) return blocked;
  }

  return context.next();
};
