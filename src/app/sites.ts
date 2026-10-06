import { authFetch } from "./auth";
import { translate } from "./strings";
import type { Lang } from "./strings";
import pLimit from "p-limit";
import {
  ALBUM_MAX_BYTES,
  ALBUM_MAX_IMAGES,
  DIR_MAX_BYTES,
  DIR_MAX_FILES,
  DOCS_MAX_BYTES,
  DOCS_MAX_FILES,
  checkAlbumLimits,
  checkDirLimits,
  isRasterFileName,
} from "../../functions/sitePages";
import {
  DocsLookupIO,
  DocsMarkdown,
  ParsedDoc,
  desiredPageName,
  isMarkdownName,
  loadDocsMarkdown,
  parseDoc,
  renderDocsSite,
  resolveDocImages,
  sortDocs,
} from "./docsSite";
import { fetchPath, searchFiles } from "./transfer";
import { WEBDAV_ENDPOINT } from "./uploadTransfer";
import { FileItem } from "./types";
import { encodeKey, humanReadableSize } from "./utils";

export {
  ALBUM_MAX_BYTES,
  ALBUM_MAX_IMAGES,
  DIR_MAX_BYTES,
  DIR_MAX_FILES,
  DOCS_MAX_BYTES,
  DOCS_MAX_FILES,
  isRasterFileName,
};

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
  kind: "nav" | "album" | "dir" | "docs";
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

/** 公开目录客户端分批大小：每批约 50 个文件，串行发送。 */
export const DIR_PUBLISH_BATCH = 50;

/** 文件夹当前层：只取文件，子文件夹单独计数（不发布）。 */
export function partitionDirListing(items: FileItem[]): { files: FileItem[]; subdirs: number } {
  const files: FileItem[] = [];
  let subdirs = 0;
  for (const item of items) {
    if (item.isDir) subdirs += 1;
    else files.push(item);
  }
  return { files, subdirs };
}

/** 客户端预检（服务端会再复核）。超限返回可展示的原因；通过返回 null。 */
export function dirPublishBlockReason(files: FileItem[]): string | null {
  const bytes = albumSelectionBytes(files);
  const verdict = checkDirLimits(files.length, bytes);
  if (verdict.ok) return null;
  if (verdict.error === "no files") return translate("publishDirEmpty");
  if (verdict.error.startsWith("file limit exceeded")) {
    return translate("publishDirTooMany", { count: files.length, max: DIR_MAX_FILES });
  }
  if (verdict.error.startsWith("size limit exceeded")) {
    return translate("publishDirTooLarge", {
      size: humanReadableSize(bytes),
      max: humanReadableSize(DIR_MAX_BYTES),
    });
  }
  return translate("publishDirFailed");
}

/** plan 成功之后的失败：sites/{slug}/ 可能已部分更新，需要提示「重新发布即可修复」。 */
export class SitePublishInterruptedError extends Error {
  readonly reason: string;
  constructor(reason: string, kind: "dir" | "docs" = "dir") {
    super(translate(kind === "docs" ? "publishDocsInterrupted" : "publishDirInterrupted", { reason }));
    this.name = "SitePublishInterruptedError";
    this.reason = reason;
  }
}

export type DirPublishProgress =
  | { phase: "plan" }
  | { phase: "copy"; done: number; total: number }
  | { phase: "finish"; done: number; total: number };

