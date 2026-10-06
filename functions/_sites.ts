import {
  isCollectionObject,
  parseBasicAuthHeader,
  sha256Hex,
  timingSafeEqual,
} from "./api/_apikey";
import { contentDisposition } from "./api/_disposition";
import { isActiveSiteFile } from "./siteManifest";

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
  /** SHA-256 hex of the site access password; omit/empty = public site. Never return to clients. */
  passwordHash?: string;
  /** Optional custom hostname (e.g. blog.example.com); served at domain root. */
  hostname?: string;
  /** 最近一次「从网盘文件夹发布」（普通静态站 / 公开目录）的源文件夹；发布前占用检查用（#151） */
  source?: string;
  stats?: SiteStats;
}

export const SITE_PASSWORD_MAX_LEN = 128;

export async function hashSitePassword(password: string): Promise<string> {
  return sha256Hex(password);
}

/** True when Basic Auth password matches the stored hash (username ignored). */
export async function sitePasswordAuthorized(
  request: Request,
  passwordHash: string
): Promise<boolean> {
  const creds = parseBasicAuthHeader(request.headers.get("Authorization") || "");
  if (!creds || !creds.password) return false;
  const incoming = await sha256Hex(creds.password);
  return timingSafeEqual(incoming, passwordHash);
}

