// 分批发布生成型站点（公开目录 kind:"dir"；文档站 kind:"docs" 复用同一通道与清单）。
// 一次请求做完会撞上 Pages Functions 免费版每次调用 1000 次 R2 子请求 / 10ms CPU 的上限，
// 所以拆成 plan → copy×N（客户端串行，每批约 50 个）→ finish 三步：
// - plan：服务端自己列源目录、复核上限、分配目标文件名，写一份内部计划；
// - copy：只复制计划里的条目（源 key 在 plan 时已校验为源目录的直接子项，复制前再校验一次）；
// - finish：确认全部复制完，写列表页 index.html 与清单，删除上次清单里不再需要的路径。
// 中途失败时 sites/{slug}/ 可能只更新了一部分；重新发布会把未完成计划写过的路径也视为「自己拥有的」，
// 不会因为重名而产生 xxx-2 副本，直接覆盖修复。
// 文档站：Markdown 在浏览器里渲染（Functions 不跑 markdown-it），所以多一个 put 阶段上传生成好的 html；
// 图片仍由服务端从网盘复制到 assets/，客户端只传计划里的目标名。
import {
  INTERNAL_PREFIX,
  isCollectionObject,
  isInternalKey,
  jsonResponse,
  normalizeDirKey,
  textResponse,
} from "./api/_apikey";
import { SITES_PREFIX, normalizeSitesHost, recordSiteSource } from "./_sites";
import {
  DIR_MAX_BYTES,
  DIR_MAX_FILES,
  DOCS_MAX_BYTES,
  DOCS_MAX_FILES,
  checkDirLimits,
  checkDocsLimits,
  rasterExtension,
  pageLabel,
  pageLang,
  renderDirPage,
  type PageLang,
  docsScopeOf,
  isInDocsScope,
  shortenFileName,
} from "./sitePages";
import {
  SITE_MANIFEST_NAME,
  deleteKeysInChunks,
  isReservedSiteName,
  isSafeManifestRel,
  loadOwnedSiteRels,
  serializeSiteManifest,
  writeEarlySiteManifest,
  type SiteManifestKind,
} from "./siteManifest";

export const SITE_PUBLISH_PLAN_PREFIX = `${INTERNAL_PREFIX}site-publish/`;
/** 单批条目上限：客户端每批 50 个，服务端留一点余量。 */
export const SITE_PUBLISH_BATCH_MAX = 60;
/** 文档站单篇 html 上限（远大于正常文档，防止一次请求塞进整站的量）。 */
export const DOCS_PAGE_MAX_BYTES = 10 * 1024 * 1024;
export const DOCS_ASSET_DIR = "assets";

const RASTER_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
};

export interface PlanCopyItem {
  /** 源对象 key */
  from: string;
  /** sites/{slug}/ 下的相对路径 */
  to: string;
  size: number;
  uploaded: string;
}

export interface SitePublishPlan {
  version: 1;
  id: string;
  kind: Extract<SiteManifestKind, "dir" | "docs">;
  slug: string;
  createdAt: string;
  lang: PageLang;
  title: string;
  source: string;
  subdirs: number;
  items: PlanCopyItem[];
  /** 上次清单 + 未完成计划写过的路径：finish 时不在新清单里的会被删除 */
  owned: string[];
  /** 已复制：to → 实际字节数 */
  done: Record<string, number>;
  /** 文档站：客户端渲染后上传的页面（含 index.html） */
  pages?: string[];
  /** 已上传页面：name → UTF-8 字节数 */
  pagesDone?: Record<string, number>;
}

export function sitePublishPlanKey(slug: string): string {
  return `${SITE_PUBLISH_PLAN_PREFIX}${slug}.json`;
}

/** key 必须是 source 的直接子项：前缀完全匹配，剩余部分非空、不含 / 与 \、不是 . / ..。 */
export function isDirectChildKey(source: string, key: string): boolean {
  if (!source || !key.startsWith(`${source}/`)) return false;
  const rest = key.slice(source.length + 1);
  if (!rest || rest === "." || rest === "..") return false;
  if (rest.includes("/") || rest.includes("\\")) return false;
  if (/[\u0000-\u001f]/.test(rest)) return false;
  return !isInternalKey(key);
}

