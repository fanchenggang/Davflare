export const SITES_PREFIX = "sites/";

// 每站配置与统计缓存放内部前缀（与 shares 元数据同惯例），不会出现在 sites/ 列表里
export const SITES_CONFIG_PREFIX = "_$flaredrive$/sites/";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

/** 每站配置：spa 决定 miss 时是否回退 index.html；stats 为聚合缓存（懒计算） */
export interface SiteStats {
  objects: number;
  size: number;
  cachedAt: string;
  /** true 表示扫描达到封顶，统计为下限值 */
  truncated?: boolean;
}

export interface SiteConfig {
  slug: string;
  spa?: boolean;
  stats?: SiteStats;
}

export function siteConfigKey(slug: string): string {
  return `${SITES_CONFIG_PREFIX}${slug}.json`;
}

export function siteSpaKey(slug: string): string {
  return `${SITES_PREFIX}${slug}/index.html`;
}

export function siteNotFoundKey(slug: string): string {
  return `${SITES_PREFIX}${slug}/404.html`;
}

export async function loadSiteConfig(
  bucket: R2Bucket,
  slug: string
): Promise<SiteConfig | null> {
  const object = await bucket.get(siteConfigKey(slug));
  if (object === null) return null;
  try {
    const config = (await object.json()) as SiteConfig;
    if (config === null || typeof config !== "object") return null;
    return config;
  } catch {
    return null;
  }
}

const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  pdf: "application/pdf",
  wasm: "application/wasm",
  map: "application/json",
};

export function normalizeSitesHost(raw: string | undefined | null): string {
  return (raw || "").trim().toLowerCase().replace(/\.$/, "");
}

export function isSitesHost(requestHost: string, sitesHost: string | undefined | null): boolean {
  const want = normalizeSitesHost(sitesHost);
  if (!want) return false;
  const got = normalizeSitesHost(requestHost.split(":")[0]);
  return got === want;
}

export function mimeForKey(key: string): string {
  const base = key.split("/").pop() || "";
  const dot = base.lastIndexOf(".");
  if (dot < 0) return "application/octet-stream";
  const ext = base.slice(dot + 1).toLowerCase();
  return MIME[ext] || "application/octet-stream";
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function parseSitesPath(
  pathname: string
): { ok: true; slug: string; key: string; tryIndex: boolean } | { ok: false; reason: string } {
  const raw = pathname.replace(/\\/g, "/");
  // 逐段解码后校验：%2e%2e 之类的编码穿越同样被拦，编码斜杠视为非法；
  // 而文件名内部的 "a..b.html"、空格、中文等合法字符不再被误伤
  const parts = raw.split("/").map(decodeSegment).filter(Boolean);
  if (
    parts.some(
      (part) => part === ".." || part.includes("/") || part.includes("_$flaredrive$")
    )
  ) {
    return { ok: false, reason: "bad path" };
  }
  if (parts.length === 0) return { ok: false, reason: "missing slug" };
  const slug = parts[0].toLowerCase();
  if (!SLUG_RE.test(slug)) return { ok: false, reason: "bad slug" };
  const rest = parts.slice(1);
  const trailingSlash = raw.endsWith("/");
  if (rest.length === 0) {
    return { ok: true, slug, key: `${SITES_PREFIX}${slug}/index.html`, tryIndex: false };
  }
  const file = rest.join("/");
  if (trailingSlash) {
    return { ok: true, slug, key: `${SITES_PREFIX}${slug}/${file.replace(/\/$/, "")}/index.html`, tryIndex: false };
  }
  const hasDot = rest[rest.length - 1].includes(".");
  return {
    ok: true,
    slug,
    key: `${SITES_PREFIX}${slug}/${file}`,
    tryIndex: !hasDot,
  };
}

export function indexFallbackKey(key: string): string {
  return key.endsWith("/") ? `${key}index.html` : `${key}/index.html`;
}

export function sitesNotFound(): Response {
  return new Response("Not Found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}

export function sitesResponse(object: { body: ReadableStream | null; httpEtag?: string }, key: string, head: boolean) {
  const headers = new Headers();
  headers.set("Content-Type", mimeForKey(key));
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Cache-Control", "public, max-age=60");
  headers.set("X-Robots-Tag", "noindex");
  if (object.httpEtag) headers.set("ETag", object.httpEtag);
  return new Response(head ? null : object.body, { status: 200, headers });
}

/** 自定义 404 页：内容来自站点文件，404 状态不缓存，避免部署后拿到过期负缓存 */
export function sitesNotFoundPage(
  object: { body: ReadableStream | null },
  head: boolean
): Response {
  const headers = new Headers();
  headers.set("Content-Type", MIME.html);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Robots-Tag", "noindex");
  return new Response(head ? null : object.body, { status: 404, headers });
}