export function sitesUnauthorized(): Response {
  return new Response("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Davflare Site", charset="UTF-8"',
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function siteConfigKey(slug: string): string {
  return `${SITES_CONFIG_PREFIX}${slug}.json`;
}

/** Reverse index: one hostname → one slug (O(1) Host lookup). */
export const SITE_HOSTNAME_PREFIX = "_$flaredrive$/site-hostnames/";

export function siteHostnameKey(hostname: string): string {
  return `${SITE_HOSTNAME_PREFIX}${normalizeHostname(hostname)}`;
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

/**
 * 记下这个站点最近一次发布的源文件夹（null = 不是从单个文件夹发布，清掉旧值）。
 * 配置不存在且无需记录时不写，避免为相册 / 文档站凭空生成配置文件。
 */
export async function recordSiteSource(
  bucket: R2Bucket,
  slug: string,
  source: string | null
): Promise<void> {
  const existing = await loadSiteConfig(bucket, slug);
  if (!existing && !source) return;
  const config: SiteConfig = { ...(existing || {}), slug };
  if ((config.source || null) === source) return;
  if (source) config.source = source;
  else delete config.source;
  await bucket.put(siteConfigKey(slug), JSON.stringify(config), {
    httpMetadata: { contentType: "application/json" },
  });
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
  avif: "image/avif",
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

/** Strip scheme/path/port/trailing dot; lowercase. Empty if unusable. */
export function normalizeHostname(raw: string | undefined | null): string {
  let value = (raw || "").trim().toLowerCase();
  if (!value) return "";
  value = value.replace(/^https?:\/\//, "");
  value = value.split("/")[0] || "";
  value = value.split(":")[0] || "";
  value = value.replace(/\.$/, "");
  return value;
}

const HOSTNAME_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** DNS hostname (labels + dots). Rejects IPs, empty, overly long, or invalid labels. */
export function isValidHostname(raw: string): boolean {
  const host = normalizeHostname(raw);
  if (!host || host.length > 253) return false;
  if (host.includes("..")) return false;
  // Reject IPv4 / bare numbers that are not DNS names we want for custom domains.
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return false;
  const labels = host.split(".");
  if (labels.length < 2) return false; // require at least one dot (e.g. blog.example.com)
  return labels.every((label) => HOSTNAME_LABEL_RE.test(label));
}

export async function loadSlugForHostname(
  bucket: R2Bucket,
  hostname: string
): Promise<string | null> {
  const host = normalizeHostname(hostname);
  if (!host || !isValidHostname(host)) return null;
  const object = await bucket.get(siteHostnameKey(host));
  if (object === null) return null;
  try {
    const text = (await object.text()).trim().toLowerCase();
    if (!isValidSlug(text)) return null;
    return text;
  } catch {
    return null;
  }
}

export async function putHostnameIndex(
  bucket: R2Bucket,
  hostname: string,
  slug: string
): Promise<void> {
  const host = normalizeHostname(hostname);
  await bucket.put(siteHostnameKey(host), slug, {
    httpMetadata: { contentType: "text/plain; charset=utf-8" },
  });
}

export async function deleteHostnameIndex(
  bucket: R2Bucket,
  hostname: string | undefined | null
): Promise<void> {
  const host = normalizeHostname(hostname);
  if (!host) return;
  await bucket.delete(siteHostnameKey(host));
}

/**
 * Map a custom-hostname request path onto sites/{slug}/… at the domain root
 * (no slug segment in the URL).
 */
export function parseSitesRootPath(
  pathname: string,
  slug: string
): ParsedSitePath | { ok: false; reason: string } {
  const normalizedSlug = slug.toLowerCase();
  if (!SLUG_RE.test(normalizedSlug)) return { ok: false, reason: "bad slug" };
  const raw = pathname.replace(/\\/g, "/");
  const parts = raw.split("/").map(decodeSegment).filter(Boolean);
  if (
    parts.some(
      (part) => part === ".." || part.includes("/") || part.includes("_$flaredrive$")
    )
  ) {
    return { ok: false, reason: "bad path" };
  }
  if (parts.length === 0) {
    return {
      ok: true,
      slug: normalizedSlug,
      key: `${SITES_PREFIX}${normalizedSlug}/index.html`,
      tryIndex: false,
    };
  }
  const file = parts.join("/");
  if (raw.endsWith("/")) {
    return {
      ok: true,
      slug: normalizedSlug,
      key: `${SITES_PREFIX}${normalizedSlug}/${file.replace(/\/$/, "")}/index.html`,
      tryIndex: false,
    };
  }
  const hasDot = parts[parts.length - 1].includes(".");
  return {
    ok: true,
    slug: normalizedSlug,
    key: `${SITES_PREFIX}${normalizedSlug}/${file}`,
    tryIndex: !hasDot,
  };
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

export interface ParsedSitePath {
  ok: true;
  slug: string;
  key: string;
  /** 无扩展名、不带结尾斜杠：对象不存在时尝试 `{key}/index.html`（命中则 301 到带斜杠地址） */
  tryIndex: boolean;
  /** 站点根不带结尾斜杠：无需读 R2，直接 301 到带斜杠地址 */
  redirectToSlash?: boolean;
}

export function parseSitesPath(
  pathname: string
): ParsedSitePath | { ok: false; reason: string } {
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
    // `/{slug}` 不带结尾斜杠：页面里的相对链接会解析到域名根（#145），由调用方 301 到 `/{slug}/`
    if (!trailingSlash) {
      return {
        ok: true,
        slug,
        key: `${SITES_PREFIX}${slug}/index.html`,
        tryIndex: false,
        redirectToSlash: true,
      };
    }
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

/**
 * 网盘里的「文件夹」对象（#157）：WebDAV MKCOL、网页「新建文件夹」、上传 API 建的目录标记
 * （0 字节，Content-Type application/x-directory 或 resourcetype <collection />），
 * 以及 S3 工具常见的以 `/` 结尾的 key。站点上它们是目录，绝不能当文件 200 返回。
 */
export function isSiteFolderMarker(
  key: string,
  object: { httpMetadata?: R2HTTPMetadata; customMetadata?: Record<string, string> } | null
): boolean {
  if (!object) return false;
  return key.endsWith("/") || isCollectionObject(object);
}

export function indexFallbackKey(key: string): string {
  return key.endsWith("/") ? `${key}index.html` : `${key}/index.html`;
}

/**
 * 目录地址补结尾斜杠（#145）：`/{slug}` → `/{slug}/`、`/{slug}/sub` → `/{slug}/sub/`，保留查询串。
 * Location 用绝对地址，避免 `//evil.com` 这类路径被当成协议相对地址的开放跳转。
 */
export function sitesSlashRedirect(
  requestUrl: string,
  options?: { privateCache?: boolean }
): Response {
  const url = new URL(requestUrl);
  const location = `${url.origin}${url.pathname.replace(/\/+$/, "")}/${url.search}`;
  const headers = new Headers({
    Location: location,
    "Content-Type": "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex",
  });
  if (options?.privateCache) {
    headers.set("Cache-Control", "private, max-age=60");
    headers.set("Vary", "Authorization");
  } else {
    headers.set("Cache-Control", "public, max-age=300");
  }
  return new Response(null, { status: 301, headers });
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

/** If-None-Match 是否命中当前 ETag（忽略弱校验前缀，支持逗号列表与 *）。 */
export function etagMatches(ifNoneMatch: string | null | undefined, etag: string | undefined): boolean {
  if (!ifNoneMatch || !etag) return false;
  const strip = (value: string) => value.trim().replace(/^W\//, "");
  const target = strip(etag);
  return ifNoneMatch.split(",").some((candidate) => {
    const value = candidate.trim();
    return value === "*" || strip(value) === target;
  });
}

/**
 * 把服务规则编进 ETag（#170）：同一份字节，强制下载 / 密码站的响应头不同，ETag 也必须不同。
 * 否则站点换类型后，边缘或浏览器拿旧 ETag 回源得到 304，会继续用缓存里不带 attachment / sandbox 的旧响应头。
 */
export function siteVariantEtag(
  etag: string | undefined,
  variant: { download?: boolean; privateCache?: boolean }
): string | undefined {
  if (!etag) return etag;
  const suffix = `${variant.download ? "-dl" : ""}${variant.privateCache ? "-p" : ""}`;
  if (!suffix) return etag;
  const weak = etag.startsWith("W/");
  const raw = weak ? etag.slice(2) : etag;
  const inner = raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2 ? raw.slice(1, -1) : raw;
  return `${weak ? "W/" : ""}"${inner}${suffix}"`;
}

function notModifiedSince(ifModifiedSince: string | null | undefined, lastModified: Date | null): boolean {
  if (!ifModifiedSince || !lastModified) return false;
  const since = Date.parse(ifModifiedSince);
  if (!Number.isFinite(since)) return false;
  return Math.floor(lastModified.getTime() / 1000) <= Math.floor(since / 1000);
}

export function sitesResponse(
  object: { body: ReadableStream | null; httpEtag?: string; uploaded?: Date },
  key: string,
  head: boolean,
  options?: {
    privateCache?: boolean;
    download?: boolean;
    ifNoneMatch?: string | null;
    ifModifiedSince?: string | null;
    /** 服务规则（清单）的修改时间：Last-Modified 取它和文件本身的较新者（#170） */
    policyUpdatedAt?: Date | null;
  }
) {
  const headers = new Headers();
  headers.set("Content-Type", mimeForKey(key));
  headers.set("X-Content-Type-Options", "nosniff");
  if (options?.download) {
    // 生成型站点里的 html/svg/xml/js（#146）：强制下载；万一客户端无视 Content-Disposition，
    // CSP sandbox 也让它在不透明源里打开，脚本碰不到共享站点域名
    headers.set("Content-Disposition", contentDisposition(key.split("/").pop() || "", "attachment"));
    headers.set("Content-Security-Policy", "sandbox");
  }
  // 站点规则（访问密码、生成型站点的强制下载）随时可能变，缓存一律先回源确认（#156）：
  // no-cache = 可以存，但每次使用前都要重新验证；配合 ETag，未变化时只回 304，不重传正文。
  // 这样设密码 / 换站点类型后，边缘和浏览器里的旧副本不会再被直接用掉。
  if (options?.privateCache) {
    // Password-gated sites must not land in shared CDN caches.
    headers.set("Cache-Control", "private, no-cache");
    headers.set("Vary", "Authorization");
  } else {
    headers.set("Cache-Control", "public, no-cache");
  }
  headers.set("X-Robots-Tag", "noindex");
  // html/svg/xml/js：边缘一律不存（#170）。响应头会随站点类型变（是否强制下载），
  // Cloudflare 边缘用 304 回源验证时不会更新已缓存的响应头，旧的内联响应会继续被提供。
  // 浏览器仍按 Cache-Control: no-cache 每次回源验证。
  if (isActiveSiteFile(key)) headers.set("CDN-Cache-Control", "no-store");
  const etag = siteVariantEtag(object.httpEtag, {
    download: options?.download,
    privateCache: options?.privateCache,
  });
  if (etag) headers.set("ETag", etag);
  // Last-Modified：Cloudflare 开着 Email Obfuscation 时会剥掉 HTML 的 ETag，浏览器只能靠它拿 304（#170）。
  // 取文件和服务规则（清单）的较新者：站点换类型时清单会重写，旧副本不会被 304 续命。
  const times = [object.uploaded, options?.policyUpdatedAt ?? undefined].filter(
    (value): value is Date => value instanceof Date && Number.isFinite(value.getTime())
  );
  const lastModified = times.length ? new Date(Math.max(...times.map((value) => value.getTime()))) : null;
  if (lastModified) headers.set("Last-Modified", lastModified.toUTCString());
  // RFC 9110：有 If-None-Match 时只看它，忽略 If-Modified-Since
  const notModified = options?.ifNoneMatch
    ? etagMatches(options.ifNoneMatch, etag)
    : notModifiedSince(options?.ifModifiedSince, lastModified);
  if (notModified) {
    // 不返回正文：把 R2 的读取流关掉，免得悬着
    try {
      void object.body?.cancel().catch(() => undefined);
    } catch {
      // ignore
    }
    return new Response(null, { status: 304, headers });
  }
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