/** 文档站图片源：普通网盘文件 key（不解码、不允许 . / .. / 空段 / 反斜杠 / 控制字符 / 内部目录）。 */
export function isPlainFileKey(key: string): boolean {
  if (!key || key.length > 1024 || key.startsWith("/") || key.endsWith("/")) return false;
  if (key.includes("\\") || /[\u0000-\u001f]/.test(key)) return false;
  if (key.split("/").some((part) => !part || part === "." || part === "..")) return false;
  return !isInternalKey(key);
}

function planTargets(plan: SitePublishPlan | null): string[] {
  if (!plan) return [];
  return [...plan.items.map((item) => item.to), ...(plan.pages ?? [])];
}

function sanitizeSiteName(name: string): string {
  let out = name.replace(/[\u0000-\u001f\u007f\\/]/g, "_").replace(/_\$flaredrive\$/g, "_flaredrive_");
  out = out.trim();
  if (!out || out === "." || out === "..") out = "file";
  // 截短时保留扩展名（以前直接 slice 会把 .html 截掉，长文件名让整次文档站发布 400，#153）
  return shortenFileName(out, 200);
}

function nameCandidate(name: string, attempt: number): string {
  if (attempt === 1) return name;
  const dot = name.lastIndexOf(".");
  if (dot > 0) return `${name.slice(0, dot)}-${attempt}${name.slice(dot)}`;
  return `${name}-${attempt}`;
}

/**
 * 给顶层文件分配站点内的文件名：保留原名；与「不属于本站清单的已有文件」、
 * 本次已分配的名字或保留名（index.html、清单文件）冲突时改成 stem-2.ext、stem-3.ext…
 * 比较不区分大小写（下载到不区分大小写的文件系统时不会互相覆盖）。
 */
export function allocateSiteFileNames(names: string[], blockedLower: Set<string>): string[] | null {
  const used = new Set<string>([...blockedLower].map((name) => name.toLowerCase()));
  const out: string[] = [];
  for (const raw of names) {
    const base = sanitizeSiteName(raw);
    let chosen: string | null = null;
    for (let attempt = 1; attempt <= 10000; attempt += 1) {
      const candidate = nameCandidate(base, attempt);
      if (isReservedSiteName(candidate)) continue;
      if (!isSafeManifestRel(candidate)) continue;
      if (used.has(candidate.toLowerCase())) continue;
      chosen = candidate;
      break;
    }
    if (!chosen) return null;
    used.add(chosen.toLowerCase());
    out.push(chosen);
  }
  return out;
}

function newPlanId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().replace(/-/g, "")
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

async function loadPlan(bucket: R2Bucket, slug: string): Promise<SitePublishPlan | null> {
  const object = await bucket.get(sitePublishPlanKey(slug));
  if (!object) return null;
  try {
    const plan = (await object.json()) as SitePublishPlan;
    if (!plan || plan.version !== 1 || !Array.isArray(plan.items)) return null;
    return plan;
  } catch {
    return null;
  }
}

async function savePlan(bucket: R2Bucket, plan: SitePublishPlan): Promise<void> {
  await bucket.put(sitePublishPlanKey(plan.slug), JSON.stringify(plan), {
    httpMetadata: { contentType: "application/json" },
  });
}

/** sites/{slug}/ 顶层已有的文件名（不含子目录内容）。 */
async function listTopLevelSiteNames(bucket: R2Bucket, prefix: string): Promise<string[]> {
  const names: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const listing = await bucket.list({ prefix, delimiter: "/", cursor });
    for (const object of listing.objects) names.push(object.key.slice(prefix.length));
    for (const sub of listing.delimitedPrefixes) names.push(sub.slice(prefix.length).replace(/\/$/, ""));
    if (!listing.truncated) break;
    cursor = listing.cursor;
  }
  return names;
}

