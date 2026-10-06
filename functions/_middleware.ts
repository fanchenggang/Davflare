import { gateDriveProductRoute, loadFeatureFlags } from "./_flags";
import {
  imageObjectKey,
  imageResponseHeaders,
  resolveSitesHostRoute,
} from "./_images";
import {
  indexFallbackKey,
  isSiteFolderMarker,
  isSitesHost,
  loadSiteConfig,
  loadSlugForHostname,
  parseSitesRootPath,
  siteNotFoundKey,
  sitePasswordAuthorized,
  siteSpaKey,
  sitesNotFound,
  sitesNotFoundPage,
  sitesResponse,
  sitesSlashRedirect,
  sitesUnauthorized,
  SITES_PREFIX,
} from "./_sites";
import { SiteServePolicy, loadSiteServePolicy, siteFileForcesDownload } from "./siteManifest";

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
  parsed: { slug: string; key: string; tryIndex: boolean; redirectToSlash?: boolean }
): Promise<Response> {
  const method = context.request.method.toUpperCase();
  // 站点根不带斜杠：无条件跳转，不读 R2，也不泄露站点是否存在 / 是否加密（#145）
  if (parsed.redirectToSlash) return sitesSlashRedirect(context.request.url);
  // Password gate runs before any content (and before a future _redirects hook).
  // Load config once up front so SPA/404 reuse it without a second R2 get.
  const config = await loadSiteConfig(context.env.BUCKET, parsed.slug);
  const passwordHash = config?.passwordHash;
  const privateCache = Boolean(passwordHash);
  if (passwordHash) {
    if (!(await sitePasswordAuthorized(context.request, passwordHash))) {
      return sitesUnauthorized();
    }
  }

  // 生成型站点（公开目录 / 相册 / 文档站）里的 active 文件强制下载（#146）。
  // 清单只在请求 active 类型时才读，且与正文读取并行；同一请求内最多读一次。
  const sitePrefix = `${SITES_PREFIX}${parsed.slug}/`;
  let policyPromise: Promise<SiteServePolicy> | null = null;
  const forcesDownload = async (objectKey: string): Promise<boolean> => {
    const rel = objectKey.slice(sitePrefix.length);
    if (!siteFileForcesDownload("dir", rel)) return false; // 不是 active 类型 / 是首页：无需读清单
    policyPromise ??= loadSiteServePolicy(context.env.BUCKET, sitePrefix);
    const policy = await policyPromise;
    return siteFileForcesDownload(policy.kind, rel, policy.docsPages);
  };
  if (siteFileForcesDownload("dir", parsed.key.slice(sitePrefix.length))) {
    policyPromise = loadSiteServePolicy(context.env.BUCKET, sitePrefix);
  }

  const key = parsed.key;
  let object: R2ObjectBody | null = await context.env.BUCKET.get(key);
  // 文件夹标记对象（MKCOL / 新建文件夹 / 上传 API 建的目录）按目录处理，绝不当空文件 200 返回（#157）
  const folderMarker = isSiteFolderMarker(key, object);
  if (folderMarker) object = null; // 标记对象是 0 字节，不读正文
  if (!object && (parsed.tryIndex || folderMarker) && !key.endsWith("/")) {
    // `/{slug}/sub` 不是文件但 `sub/index.html` 存在：跳到 `/{slug}/sub/`，
    // 否则页面里的相对链接会按上一级目录解析（#145）。只需 head，不读正文。
    const indexHead = await context.env.BUCKET.head(indexFallbackKey(parsed.key));
    if (indexHead) return sitesSlashRedirect(context.request.url, { privateCache });
  }
  if (!object) {
    if (config?.spa) {
      const spaObject = await context.env.BUCKET.get(siteSpaKey(parsed.slug));
      if (spaObject) {
        return sitesResponse(
          { body: spaObject.body, httpEtag: spaObject.httpEtag },
          siteSpaKey(parsed.slug),
          method === "HEAD",
          { privateCache, ifNoneMatch: context.request.headers.get("If-None-Match") }
        );
      }
      return sitesNotFound();
    }
    const notFoundObject = await context.env.BUCKET.get(
      siteNotFoundKey(parsed.slug)
    );
    // 生成型站点里的 404.html 是复制进来的用户文件，不能当页面渲染（#146）
    if (notFoundObject && !(await forcesDownload(siteNotFoundKey(parsed.slug)))) {
      return sitesNotFoundPage({ body: notFoundObject.body }, method === "HEAD");
    }
    return sitesNotFound();
  }

  return sitesResponse(
    { body: object.body, httpEtag: object.httpEtag },
    key,
    method === "HEAD",
    {
      privateCache,
      download: await forcesDownload(key),
      ifNoneMatch: context.request.headers.get("If-None-Match"),
    }
  );
}

export const onRequest: PagesFunction<MiddlewareEnv> = async (context) => {
  const host =
    context.request.headers.get("Host") ||
    new URL(context.request.url).host;
  const url = new URL(context.request.url);
  const method = context.request.method.toUpperCase();

  if (isSitesHost(host, context.env.SITES_HOST)) {
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

  // Per-slug custom hostname: serve sites/{slug}/ at the domain root.
  // Order: hostname resolve → password gate (inside serveSlugSite) → content.
  // Skip non-GET/HEAD and drive product prefixes so the drive origin stays cheap.
  // (Custom hostnames should not shadow /api|/webdav|/mcp|/share.)
  const path = url.pathname;
  const skipCustomHostLookup =
    path === "/api" ||
    path.startsWith("/api/") ||
    path === "/webdav" ||
    path.startsWith("/webdav/") ||
    path === "/mcp" ||
    path.startsWith("/mcp/") ||
    path === "/share" ||
    path.startsWith("/share/");
  if ((method === "GET" || method === "HEAD") && !skipCustomHostLookup) {
    const customSlug = await loadSlugForHostname(context.env.BUCKET, host);
    if (customSlug) {
      const flags = await loadFeatureFlags(context.env.BUCKET);
      if (!flags.sites) return sitesNotFound();
      const parsed = parseSitesRootPath(path, customSlug);
      if (!parsed.ok) return sitesNotFound();
      return serveSlugSite(context, parsed);
    }
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
