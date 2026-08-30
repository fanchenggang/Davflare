export const SITES_PREFIX = "sites/";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

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
