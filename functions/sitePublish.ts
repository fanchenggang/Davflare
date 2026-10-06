// 分批发布生成型站点（公开目录；文档站复用同一通道）。
// 一次请求做完会撞上 Pages Functions 免费版每次调用 1000 次 R2 子请求 / 10ms CPU 的上限，
// 所以拆成 plan → copy×N（客户端串行，每批约 50 个）→ finish 三步：
// - plan：服务端自己列源目录、复核上限、分配目标文件名，写一份内部计划；
// - copy：只复制计划里的条目（源 key 在 plan 时已校验为源目录的直接子项，复制前再校验一次）；
// - finish：确认全部复制完，写列表页 index.html 与清单，删除上次清单里不再需要的路径。
// 中途失败时 sites/{slug}/ 可能只更新了一部分；重新发布会把未完成计划写过的路径也视为「自己拥有的」，
// 不会因为重名而产生 xxx-2 副本，直接覆盖修复。
import {
  INTERNAL_PREFIX,
  isCollectionObject,
  isInternalKey,
  jsonResponse,
  normalizeDirKey,
  textResponse,
} from "./api/_apikey";
import { SITES_PREFIX, normalizeSitesHost } from "./_sites";
import {
  DIR_MAX_BYTES,
  DIR_MAX_FILES,
  checkDirLimits,
  pageLabel,
  pageLang,
  renderDirPage,
  type PageLang,
} from "./sitePages";
import {
  SITE_MANIFEST_NAME,
  deleteKeysInChunks,
  isReservedSiteName,
  isSafeManifestRel,
  loadOwnedSiteRels,
  serializeSiteManifest,
  type SiteManifestKind,
} from "./siteManifest";

export const SITE_PUBLISH_PLAN_PREFIX = `${INTERNAL_PREFIX}site-publish/`;
/** 单批条目上限：客户端每批 50 个，服务端留一点余量。 */
export const SITE_PUBLISH_BATCH_MAX = 60;

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
  kind: Extract<SiteManifestKind, "dir">;
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

function sanitizeSiteName(name: string): string {
  let out = name.replace(/[\u0000-\u001f\u007f\\/]/g, "_").replace(/_\$flaredrive\$/g, "_flaredrive_");
  out = out.trim();
  if (!out || out === "." || out === "..") out = "file";
  return out.slice(0, 200);
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
  planId: unknown
): Promise<SitePublishPlan | Response> {
  if (typeof planId !== "string" || !planId) return textResponse("bad planId", 400);
  const plan = await loadPlan(bucket, slug);
  if (!plan) return textResponse("publish plan not found", 409);
  if (plan.id !== planId) return textResponse("publish superseded by a newer publish", 409);
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
  if (stale && stale.slug === slug) for (const item of stale.items) owned.add(item.to);
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

export async function copyDirBatch(
  bucket: R2Bucket,
  slug: string,
  body: { planId?: unknown; files?: unknown }
): Promise<Response> {
  const plan = await getPlanForBatch(bucket, slug, body.planId);
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
    // 计划是服务端自己生成的，这里仍再校验一次：源必须是源目录的直接子项，目标不能穿越
    if (!isDirectChildKey(plan.source, item.from) || !isSafeManifestRel(item.to) || item.to.includes("/")) {
      return textResponse("file outside source folder", 400);
    }
    batch.push(item);
  }

  const prefix = `${SITES_PREFIX}${slug}/`;
  let doneBytes = Object.values(plan.done).reduce((sum, size) => sum + size, 0);
  for (const item of batch) {
    const previous = plan.done[item.to] ?? 0;
    const object = await bucket.get(item.from);
    if (!object || isCollectionObject(object)) {
      return textResponse(`source file missing: ${item.from.slice(plan.source.length + 1)}`, 409);
    }
    if (doneBytes - previous + object.size > DIR_MAX_BYTES) {
      return textResponse(`size limit exceeded: >${DIR_MAX_BYTES}`, 400);
    }
    await bucket.put(`${prefix}${item.to}`, object.body, {
      httpMetadata: object.httpMetadata,
    });
    doneBytes = doneBytes - previous + object.size;
    plan.done[item.to] = object.size;
  }
  await savePlan(bucket, plan);
  return jsonResponse({
    slug,
    copied: batch.length,
    done: Object.keys(plan.done).length,
    total: plan.items.length,
  });
}

export async function finishDirPublish(
  bucket: R2Bucket,
  slug: string,
  body: { planId?: unknown },
  sitesHost: string | undefined
): Promise<Response> {
  const plan = await getPlanForBatch(bucket, slug, body.planId);
  if (plan instanceof Response) return plan;
  const missing = plan.items.filter((item) => plan.done[item.to] === undefined);
  if (missing.length > 0) return textResponse(`files not copied yet: ${missing.length}`, 409);

  const prefix = `${SITES_PREFIX}${slug}/`;
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
  const manifestFiles = [...plan.items.map((item) => item.to), "index.html", SITE_MANIFEST_NAME];
  await bucket.put(`${prefix}${SITE_MANIFEST_NAME}`, serializeSiteManifest("dir", manifestFiles), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
  const keep = new Set(manifestFiles);
  const stale = plan.owned
    .filter((rel) => isSafeManifestRel(rel) && !keep.has(rel))
    .map((rel) => `${prefix}${rel}`);
  await deleteKeysInChunks(bucket, stale);
  await bucket.delete(sitePublishPlanKey(slug));

  const bytes = plan.items.reduce((sum, item) => sum + (plan.done[item.to] ?? 0), 0);
  return jsonResponse({
    slug,
    kind: "dir",
    copied: plan.items.length,
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
  if (body.phase === "copy") return copyDirBatch(bucket, slug, body);
  if (body.phase === "finish") return finishDirPublish(bucket, slug, body, sitesHost);
  return textResponse("bad phase", 400);
}

export { DIR_MAX_BYTES, DIR_MAX_FILES };
