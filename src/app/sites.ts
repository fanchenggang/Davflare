import { authFetch } from "./auth";
import { translate } from "./strings";

export interface SiteStats {
  objects: number;
  size: number;
  cachedAt: string;
  truncated?: boolean;
}

export interface SiteInfo {
  slug: string;
  spa: boolean;
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

export async function updateSiteConfig(slug: string, spa: boolean): Promise<void> {
  const response = await authFetch("/api/sites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, spa }),
  });
  if (!response.ok) {
    throw new Error((await response.text()) || translate("siteConfigFailed"));
  }
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
