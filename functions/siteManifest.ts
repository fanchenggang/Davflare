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

// ---- 生成型站点的文件服务策略（#146） ----
// 公开目录 / 相册把网盘里的文件原样复制进 sites/{slug}/，而所有站点共用 SITES_HOST 一个域名：
// 别人给的 x.html / x.svg 被直接打开时，脚本会在共享域名下执行。生成型站点里这些「会执行」的类型
// 一律以附件下载；普通静态站（没有清单）的 html/js 照常渲染。

/** 浏览器直接打开时可能执行脚本的扩展名（含按 MIME 表会被当成 html/svg/xml/js 的类型）。 */
const ACTIVE_SITE_EXTS = new Set([
  "html",
  "htm",
  "xhtml",
  "xht",
  "shtml",
  "svg",
  "svgz",
  "xml",
  "xsl",
  "xslt",
  "js",
  "mjs",
]);

export function isActiveSiteFile(rel: string): boolean {
  const base = rel.split("/").pop() || "";
  const dot = base.lastIndexOf(".");
  if (dot < 0) return false;
  return ACTIVE_SITE_EXTS.has(base.slice(dot + 1).toLowerCase());
}

/**
 * 生成型站点里这个相对路径是否必须以附件下载。
 * - 没有清单（普通静态站）：从不。
 * - 站点根 index.html（精确匹配，区分大小写）：生成的首页（index.html 是保留名，用户文件不会占用），照常渲染。
 * - 文档站：生成的 .html 页面照常渲染，其余 active 类型（svg/xml/js…）下载。
 * - 公开目录、相册、无法识别的 kind：所有 active 类型下载（宁严勿松）。
 * 非 active 类型（图片、pdf、文本…）本来就靠 nosniff 不会执行，保持内联，免得每个请求多读一次清单。
 */
export function siteFileForcesDownload(kind: string | null, rel: string): boolean {
  if (!kind) return false;
  // 只放行生成的首页本身（精确匹配）：手工放进去的 INDEX.HTML / Index.html 是另一个 R2 对象，照样下载
  if (rel === "index.html") return false;
  const lower = rel.toLowerCase();
  if (!isActiveSiteFile(lower)) return false;
  if (kind === "docs" && /\.html?$/.test(lower)) return false;
  return true;
}

const KIND_STRICTNESS: Record<string, number> = { docs: 1, album: 2, dir: 3 };

function stricterKind(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return (KIND_STRICTNESS[a] ?? 4) >= (KIND_STRICTNESS[b] ?? 4) ? a : b;
}

function manifestKindFromText(text: string): string {
  try {
    const data = JSON.parse(text) as { kind?: unknown } | null;
    if (data && typeof data === "object" && typeof data.kind === "string" && data.kind) return data.kind;
  } catch {
    // 损坏的清单按最严格处理
  }
  return "dir";
}

/**
 * 发布开始（复制任何文件之前）先写一份「预清单」（#146 跟进）：
 * 站点从这一刻起就按生成型站点服务，复制途中或中途放弃时已复制进来的 html/svg/js 也是下载。
 * - files：上次拥有的 + 本次计划写入的路径（与「未完成计划写过的路径也算自己拥有」的语义一致）；
 * - 同一份清单文件里原本的 kind 更严格时保留它（例如在公开目录上发布文档站：完成前仍按 dir 处理，
 *   旧目录里的 html 不会因为 docs 允许渲染 html 而在发布途中变成可执行）。
 * 另一份清单文件不动：服务端读两份取最严格，finish 时再清理。
 */
export async function writeEarlySiteManifest(
  bucket: R2Bucket,
  prefix: string,
  kind: SiteManifestKind,
  files: string[]
): Promise<void> {
  const name = manifestNameForKind(kind);
  let effective: string = kind;
  const existing = await bucket.get(`${prefix}${name}`);
  if (existing) effective = stricterKind(manifestKindFromText(await existing.text()), kind) || kind;
  const list = [...new Set([...files.filter((rel) => isSafeManifestRel(rel)), name])];
  await bucket.put(`${prefix}${name}`, JSON.stringify({ version: 1, kind: effective, files: list }), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
}

/**
 * 读 sites/{slug}/ 的清单得到站点 kind；没有清单返回 null（普通静态站）。
 * 两份清单都在时取更严格的 kind；清单损坏或读失败一律按 dir 处理（失败时宁可多下载、不可执行）。
 * 只在请求 active 类型时调用：两次 R2 读（get + head）并行，普通静态站的图片/css/字体不受影响。
 */
export async function loadSiteManifestKind(bucket: R2Bucket, prefix: string): Promise<string | null> {
  try {
    const [generic, album] = await Promise.all([
      bucket.get(`${prefix}${SITE_MANIFEST_NAME}`),
      bucket.head(`${prefix}${ALBUM_MANIFEST_NAME}`),
    ]);
    let kind: string | null = album ? "album" : null;
    if (generic) kind = stricterKind(kind, manifestKindFromText(await generic.text()));
    return kind;
  } catch {
    return "dir";
  }
}
