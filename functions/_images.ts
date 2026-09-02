import { parseSitesPath } from "./_sites";

export const IMAGE_PREFIX = "_$flaredrive$/img/";

/** Unguessable id: 32 hex chars from 16 random bytes. Not the original filename. */
const IMAGE_ID_RE = /^[a-f0-9]{32}$/;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/avif",
  "image/bmp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

export function imageObjectKey(id: string): string {
  return `${IMAGE_PREFIX}${id}`;
}

export function createImageId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function isImageId(id: string): boolean {
  return IMAGE_ID_RE.test(id);
}

/** Match /i/{id} first (before slug sites). Invalid ids are not image routes. */
export function parseImagePath(
  pathname: string
): { ok: true; id: string } | { ok: false } {
  const raw = pathname.replace(/\\/g, "/");
  const parts = raw.split("/").filter(Boolean);
  if (parts.length !== 2 || parts[0] !== "i") return { ok: false };
  const id = parts[1];
  if (!IMAGE_ID_RE.test(id)) return { ok: false };
  return { ok: true, id };
}

export function isSvgContentType(
  contentType: string,
  filename?: string
): boolean {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("image/svg") || ct.includes("svg+xml")) return true;
  if (filename && filename.toLowerCase().endsWith(".svg")) return true;
  return false;
}

export function guessImageContentType(
  contentType: string | undefined | null,
  filename?: string
): string | null {
  const raw = (contentType || "").split(";")[0].trim().toLowerCase();
  if (raw && ALLOWED_IMAGE_TYPES.has(raw)) return raw;
  const name = (filename || "").toLowerCase();
  if (name.endsWith(".svg")) return "image/svg+xml";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".avif")) return "image/avif";
  if (name.endsWith(".bmp")) return "image/bmp";
  if (name.endsWith(".ico")) return "image/x-icon";
  return null;
}

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/\\/g, "/").split("/").pop() || "image";
  return cleaned.replace(/[^\w.\-()+ ]+/g, "_").slice(0, 128) || "image";
}

/** SVG must never open as a navigable document (attachment + nosniff). */
export function imageResponseHeaders(opts: {
  contentType: string;
  filename?: string;
  etag?: string;
}): Headers {
  const headers = new Headers();
  const svg = isSvgContentType(opts.contentType, opts.filename);
  headers.set(
    "Content-Type",
    svg ? "image/svg+xml" : opts.contentType || "application/octet-stream"
  );
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Robots-Tag", "noindex");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  if (svg) {
    const name = sanitizeFilename(opts.filename || "image.svg");
    headers.set("Content-Disposition", `attachment; filename="${name}"`);
  } else {
    headers.set("Content-Disposition", "inline");
  }
  if (opts.etag) headers.set("ETag", opts.etag);
  return headers;
}

export type SitesHostRoute =
  | { kind: "image"; id: string }
  | { kind: "site"; slug: string; key: string; tryIndex: boolean }
  | { kind: "notFound" };

/**
 * SITES_HOST routing: /i/{id} first (independent of the sites flag),
 * then slug static sites. Each flag 404s its own surface without deleting objects.
 */
export function resolveSitesHostRoute(
  pathname: string,
  flags: { sites: boolean; imageHost: boolean }
): SitesHostRoute {
  const image = parseImagePath(pathname);
  if (image.ok) {
    if (!flags.imageHost) return { kind: "notFound" };
    return { kind: "image", id: image.id };
  }
  if (!flags.sites) return { kind: "notFound" };
  const parsed = parseSitesPath(pathname);
  if (!parsed.ok) return { kind: "notFound" };
  return {
    kind: "site",
    slug: parsed.slug,
    key: parsed.key,
    tryIndex: parsed.tryIndex,
  };
}

export function publicImageUrl(sitesHost: string | null | undefined, id: string): string | null {
  if (!sitesHost) return null;
  return `https://${sitesHost}/i/${id}`;
}

export function imageMarkdown(url: string | null): string {
  return url ? `![](${url})` : "";
}