async function getPlanForBatch(
  bucket: R2Bucket,
  slug: string,
  planId: unknown,
  kind: SitePublishPlan["kind"]
): Promise<SitePublishPlan | Response> {
  if (typeof planId !== "string" || !planId) return textResponse("bad planId", 400);
  const plan = await loadPlan(bucket, slug);
  if (!plan) return textResponse("publish plan not found", 409);
  if (plan.id !== planId) return textResponse("publish superseded by a newer publish", 409);
  // 旧计划文件没有 kind 时视为公开目录
  if ((plan.kind ?? "dir") !== kind) return textResponse("publish plan kind mismatch", 409);
  return plan;
}

export async function planDirPublish(
  bucket: R2Bucket,
  slug: string,
  body: { source?: unknown; lang?: unknown; title?: unknown }
): Promise<Response> {
  const source = normalizeDirKey(typeof body.source === "string" ? body.source : null);
  if (source instanceof Response) return source;
  const targetPrefix = `${SITES_PREFIX}${slug}`;
  if (source === targetPrefix || source.startsWith(`${targetPrefix}/`)) {
    return textResponse("source cannot be the target site folder", 400);
  }

  // 只列当前层：delimiter 把子目录聚合成 delimitedPrefixes
  const files: Array<{ key: string; name: string; size: number; uploaded: string }> = [];
  const subdirs = new Set<string>();
  let cursor: string | undefined;
  let sawAnything = false;
  for (;;) {
    const listing = await bucket.list({
      prefix: `${source}/`,
      delimiter: "/",
      cursor,
      include: ["httpMetadata", "customMetadata"],
    });
    for (const prefix of listing.delimitedPrefixes) {
      sawAnything = true;
      if (!isInternalKey(prefix.replace(/\/$/, ""))) subdirs.add(prefix.replace(/\/$/, ""));
    }
    for (const object of listing.objects) {
      sawAnything = true;
      if (isCollectionObject(object)) {
        subdirs.add(object.key);
        continue;
      }
      if (!isDirectChildKey(source, object.key)) continue;
      files.push({
        key: object.key,
        name: object.key.slice(source.length + 1),
        size: object.size,
        uploaded: object.uploaded.toISOString(),
      });
      if (files.length > DIR_MAX_FILES) {
        return textResponse(`file limit exceeded: >${DIR_MAX_FILES}`, 400);
      }
    }
    if (!listing.truncated) break;
    cursor = listing.cursor;
  }
  if (!sawAnything) {
    const marker = await bucket.head(source);
    if (!marker || !isCollectionObject(marker)) return textResponse("source folder not found", 404);
  }
  const bytes = files.reduce((sum, file) => sum + file.size, 0);
  const verdict = checkDirLimits(files.length, bytes);
  if (!verdict.ok) return textResponse(verdict.error, 400);

  files.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));

  const prefix = `${SITES_PREFIX}${slug}/`;
  const owned = new Set(await loadOwnedSiteRels(bucket, prefix));
  const stale = await loadPlan(bucket, slug);
  if (stale && stale.slug === slug) for (const rel of planTargets(stale)) owned.add(rel);
  const blocked = new Set<string>();
  for (const name of await listTopLevelSiteNames(bucket, prefix)) {
    if (!owned.has(name)) blocked.add(name.toLowerCase());
  }
  const names = allocateSiteFileNames(files.map((file) => file.name), blocked);
  if (!names) return textResponse("cannot allocate file names", 400);

  const lang = pageLang(body.lang);
  const titleRaw = typeof body.title === "string" ? body.title.trim() : "";
  const fallbackTitle = source.split("/").pop() || pageLabel(lang, "siteDirName");
  const plan: SitePublishPlan = {
    version: 1,
    id: newPlanId(),
    kind: "dir",
    slug,
    createdAt: new Date().toISOString(),
    lang,
    title: (titleRaw || fallbackTitle).slice(0, 200),
    source,
    subdirs: subdirs.size,
    items: files.map((file, index) => ({
      from: file.key,
      to: names[index],
      size: file.size,
      uploaded: file.uploaded,
    })),
    owned: [...owned],
    done: {},
  };
  await savePlan(bucket, plan);
  // 先写预清单把站点标成 dir，再开始复制（#146）；finish 会用正式清单覆盖它
  await writeEarlySiteManifest(bucket, prefix, "dir", [...owned, ...planTargets(plan), "index.html"]);
  return jsonResponse({
    slug,
    kind: "dir",
    planId: plan.id,
    total: plan.items.length,
    bytes,
    subdirs: plan.subdirs,
    files: plan.items.map((item) => item.to),
    batchMax: SITE_PUBLISH_BATCH_MAX,
  });
}

