import { authFetch } from "./auth";
import { translate } from "./strings";
import type { Lang } from "./strings";
import {
  ALBUM_MAX_BYTES,
  ALBUM_MAX_IMAGES,
  checkAlbumLimits,
  isRasterFileName,
} from "../../functions/sitePages";
import { FileItem } from "./types";
import { humanReadableSize } from "./utils";

export { ALBUM_MAX_BYTES, ALBUM_MAX_IMAGES, isRasterFileName };

export interface SiteStats {
  objects: number;
  size: number;
  cachedAt: string;
  truncated?: boolean;
}

export interface SiteInfo {
  slug: string;
  spa: boolean;
  /** True when an access password is set (hash never exposed). */
  passwordProtected?: boolean;
  /** Optional custom hostname served at domain root (e.g. blog.example.com). */
  hostname?: string | null;
  stats: SiteStats | null;
}

export interface SitesResponse {
  sitesHost: string | null;
  sites: SiteInfo[];
}

export async function listSites(withStats = false): Promise<SitesResponse> {
  const response = await authFetch(`/api/sites${withStats ? "?stats=1" : ""}`);
  if (!response.ok) throw new Error(translate("loadSitesFailed"));
  return response.json();
}

export interface SiteConfigPatch {
  spa?: boolean;
  /** Set a new access password; null or "" clears protection. */
  password?: string | null;
  /** Set custom hostname; null or "" clears it. */
  hostname?: string | null;
}

export async function updateSiteConfig(
  slug: string,
  patch: SiteConfigPatch
): Promise<{
  slug: string;
  spa: boolean;
  passwordProtected: boolean;
  hostname: string | null;
}> {
  const body: Record<string, unknown> = { slug };
  if (typeof patch.spa === "boolean") body.spa = patch.spa;
  if (Object.prototype.hasOwnProperty.call(patch, "password")) {
    body.password = patch.password;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "hostname")) {
    body.hostname = patch.hostname;
  }
  const response = await authFetch("/api/sites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error((await response.text()) || translate("siteConfigFailed"));
  }
  return response.json();
}

/** clear=true 只删文件（保留配置）；purge 连配置一起删，用于彻底移除站点 */
export async function deleteSite(slug: string, options?: { purge?: boolean }): Promise<number> {
  const params = new URLSearchParams({ slug });
  if (options?.purge) params.set("purge", "1");
  const response = await authFetch(`/api/sites?${params.toString()}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error((await response.text()) || translate("deleteSiteFailed"));
  }
  const data = (await response.json()) as { deleted?: number };
  return data.deleted ?? 0;
}

/** 站点访问地址；SITES_HOST 未配置时返回 null */
export function siteUrl(sitesHost: string | null, slug: string): string | null {
  if (!sitesHost) return null;
  return `${window.location.protocol}//${sitesHost}/${slug}/`;
}

/** Custom hostname URL at domain root; null when unset. */
export function siteHostnameUrl(hostname: string | null | undefined): string | null {
  const host = (hostname || "").trim().toLowerCase();
  if (!host) return null;
  return `${window.location.protocol}//${host}/`;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function isValidSiteSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

/** Turn a folder name into a default site slug (lowercase, dashes, max 63). */
export function suggestSiteSlug(folderName: string): string {
  const normalized = folderName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  const started = normalized.replace(/^[^a-z0-9]+/, "");
  const clipped = (started || "site").slice(0, 63).replace(/-+$/, "");
  return clipped || "site";
}

export interface PublishSiteResult {
  slug: string;
  source: string;
  copied: number;
  sitesHost: string | null;
}

/** Copy a drive folder onto sites/{slug}/ (overwrite same names; SPA config kept). */
export async function publishSite(
  source: string,
  slug: string
): Promise<PublishSiteResult> {
  const normalizedSlug = slug.trim().toLowerCase();
  if (!isValidSiteSlug(normalizedSlug)) {
    throw new Error(translate("publishSiteBadSlug"));
  }
  const response = await authFetch("/api/sites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug: normalizedSlug, source }),
  });
  if (!response.ok) {
    throw new Error((await response.text()) || translate("publishSiteFailed"));
  }
  return response.json();
}

export interface PublishGeneratedResult {
  slug: string;
  kind: "nav" | "album";
  copied: number;
  sitesHost: string | null;
  count?: number;
  bytes?: number;
}

export interface NavPublishGroup {
  name: string;
  links: Array<{ title: string; href: string }>;
}

/** 书签数据生成导航页并写入 sites/{slug}/index.html（不拷贝网盘文件夹）。 */
export async function publishNavSite(
  slug: string,
  nav: { lang?: Lang; title?: string; groups: NavPublishGroup[] }
): Promise<PublishGeneratedResult> {
  const normalizedSlug = slug.trim().toLowerCase();
  if (!isValidSiteSlug(normalizedSlug)) {
    throw new Error(translate("publishSiteBadSlug"));
  }
  const response = await authFetch("/api/sites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug: normalizedSlug, nav }),
  });
  if (!response.ok) {
    throw new Error((await response.text()) || translate("publishSiteFailed"));
  }
  return response.json();
}

export function partitionRasterFiles(files: FileItem[]): {
  images: FileItem[];
  ignored: number;
} {
  const images: FileItem[] = [];
  let ignored = 0;
  for (const file of files) {
    if (!file || file.isDir || !isRasterFileName(file.name)) ignored += 1;
    else images.push(file);
  }
  return { images, ignored };
}

export function albumSelectionBytes(files: FileItem[]): number {
  return files.reduce((sum, file) => sum + (Number.isFinite(file.size) ? file.size : 0), 0);
}

/** 客户端预检。超限返回可展示的原因；通过返回 null。 */
export function albumPublishBlockReason(images: FileItem[]): string | null {
  const bytes = albumSelectionBytes(images);
  const verdict = checkAlbumLimits(images.length, bytes);
  if (verdict.ok) return null;
  if (verdict.error === "no album images") return translate("publishAlbumNoImages");
  if (verdict.error.startsWith("album image limit exceeded")) {
    return translate("publishAlbumTooMany", { count: images.length, max: ALBUM_MAX_IMAGES });
  }
  if (verdict.error.startsWith("album size limit exceeded")) {
    return translate("publishAlbumTooLarge", {
      size: humanReadableSize(bytes),
      max: humanReadableSize(ALBUM_MAX_BYTES),
    });
  }
  return translate("publishAlbumFailed");
}

/** 把选中的光栅图片复制进 sites/{slug}/ 并生成相册首页。 */
export async function publishAlbumSite(
  slug: string,
  files: string[],
  options?: { lang?: Lang; title?: string }
): Promise<PublishGeneratedResult> {
  const normalizedSlug = slug.trim().toLowerCase();
  if (!isValidSiteSlug(normalizedSlug)) {
    throw new Error(translate("publishSiteBadSlug"));
  }
  const response = await authFetch("/api/sites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slug: normalizedSlug,
      album: { lang: options?.lang, title: options?.title, files },
    }),
  });
  if (!response.ok) {
    const text = (await response.text()) || translate("publishAlbumFailed");
    throw new Error(text);
  }
  return response.json();
}
