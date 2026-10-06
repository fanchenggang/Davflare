// 生成型站点（相册 / 公开目录 / 文档站）的通用清单。
// 清单记录「这次发布写进 sites/{slug}/ 的相对路径」；再次发布同一 slug 时只删除清单里列过的路径，
// 不在清单里的用户文件原样保留（相册 #142 的覆盖语义）。
// 相册沿用历史文件名 .davflare-album.json（已发布的相册需要继续被识别），其它 kind 用 .davflare-manifest.json；
// 读取时两份都认，任何 kind 重新发布都能接管另一种 kind 留下的文件。

/** 相册清单：相对路径列表。不是图片，画廊不得引用它。 */
export const ALBUM_MANIFEST_NAME = ".davflare-album.json";

export function isSafeManifestRel(rel: string): boolean {
  if (!rel || rel.length > 500) return false;
  if (rel.startsWith("/") || rel.startsWith("\\")) return false;
  if (rel.includes("\\") || rel.includes("\u0000")) return false;
  if (rel.split("/").some((part) => !part || part === "." || part === "..")) return false;
  if (rel.includes("_$flaredrive$")) return false;
  return true;
}

export type SiteManifestKind = "album" | "dir" | "docs";

export const SITE_MANIFEST_NAME = ".davflare-manifest.json";
export const SITE_MANIFEST_NAMES = [SITE_MANIFEST_NAME, ALBUM_MANIFEST_NAME] as const;
/** 解析清单时的条目上限：最大的 kind（公开目录 500 个文件）加余量。 */
export const SITE_MANIFEST_MAX_ENTRIES = 2000;

export function manifestNameForKind(kind: SiteManifestKind): string {
  return kind === "album" ? ALBUM_MANIFEST_NAME : SITE_MANIFEST_NAME;
}

export function isReservedSiteName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === "index.html" || SITE_MANIFEST_NAMES.some((reserved) => reserved === lower);
}

export function parseSiteManifest(
  text: string,
  maxEntries = SITE_MANIFEST_MAX_ENTRIES
): { kind: string | null; files: string[] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { kind: null, files: [] };
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return { kind: null, files: [] };
  }
  const record = data as { kind?: unknown; files?: unknown };
  const kind = typeof record.kind === "string" ? record.kind : null;
  if (!Array.isArray(record.files)) return { kind, files: [] };
  const files: string[] = [];
  const seen = new Set<string>();
  for (const item of record.files) {
    if (typeof item !== "string") continue;
    if (!isSafeManifestRel(item)) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    files.push(item);
    if (files.length >= maxEntries) break;
  }
  return { kind, files };
}

export function serializeSiteManifest(kind: SiteManifestKind, files: string[]): string {
  return JSON.stringify({ version: 1, kind, files });
}

/**
 * 上次发布「拥有」的相对路径：两份清单列过的路径并集，外加实际存在的清单文件本身
 * （清单文件不在新清单里时也要一起清掉）。
 */
export async function loadOwnedSiteRels(bucket: R2Bucket, prefix: string): Promise<string[]> {
  const owned = new Set<string>();
  for (const name of SITE_MANIFEST_NAMES) {
    const object = await bucket.get(`${prefix}${name}`);
    if (!object) continue;
    owned.add(name);
    for (const rel of parseSiteManifest(await object.text()).files) owned.add(rel);
  }
  return [...owned];
}

/** R2 binding 的批量删除一次最多 1000 个 key。 */
export async function deleteKeysInChunks(bucket: R2Bucket, keys: string[]): Promise<void> {
  for (let start = 0; start < keys.length; start += 1000) {
    const chunk = keys.slice(start, start + 1000);
    if (chunk.length) await bucket.delete(chunk);
  }
}