function copyItemAllowed(plan: SitePublishPlan, item: PlanCopyItem): boolean {
  if (!isSafeManifestRel(item.to)) return false;
  if (plan.kind === "docs") {
    const parts = item.to.split("/");
    return (
      parts.length === 2 &&
      parts[0] === DOCS_ASSET_DIR &&
      isPlainFileKey(item.from) &&
      rasterExtension(item.from) !== null
    );
  }
  return isDirectChildKey(plan.source, item.from) && !item.to.includes("/");
}

function planBytesLimit(plan: SitePublishPlan): number {
  return plan.kind === "docs" ? DOCS_MAX_BYTES : DIR_MAX_BYTES;
}

function planBytesDone(plan: SitePublishPlan): number {
  const copied = Object.values(plan.done).reduce((sum, size) => sum + size, 0);
  const pages = Object.values(plan.pagesDone ?? {}).reduce((sum, size) => sum + size, 0);
  return copied + pages;
}

function sourceLabel(plan: SitePublishPlan, from: string): string {
  if (plan.kind === "dir") return from.slice(plan.source.length + 1);
  return from;
}

export async function copySiteBatch(
  bucket: R2Bucket,
  slug: string,
  kind: SitePublishPlan["kind"],
  body: { planId?: unknown; files?: unknown }
): Promise<Response> {
  const plan = await getPlanForBatch(bucket, slug, body.planId, kind);
  if (plan instanceof Response) return plan;
  if (!Array.isArray(body.files) || body.files.length === 0) return textResponse("bad files", 400);
  if (body.files.length > SITE_PUBLISH_BATCH_MAX) {
    return textResponse(`batch too large: ${body.files.length} > ${SITE_PUBLISH_BATCH_MAX}`, 400);
  }
  const byTarget = new Map(plan.items.map((item) => [item.to, item]));
  const batch: PlanCopyItem[] = [];
  for (const raw of body.files) {
    if (typeof raw !== "string") return textResponse("bad files", 400);
    const item = byTarget.get(raw);
    if (!item) return textResponse("file not in publish plan", 400);
    // 计划是服务端自己生成的，这里仍再校验一次：公开目录的源必须是源目录的直接子项，
    // 文档站的源必须是普通栅格图片；目标不能穿越
    if (!copyItemAllowed(plan, item)) {
      return textResponse(
        plan.kind === "dir" ? "file outside source folder" : "bad image source",
        400
      );
    }
    batch.push(item);
  }

  const prefix = `${SITES_PREFIX}${slug}/`;
  const limit = planBytesLimit(plan);
  let doneBytes = planBytesDone(plan);
  for (const item of batch) {
    const previous = plan.done[item.to] ?? 0;
    const object = await bucket.get(item.from);
    if (!object || isCollectionObject(object)) {
      return textResponse(`source file missing: ${sourceLabel(plan, item.from)}`, 409);
    }
    if (doneBytes - previous + object.size > limit) {
      return textResponse(`size limit exceeded: >${limit}`, 400);
    }
    const ext = rasterExtension(item.from);
    // 文档站图片按扩展名强制图片类型：站点域名上不会出现被当成 html 渲染的「图片」
    const httpMetadata =
      plan.kind === "docs" && ext ? { contentType: RASTER_MIME[ext] } : object.httpMetadata;
    await bucket.put(`${prefix}${item.to}`, object.body, { httpMetadata });
    doneBytes = doneBytes - previous + object.size;
    plan.done[item.to] = object.size;
  }
  await savePlan(bucket, plan);
  return jsonResponse({
    slug,
    copied: batch.length,
    done: Object.keys(plan.done).length + Object.keys(plan.pagesDone ?? {}).length,
    total: plan.items.length + (plan.pages?.length ?? 0),
  });
}

