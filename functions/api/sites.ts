import {
  SITES_PREFIX,
  SiteConfig,
  isValidSlug,
  loadSiteConfig,
  normalizeSitesHost,
  siteConfigKey,
} from "../_sites";
import { authorizeApiKey, verifyBasicAuth } from "./_apikey";

interface SitesApiEnv {
  BUCKET: R2Bucket;
  WEBDAV_USERNAME: string;
  WEBDAV_PASSWORD: string;
  SITES_HOST?: string;
}

const SITE_STATS_MAX_OBJECTS = 5000;
const SITE_STATS_TTL_MS = 10 * 60 * 1000;
const SITE_DELETE_MAX_OBJECTS = 5000;

// 会话（Basic）与 API key 均可管理站点：MCP sites 工具以密钥转发到此端点
async function isAuthorized(request: Request, env: SitesApiEnv) {
  if (verifyBasicAuth(request, env.WEBDAV_USERNAME, env.WEBDAV_PASSWORD)) {
    return true;
  }
  const keyAuth = await authorizeApiKey(request, env.BUCKET);
  return !(keyAuth instanceof Response);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function listSiteSlugs(bucket: R2Bucket): Promise<string[]> {
  const slugs: string[] = [];
  let cursor: string | undefined;
  do {
    const listing = await bucket.list({ prefix: SITES_PREFIX, delimiter: "/", cursor });
    for (const prefix of listing.delimitedPrefixes) {
      const slug = prefix.slice(SITES_PREFIX.length).replace(/\/$/, "");
      if (slug) slugs.push(slug);
    }
    if (!listing.truncated) break;
    cursor = listing.cursor;
  } while (true);
  return slugs;
}

/** 聚合站点文件数/总大小；缓存未过期直接复用，扫描封顶防大站超时 */
async function computeSiteStats(
  bucket: R2Bucket,
  slug: string,
  cached: SiteConfig["stats"]
): Promise<SiteConfig["stats"]> {
  if (cached && Date.now() - new Date(cached.cachedAt).getTime() < SITE_STATS_TTL_MS) {
    return cached;
  }
  let objects = 0;
  let size = 0;
  let truncated = false;
  let cursor: string | undefined;
  do {
    const listing = await bucket.list({ prefix: `${SITES_PREFIX}${slug}/`, cursor, limit: 500 });
    for (const object of listing.objects) {
      objects += 1;
      size += object.size;
      if (objects >= SITE_STATS_MAX_OBJECTS) {
        truncated = true;
        break;
      }
    }
    if (truncated || !listing.truncated) break;
    cursor = listing.cursor;
  } while (true);
  return { objects, size, cachedAt: new Date().toISOString(), ...(truncated ? { truncated: true } : {}) };
}

async function saveSiteConfig(bucket: R2Bucket, config: SiteConfig): Promise<void> {
  await bucket.put(siteConfigKey(config.slug), JSON.stringify(config), {
    httpMetadata: { contentType: "application/json" },
  });
}

export const onRequestGet: PagesFunction<SitesApiEnv> = async (context) => {
  const { request, env } = context;
  if (!(await isAuthorized(request, env))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const withStats = url.searchParams.get("stats") === "1";
  const statsSlug = url.searchParams.get("slug");

  const slugs = await listSiteSlugs(env.BUCKET);
  const sites = [];
  for (const slug of slugs) {
    const config = (await loadSiteConfig(env.BUCKET, slug)) || { slug };
    let stats = config.stats;
    if (withStats && (!statsSlug || statsSlug === slug)) {
      stats = await computeSiteStats(env.BUCKET, slug, config.stats);
      await saveSiteConfig(env.BUCKET, { ...config, slug, stats });
    }
    sites.push({ slug, spa: Boolean(config.spa), stats: stats || null });
  }

  return jsonResponse({
    sitesHost: normalizeSitesHost(env.SITES_HOST) || null,
    sites,
  });
};

export const onRequestPost: PagesFunction<SitesApiEnv> = async (context) => {
  const { request, env } = context;
  if (!(await isAuthorized(request, env))) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: { slug?: string; spa?: boolean };
  try {
    body = await request.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const slug = String(body.slug || "").trim().toLowerCase();
  if (!isValidSlug(slug)) {
    return new Response("Bad slug", { status: 400 });
  }

  // 只允许给已存在的站点改配置：前缀下至少要有一个对象
  const existing = await env.BUCKET.list({ prefix: `${SITES_PREFIX}${slug}/`, limit: 1 });
  if (existing.objects.length === 0) {
    return new Response("Site not found", { status: 404 });
  }

  const config = (await loadSiteConfig(env.BUCKET, slug)) || { slug };
  config.slug = slug;
  config.spa = Boolean(body.spa);
  await saveSiteConfig(env.BUCKET, config);

  return jsonResponse({ slug, spa: config.spa });
};

export const onRequestDelete: PagesFunction<SitesApiEnv> = async (context) => {
  const { request, env } = context;
  if (!(await isAuthorized(request, env))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const slug = (new URL(request.url).searchParams.get("slug") || "").trim().toLowerCase();
  if (!isValidSlug(slug)) {
    return new Response("Bad slug", { status: 400 });
  }

  // 分批删除站点对象（R2 单次最多 1000 个键），封顶防止超大站点拖垮请求。
  // 默认保留站点配置（重新部署同一 slug 时 SPA 开关等自动保留）；
  // purge=1 连配置一起删，用于彻底移除站点。
  const purge = new URL(request.url).searchParams.get("purge") === "1";
  let deleted = 0;
  let cursor: string | undefined;
  do {
    const listing = await env.BUCKET.list({
      prefix: `${SITES_PREFIX}${slug}/`,
      cursor,
      limit: 500,
    });
    const keys = listing.objects.map((object) => object.key);
    if (keys.length > 0) {
      await env.BUCKET.delete(keys);
      deleted += keys.length;
    }
    if (deleted >= SITE_DELETE_MAX_OBJECTS && (listing.truncated || keys.length > 0)) {
      return new Response(
        `站点对象超过 ${SITE_DELETE_MAX_OBJECTS}，请用 WebDAV/CLI 分批清理`,
        { status: 400 }
      );
    }
    if (!listing.truncated) break;
    cursor = listing.cursor;
  } while (true);

  if (purge) await env.BUCKET.delete(siteConfigKey(slug));
  return jsonResponse({ slug, deleted });
};