async function postSites(body: unknown): Promise<Response> {
  return authFetch("/api/sites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * 把文件夹当前层文件分批复制进 sites/{slug}/ 并生成列表页：
 * plan（服务端列目录、复核上限、分配文件名）→ copy × N（每批 batchSize 个，串行）→ finish（写 index.html 与清单）。
 */
export async function publishDirSite(
  slug: string,
  source: string,
  options?: {
    lang?: Lang;
    title?: string;
    batchSize?: number;
    onProgress?: (progress: DirPublishProgress) => void;
  }
): Promise<PublishGeneratedResult> {
  const normalizedSlug = slug.trim().toLowerCase();
  if (!isValidSiteSlug(normalizedSlug)) {
    throw new Error(translate("publishSiteBadSlug"));
  }
  options?.onProgress?.({ phase: "plan" });
  const planResponse = await postSites({
    slug: normalizedSlug,
    dir: { phase: "plan", source, lang: options?.lang, title: options?.title },
  });
  if (!planResponse.ok) {
    throw new Error((await planResponse.text()) || translate("publishDirFailed"));
  }
  const plan = (await planResponse.json()) as {
    planId: string;
    files: string[];
    total: number;
  };
  const total = plan.files.length;
  const batchSize = Math.max(1, Math.min(options?.batchSize ?? DIR_PUBLISH_BATCH, 60));
  let done = 0;
  options?.onProgress?.({ phase: "copy", done, total });
  try {
    for (let start = 0; start < total; start += batchSize) {
      const files = plan.files.slice(start, start + batchSize);
      const response = await postSites({
        slug: normalizedSlug,
        dir: { phase: "copy", planId: plan.planId, files },
      });
      if (!response.ok) {
        throw new Error((await response.text()) || translate("publishDirFailed"));
      }
      done += files.length;
      options?.onProgress?.({ phase: "copy", done, total });
    }
    options?.onProgress?.({ phase: "finish", done, total });
    const finish = await postSites({
      slug: normalizedSlug,
      dir: { phase: "finish", planId: plan.planId },
    });
    if (!finish.ok) {
      throw new Error((await finish.text()) || translate("publishDirFailed"));
    }
    return (await finish.json()) as PublishGeneratedResult;
  } catch (error) {
    const reason = error instanceof Error && error.message ? error.message : translate("publishDirFailed");
    throw new SitePublishInterruptedError(reason);
  }
}

// ---------------------------------------------------------------- 文档站

export const DOCS_PUBLISH_BATCH = 50;
/** 每次 put 请求里 html 的总字节上限（远低于 Pages 100MB 请求体上限）。 */
export const DOCS_PUT_BATCH_BYTES = 4 * 1024 * 1024;

export function partitionMarkdownFiles(items: FileItem[]): { docs: FileItem[]; ignored: number } {
  const docs = items.filter((item) => !item.isDir && isMarkdownName(item.name));
  return { docs, ignored: items.length - docs.length };
}

function docsLimitReason(docs: number, images: number, bytes: number): string | null {
  if (docs <= 0) return translate("publishDocsEmpty");
  if (docs + images > DOCS_MAX_FILES) {
    return translate("publishDocsTooMany", {
      count: docs + images,
      docs,
      images,
      max: DOCS_MAX_FILES,
    });
  }
  if (bytes > DOCS_MAX_BYTES) {
    return translate("publishDocsTooLarge", {
      size: humanReadableSize(bytes),
      max: humanReadableSize(DOCS_MAX_BYTES),
    });
  }
  return null;
}

/** 读 Markdown 之前先按数量/大小挡一次，免得下载一大堆再报超限。 */
export function docsSourceBlockReason(docs: FileItem[]): string | null {
  return docsLimitReason(docs.length, 0, albumSelectionBytes(docs));
}

export interface DocsPrepared {
  md: DocsMarkdown;
  docs: ParsedDoc[];
  images: FileItem[];
  byRef: Map<string, string>;
  missing: number;
  /** Markdown 原文 + 图片的字节数（前端估算；服务端按实际 html 复核） */
  bytes: number;
}

export function docsPublishBlockReason(prepared: Pick<DocsPrepared, "docs" | "images" | "bytes">): string | null {
  return docsLimitReason(prepared.docs.length, prepared.images.length, prepared.bytes);
}

export interface DocsPrepareIO extends DocsLookupIO {
  readText: (key: string) => Promise<string>;
}

async function readDriveText(key: string): Promise<string> {
  const response = await authFetch(`${WEBDAV_ENDPOINT}${encodeKey(key)}`);
  if (!response.ok) throw new Error(key.split("/").pop() || key);
  return response.text();
}

export const defaultDocsIO: DocsPrepareIO = {
  readText: readDriveText,
  listDir: (dir) => fetchPath(dir ? `${dir}/` : ""),
  search: async (name) => (await searchFiles(name, undefined, 50)).items,
};

/** 读 Markdown、解析、在网盘里找被引用的栅格图片。 */
export async function prepareDocsPublish(
  files: FileItem[],
  io: DocsPrepareIO = defaultDocsIO
): Promise<DocsPrepared> {
  const md = await loadDocsMarkdown();
  const limit = pLimit(4);
  const parsed = await Promise.all(
    files.map((file) =>
      limit(async () => parseDoc(md, file, await io.readText(file.key)))
    )
  );
  const docs = sortDocs(parsed);
  const resolved = await resolveDocImages(docs, io);
  const bytes =
    docs.reduce((sum, doc) => sum + (Number.isFinite(doc.size) ? doc.size : 0), 0) +
    albumSelectionBytes(resolved.images);
  return { md, docs, images: resolved.images, byRef: resolved.byRef, missing: resolved.missing, bytes };
}

export type DocsPublishProgress =
  | { phase: "plan" }
  | { phase: "upload"; done: number; total: number }
  | { phase: "finish"; done: number; total: number };

function chunkPages(pages: Array<{ name: string; html: string }>, maxItems: number) {
  const encoder = new TextEncoder();
  const batches: Array<Array<{ name: string; html: string }>> = [];
  let current: Array<{ name: string; html: string }> = [];
  let bytes = 0;
  for (const page of pages) {
    const size = encoder.encode(page.html).length;
    if (current.length && (current.length >= maxItems || bytes + size > DOCS_PUT_BATCH_BYTES)) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(page);
    bytes += size;
  }
  if (current.length) batches.push(current);
  return batches;
}

export async function publishDocsSite(
  slug: string,
  prepared: DocsPrepared,
  options?: {
    lang?: Lang;
    title?: string;
    batchSize?: number;
    onProgress?: (progress: DocsPublishProgress) => void;
  }
): Promise<PublishGeneratedResult> {
  const normalizedSlug = slug.trim().toLowerCase();
  if (!isValidSiteSlug(normalizedSlug)) {
    throw new Error(translate("publishSiteBadSlug"));
  }
  const reason = docsPublishBlockReason(prepared);
  if (reason) throw new Error(reason);
  const lang = options?.lang === "zh" ? "zh" : "en";
  const title = (options?.title || "").trim() || translate("siteDocsHeading");
  options?.onProgress?.({ phase: "plan" });
  const planResponse = await postSites({
    slug: normalizedSlug,
    docs: {
      phase: "plan",
      pages: prepared.docs.map(desiredPageName),
      images: prepared.images.map((image) => image.key),
      lang,
      title,
    },
  });
  if (!planResponse.ok) {
    throw new Error((await planResponse.text()) || translate("publishDocsFailed"));
  }
  const plan = (await planResponse.json()) as { planId: string; pages: string[]; images: string[] };
  if (plan.pages.length !== prepared.docs.length || plan.images.length !== prepared.images.length) {
    throw new Error(translate("publishDocsFailed"));
  }
  const imageRels = new Map(prepared.images.map((image, index) => [image.key, plan.images[index]]));
  const site = renderDocsSite(prepared.md, {
    lang,
    title,
    docs: prepared.docs,
    pageNames: plan.pages,
    byRef: prepared.byRef,
    imageRels,
  });
  const batchSize = Math.max(1, Math.min(options?.batchSize ?? DOCS_PUBLISH_BATCH, 60));
  const total = plan.images.length + site.pages.length + 1;
  let done = 0;
  options?.onProgress?.({ phase: "upload", done, total });
  const send = async (body: Record<string, unknown>) => {
    const response = await postSites({ slug: normalizedSlug, docs: { planId: plan.planId, ...body } });
    if (!response.ok) throw new Error((await response.text()) || translate("publishDocsFailed"));
    return response;
  };
  try {
    for (let start = 0; start < plan.images.length; start += batchSize) {
      const files = plan.images.slice(start, start + batchSize);
      await send({ phase: "copy", files });
      done += files.length;
      options?.onProgress?.({ phase: "upload", done, total });
    }
    // 首页最后上传：中途失败时旧首页还在，不会指向半套新页面
    for (const batch of [...chunkPages(site.pages, batchSize), [{ name: "index.html", html: site.index }]]) {
      await send({ phase: "put", pages: batch });
      done += batch.length;
      options?.onProgress?.({ phase: "upload", done, total });
    }
    options?.onProgress?.({ phase: "finish", done, total });
    const finish = await send({ phase: "finish" });
    return (await finish.json()) as PublishGeneratedResult;
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : translate("publishDocsFailed");
    throw new SitePublishInterruptedError(message, "docs");
  }
}