/** 写清单并删除上次清单里、这次不再需要的路径；最后删掉内部计划。 */
async function commitSiteManifest(
  bucket: R2Bucket,
  plan: SitePublishPlan,
  files: string[]
): Promise<void> {
  const prefix = `${SITES_PREFIX}${plan.slug}/`;
  const manifestFiles = [...files, SITE_MANIFEST_NAME];
  await bucket.put(`${prefix}${SITE_MANIFEST_NAME}`, serializeSiteManifest(plan.kind, manifestFiles), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
  const keep = new Set(manifestFiles);
  const stale = plan.owned
    .filter((rel) => isSafeManifestRel(rel) && !keep.has(rel))
    .map((rel) => `${prefix}${rel}`);
  await deleteKeysInChunks(bucket, stale);
  await bucket.delete(sitePublishPlanKey(plan.slug));
}

export async function finishSitePublish(
  bucket: R2Bucket,
  slug: string,
  kind: SitePublishPlan["kind"],
  body: { planId?: unknown },
  sitesHost: string | undefined
): Promise<Response> {
  const plan = await getPlanForBatch(bucket, slug, body.planId, kind);
  if (plan instanceof Response) return plan;
  const missing = plan.items.filter((item) => plan.done[item.to] === undefined);
  if (missing.length > 0) return textResponse(`files not copied yet: ${missing.length}`, 409);
  const pages = plan.pages ?? [];
  const missingPages = pages.filter((name) => plan.pagesDone?.[name] === undefined);
  if (missingPages.length > 0) return textResponse(`pages not uploaded yet: ${missingPages.length}`, 409);

  const prefix = `${SITES_PREFIX}${slug}/`;
  if (plan.kind === "dir") {
    const html = renderDirPage({
      lang: plan.lang,
      title: plan.title,
      subdirs: plan.subdirs,
      files: plan.items.map((item) => ({
        name: item.to,
        size: plan.done[item.to] ?? item.size,
        uploaded: item.uploaded,
      })),
    });
    await bucket.put(`${prefix}index.html`, html, {
      httpMetadata: { contentType: "text/html; charset=utf-8" },
    });
    await commitSiteManifest(bucket, plan, [...plan.items.map((item) => item.to), "index.html"]);
  } else {
    await commitSiteManifest(bucket, plan, [...pages, ...plan.items.map((item) => item.to)]);
  }

  // 公开目录记下源文件夹，文档站（多选 .md，没有单一来源）清掉旧值；发布前占用检查用（#151）
  await recordSiteSource(bucket, slug, plan.kind === "dir" ? plan.source : null);
  const bytes = planBytesDone(plan);
  return jsonResponse({
    slug,
    kind: plan.kind,
    copied: plan.kind === "dir" ? plan.items.length : pages.length - 1 + plan.items.length,
    bytes,
    sitesHost: normalizeSitesHost(sitesHost) || null,
  });
}

export async function handleDirPublish(
  bucket: R2Bucket,
  slug: string,
  dir: unknown,
  sitesHost: string | undefined
): Promise<Response> {
  if (dir === null || typeof dir !== "object" || Array.isArray(dir)) return textResponse("bad dir", 400);
  const body = dir as Record<string, unknown>;
  if (body.phase === "plan") return planDirPublish(bucket, slug, body);
  if (body.phase === "copy") return copySiteBatch(bucket, slug, "dir", body);
  if (body.phase === "finish") return finishSitePublish(bucket, slug, "dir", body, sitesHost);
  return textResponse("bad phase", 400);
}

// ---------------------------------------------------------------- 文档站

function isDocsPageName(name: string): boolean {
  return (
    isSafeManifestRel(name) &&
    !name.includes("/") &&
    /\.html$/i.test(name) &&
    !/[\u0000-\u001f]/.test(name)
  );
}

export async function planDocsPublish(
  bucket: R2Bucket,
  slug: string,
  body: { pages?: unknown; images?: unknown; sources?: unknown; lang?: unknown; title?: unknown }
): Promise<Response> {
  if (!Array.isArray(body.pages) || !body.pages.every((name) => typeof name === "string")) {
    return textResponse("bad pages", 400);
  }
  const images = body.images === undefined ? [] : body.images;
  if (!Array.isArray(images) || !images.every((key) => typeof key === "string")) {
    return textResponse("bad images", 400);
  }
  const pageNames = body.pages as string[];
  const imageKeys = images as string[];
  // 发布范围（#153）：由笔记源 key 推出公共目录，图片必须在它的子树里（范围是根目录时只认根目录当前层）。
  // 不只靠前端：服务端用同一规则复核，`../`、`/` 开头的路径或全盘搜索找来的图片都会被拒。
  if (
    !Array.isArray(body.sources) ||
    body.sources.length !== pageNames.length ||
    !body.sources.every((key) => typeof key === "string" && isPlainFileKey(key) && /\.(md|markdown)$/i.test(key))
  ) {
    return textResponse("bad sources", 400);
  }
  const scope = docsScopeOf(body.sources as string[]);
  if (pageNames.length + imageKeys.length > DOCS_MAX_FILES) {
    return textResponse(`file limit exceeded: ${pageNames.length + imageKeys.length} > ${DOCS_MAX_FILES}`, 400);
  }
  for (const name of pageNames) {
    if (!isDocsPageName(sanitizeSiteName(name))) return textResponse("bad page name", 400);
  }
  if (new Set(imageKeys).size !== imageKeys.length) return textResponse("duplicate images", 400);
  const targetPrefix = `${SITES_PREFIX}${slug}/`;
  const imageItems: Array<{ key: string; size: number; uploaded: string }> = [];
  for (const key of imageKeys) {
    if (!isPlainFileKey(key) || rasterExtension(key) === null || key.startsWith(targetPrefix)) {
      return textResponse("bad image source", 400);
    }
    if (!isInDocsScope(key, scope)) {
      return textResponse(`image outside the published folder: ${key.split("/").pop()}`, 400);
    }
    const object = await bucket.head(key);
    if (!object || isCollectionObject(object)) {
      return textResponse(`image missing: ${key.split("/").pop()}`, 409);
    }
    imageItems.push({ key, size: object.size, uploaded: object.uploaded.toISOString() });
  }
  const imageBytes = imageItems.reduce((sum, item) => sum + item.size, 0);
  const verdict = checkDocsLimits(pageNames.length, imageItems.length, imageBytes);
  if (!verdict.ok) return textResponse(verdict.error, 400);

  const owned = new Set(await loadOwnedSiteRels(bucket, targetPrefix));
  const stale = await loadPlan(bucket, slug);
  if (stale && stale.slug === slug) for (const rel of planTargets(stale)) owned.add(rel);

  const blockedTop = new Set<string>();
  for (const name of await listTopLevelSiteNames(bucket, targetPrefix)) {
    if (!owned.has(name)) blockedTop.add(name.toLowerCase());
  }
  const pages = allocateSiteFileNames(pageNames, blockedTop);
  const assetPrefix = `${targetPrefix}${DOCS_ASSET_DIR}/`;
  const blockedAssets = new Set<string>();
  for (const name of await listTopLevelSiteNames(bucket, assetPrefix)) {
    if (!owned.has(`${DOCS_ASSET_DIR}/${name}`)) blockedAssets.add(name.toLowerCase());
  }
  const assetNames = allocateSiteFileNames(
    imageItems.map((item) => item.key.split("/").pop() || "image"),
    blockedAssets
  );
  if (!pages || !assetNames || pages.some((name) => !isDocsPageName(name))) {
    return textResponse("cannot allocate file names", 400);
  }

  const lang = pageLang(body.lang);
  const titleRaw = typeof body.title === "string" ? body.title.trim() : "";
  const plan: SitePublishPlan = {
    version: 1,
    id: newPlanId(),
    kind: "docs",
    slug,
    createdAt: new Date().toISOString(),
    lang,
    title: (titleRaw || pageLabel(lang, "siteDocsHeading")).slice(0, 200),
    source: "",
    subdirs: 0,
    items: imageItems.map((item, index) => ({
      from: item.key,
      to: `${DOCS_ASSET_DIR}/${assetNames[index]}`,
      size: item.size,
      uploaded: item.uploaded,
    })),
    pages: [...pages, "index.html"],
    pagesDone: {},
    owned: [...owned],
    done: {},
  };
  await savePlan(bucket, plan);
  // 与公开目录一样，复制图片 / 上传页面之前先写预清单（#146 跟进）
  await writeEarlySiteManifest(bucket, targetPrefix, "docs", [...owned, ...planTargets(plan)]);
  return jsonResponse({
    slug,
    kind: "docs",
    planId: plan.id,
    pages,
    images: plan.items.map((item) => item.to),
    total: plan.items.length + plan.pages!.length,
    bytes: imageBytes,
    batchMax: SITE_PUBLISH_BATCH_MAX,
    pageMaxBytes: DOCS_PAGE_MAX_BYTES,
  });
}

export async function putDocsPages(
  bucket: R2Bucket,
  slug: string,
  body: { planId?: unknown; pages?: unknown }
): Promise<Response> {
  const plan = await getPlanForBatch(bucket, slug, body.planId, "docs");
  if (plan instanceof Response) return plan;
  if (!Array.isArray(body.pages) || body.pages.length === 0) return textResponse("bad pages", 400);
  if (body.pages.length > SITE_PUBLISH_BATCH_MAX) {
    return textResponse(`batch too large: ${body.pages.length} > ${SITE_PUBLISH_BATCH_MAX}`, 400);
  }
  const allowed = new Set(plan.pages ?? []);
  const encoder = new TextEncoder();
  const batch: Array<{ name: string; html: string; bytes: number }> = [];
  for (const raw of body.pages) {
    if (raw === null || typeof raw !== "object") return textResponse("bad pages", 400);
    const { name, html } = raw as { name?: unknown; html?: unknown };
    if (typeof name !== "string" || typeof html !== "string") return textResponse("bad pages", 400);
    if (!allowed.has(name) || !isDocsPageName(name)) return textResponse("page not in publish plan", 400);
    const bytes = encoder.encode(html).length;
    if (bytes > DOCS_PAGE_MAX_BYTES) return textResponse(`page too large: ${name}`, 400);
    batch.push({ name, html, bytes });
  }
  const pagesDone = plan.pagesDone ?? {};
  let doneBytes = planBytesDone(plan);
  for (const page of batch) {
    doneBytes = doneBytes - (pagesDone[page.name] ?? 0) + page.bytes;
    pagesDone[page.name] = page.bytes;
  }
  if (doneBytes > DOCS_MAX_BYTES) return textResponse(`size limit exceeded: >${DOCS_MAX_BYTES}`, 400);
  const prefix = `${SITES_PREFIX}${slug}/`;
  for (const page of batch) {
    await bucket.put(`${prefix}${page.name}`, page.html, {
      httpMetadata: { contentType: "text/html; charset=utf-8" },
    });
  }
  plan.pagesDone = pagesDone;
  await savePlan(bucket, plan);
  return jsonResponse({
    slug,
    written: batch.length,
    done: Object.keys(plan.done).length + Object.keys(pagesDone).length,
    total: plan.items.length + (plan.pages?.length ?? 0),
  });
}

export async function handleDocsPublish(
  bucket: R2Bucket,
  slug: string,
  docs: unknown,
  sitesHost: string | undefined
): Promise<Response> {
  if (docs === null || typeof docs !== "object" || Array.isArray(docs)) return textResponse("bad docs", 400);
  const body = docs as Record<string, unknown>;
  if (body.phase === "plan") return planDocsPublish(bucket, slug, body);
  if (body.phase === "put") return putDocsPages(bucket, slug, body);
  if (body.phase === "copy") return copySiteBatch(bucket, slug, "docs", body);
  if (body.phase === "finish") return finishSitePublish(bucket, slug, "docs", body, sitesHost);
  return textResponse("bad phase", 400);
}

export { DIR_MAX_BYTES, DIR_MAX_FILES, DOCS_MAX_BYTES, DOCS_MAX_FILES };
