import {
  parseBasicAuthHeader,
  sha256Hex,
  timingSafeEqual,
} from "./api/_apikey";

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
): { ok: true; slug: string; key: string; tryIndex: boolean } | { ok: false; reason: string } {
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

export function sitesResponse(
  object: { body: ReadableStream | null; httpEtag?: string },
  key: string,
  head: boolean,
  options?: { privateCache?: boolean }
) {
  const headers = new Headers();
  headers.set("Content-Type", mimeForKey(key));
  headers.set("X-Content-Type-Options", "nosniff");
  if (options?.privateCache) {
    // Password-gated sites must not land in shared CDN caches.
    headers.set("Cache-Control", "private, max-age=60");
    headers.set("Vary", "Authorization");
  } else {
    headers.set("Cache-Control", "public, max-age=60");
  }
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
