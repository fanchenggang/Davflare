import { featureDisabledResponse, loadFeatureFlags } from "../_flags";
import {
  SITE_PASSWORD_MAX_LEN,
  SITES_PREFIX,
  SiteConfig,
  deleteHostnameIndex,
  hashSitePassword,
  isValidHostname,
  isValidSlug,
  loadSiteConfig,
  loadSlugForHostname,
  normalizeHostname,
  normalizeSitesHost,
  putHostnameIndex,
  recordSiteSource,
  siteConfigKey,
} from "../_sites";
import {
  ALBUM_MANIFEST_NAME,
  albumNameCandidate,
  checkAlbumLimits,
  checkBookshelfLimits,
  checkDownloadsLimits,
  checkPodcastLimits,
  bookshelfCoverRel,
  bookshelfMimeType,
  bookshelfNameCandidate,
  bookshelfPublicBase,
  downloadsMimeType,
  downloadsNameCandidate,
  downloadsPublicBase,
  isBookshelfAssetName,
  isDownloadsAssetName,
  isDownloadsReadmeName,
  isSafeManifestRel,
  mediaExtension,
  mediaMimeType,
  pageLabel,
  pageLang,
  parseNavPayload,
  PODCAST_FEED_NAME,
  podcastNameCandidate,
  podcastPublicBase,
  rasterExtension,
  renderAlbumPage,
  renderBookshelfPage,
  renderDownloadsPage,
  renderNavPage,
  renderPodcastFeed,
  renderPodcastPage,
  renderReleaseNotesMarkdown,
} from "../sitePages";
import { isValidThumbnailDigest, thumbnailObjectKey } from "../webdav/davUtil";
import {
  SITE_MANIFEST_NAME,
  SITE_MANIFEST_NAMES,
  deleteKeysInChunks,
  loadOwnedSiteRels,
  loadSiteManifestKind,
  writeEarlySiteManifest,
} from "../siteManifest";
import { deleteSiteKeys, putGeneratedSiteIndex } from "../siteIndex";
import {
  handleDirPublish,
  handleDocsPublish,
  hasLiveSitePublishPlan,
  sitePublishPlanKey,
} from "../sitePublish";
import {
  copyObject,
  isCollectionObject,
  isSessionOrKeyAuthorized,
  jsonResponse,
  listDescendants,
  normalizeDirKey,
  normalizeFileKey,
  resolveAsDirectory,
  textResponse,
  sha256Bytes,
} from "./_apikey";

interface SitesApiEnv {
  BUCKET: R2Bucket;
  WEBDAV_USERNAME: string;
  WEBDAV_PASSWORD: string;
  SITES_HOST?: string;
}

const SITE_STATS_MAX_OBJECTS = 5000;
const SITE_STATS_TTL_MS = 10 * 60 * 1000;
const SITE_DELETE_MAX_OBJECTS = 5000;

async function listSiteSlugs(bucket: R2Bucket): Promise<string[]> {
  const slugs: string[] = [];
  let cursor: string | undefined;
  do {
    const listing = await bucket.list({ prefix: SITES_PREFIX, delimiter: "/", cursor });
    for (const prefix of listing.delimitedPrefixes) {
      const slug = prefix.slice(SITES_PREFIX.length).replace(/\/$/, "");
      if (slug) slugs.push(slug);
    }
    if (!listing.truncated) break;
    cursor = listing.cursor;
  } while (true);
  return slugs;
}

/**
 * 只做了 plan 就放弃的发布（#160）：站点目录里只有清单文件，且没有仍在有效期内的发布计划。
 * 这种「占位站」不算已占用，也不出现在站点列表里（再发布会直接覆盖它）。
 * 一次 list（最多 3 个对象）；只有全是清单时才多读一次计划。
 */
async function isAbandonedPlaceholderSite(bucket: R2Bucket, slug: string): Promise<boolean> {
  const prefix = `${SITES_PREFIX}${slug}/`;
  const listing = await bucket.list({ prefix, limit: SITE_MANIFEST_NAMES.length + 1 });
  if (listing.objects.length === 0) return false;
  const onlyManifests = listing.objects.every((object) =>
    (SITE_MANIFEST_NAMES as readonly string[]).includes(object.key.slice(prefix.length))
  );
  if (!onlyManifests || listing.truncated) return false;
  return !(await hasLiveSitePublishPlan(bucket, slug));
}

/** 聚合站点文件数/总大小；缓存未过期直接复用，扫描封顶防大站超时 */
async function computeSiteStats(
  bucket: R2Bucket,
  slug: string,
  cached: SiteConfig["stats"]
): Promise<SiteConfig["stats"]> {
  if (cached && Date.now() - new Date(cached.cachedAt).getTime() < SITE_STATS_TTL_MS) {
    return cached;
  }
  let objects = 0;
  let size = 0;
  let truncated = false;
  let cursor: string | undefined;
  do {
    const listing = await bucket.list({ prefix: `${SITES_PREFIX}${slug}/`, cursor, limit: 500 });
    for (const object of listing.objects) {
      objects += 1;
      size += object.size;
      if (objects >= SITE_STATS_MAX_OBJECTS) {
        // 只有服务端还因分页而 truncated 时，统计才是“至少 N 个”的下限；
        // 恰好等于上限且已读完最后一页时不应误标 truncated。
        truncated = listing.truncated;
        break;
      }
    }
    if (truncated || !listing.truncated) break;
    cursor = listing.cursor;
  } while (true);
  return { objects, size, cachedAt: new Date().toISOString(), ...(truncated ? { truncated: true } : {}) };
}

async function saveSiteConfig(bucket: R2Bucket, config: SiteConfig): Promise<void> {
  await bucket.put(siteConfigKey(config.slug), JSON.stringify(config), {
    httpMetadata: { contentType: "application/json" },
  });
}


async function publishNav(
  env: SitesApiEnv,
  slug: string,
  nav: unknown
): Promise<Response> {
  const flags = await loadFeatureFlags(env.BUCKET);
  if (!flags.sites) return featureDisabledResponse();
  const parsed = parseNavPayload(nav);
  if (!parsed.ok) return textResponse(parsed.error, 400);
  const html = renderNavPage({
    lang: parsed.lang,
    title: parsed.title,
    groups: parsed.groups,
  });
  // 覆盖前把用户的首页移进回收站（#177）
  await putGeneratedSiteIndex(env.BUCKET, `${SITES_PREFIX}${slug}/`, html);
  return jsonResponse({
    slug,
    kind: "nav",
    copied: 1,
    count: parsed.count,
    sitesHost: normalizeSitesHost(env.SITES_HOST) || null,
  });
}

async function publishAlbum(
  env: SitesApiEnv,
  slug: string,
  album: unknown
): Promise<Response> {
  const flags = await loadFeatureFlags(env.BUCKET);
  if (!flags.sites) return featureDisabledResponse();
  if (album === null || typeof album !== "object" || Array.isArray(album)) {
    return textResponse("bad album", 400);
  }
  const body = album as { lang?: unknown; title?: string; files?: unknown };
  if (!Array.isArray(body.files)) return textResponse("bad album", 400);
  if (body.files.length > 5000) return textResponse("bad album", 400);

  const lang = pageLang(body.lang);
  const titleRaw = typeof body.title === "string" ? body.title.trim() : "";
  const title = (titleRaw || pageLabel(lang, "siteAlbumHeading")).slice(0, 200);

  const seen = new Set<string>();
  const rasters: Array<{ key: string; name: string }> = [];
  for (const item of body.files) {
    if (typeof item !== "string") return textResponse("bad album", 400);
    const key = normalizeFileKey(item);
    if (key instanceof Response) return key;
    if (seen.has(key)) continue;
    seen.add(key);
    const base = key.split("/").pop() || "";
    if (!rasterExtension(base)) continue;
    rasters.push({ key, name: base });
  }

  const limited = checkAlbumLimits(rasters.length, 0);
  if (!limited.ok && limited.error.startsWith("album image limit exceeded")) {
    return textResponse(limited.error, 400);
  }
  if (!limited.ok && limited.error === "no album images") {
    return textResponse(limited.error, 400);
  }

  let bytes = 0;
  const sized: Array<{ key: string; name: string; size: number }> = [];
  for (const file of rasters) {
    const head = await env.BUCKET.head(file.key);
    if (head === null) return textResponse("album file not found", 404);
    if (isCollectionObject(head)) continue;
    bytes += head.size;
    sized.push({ ...file, size: head.size });
    const after = checkAlbumLimits(sized.length, bytes);
    if (!after.ok && after.error.startsWith("album size limit exceeded")) {
      return textResponse(after.error, 400);
    }
    if (!after.ok && after.error.startsWith("album image limit exceeded")) {
      return textResponse(after.error, 400);
    }
  }
  const finalLimits = checkAlbumLimits(sized.length, bytes);
  if (!finalLimits.ok) return textResponse(finalLimits.error, 400);

  const prefix = `${SITES_PREFIX}${slug}/`;
  const manifestKey = `${prefix}${ALBUM_MANIFEST_NAME}`;
  const indexKey = `${prefix}index.html`;
  // 通用清单：相册清单与其它 kind（公开目录 / 文档站）的清单都算「上次发布拥有的路径」
  const oldRels = await loadOwnedSiteRels(env.BUCKET, prefix);
  const manifestKeys = new Set<string>();
  for (const rel of oldRels) {
    if (!isSafeManifestRel(rel)) continue;
    manifestKeys.add(`${prefix}${rel}`);
  }

  const used = new Set<string>();
  const planned: Array<{ key: string; name: string; size: number }> = [];
  for (const file of sized) {
    let chosen: string | null = null;
    for (let attempt = 1; attempt <= 10000; attempt += 1) {
      const candidate = albumNameCandidate(file.name, attempt);
      if (!candidate) continue;
      if (used.has(candidate.toLowerCase())) continue;
      const dest = `${prefix}${candidate}`;
      const head = await env.BUCKET.head(dest);
      if (head !== null && !manifestKeys.has(dest)) continue;
      chosen = candidate;
      break;
    }
    if (!chosen) return textResponse("bad album", 400);
    used.add(chosen.toLowerCase());
    planned.push({ key: file.key, name: chosen, size: file.size });
  }

  const sourceKeys = new Set(planned.map((file) => file.key));
  const newKeys = new Set<string>([indexKey, manifestKey]);
  for (const file of planned) newKeys.add(`${prefix}${file.name}`);

  // 删除 / 复制之前先写预清单（#146 跟进）：发布途中站点已按相册处理
  await writeEarlySiteManifest(env.BUCKET, prefix, "album", [
    ...oldRels,
    ...planned.map((file) => file.name),
    "index.html",
  ]);

  // 首页走回收站兜底（#177）：清单记着、实际是用户文件的 index.html 不硬删
  await deleteSiteKeys(
    env.BUCKET,
    prefix,
    oldRels
      .filter((rel) => isSafeManifestRel(rel))
      .map((rel) => `${prefix}${rel}`)
      .filter((key) => key.startsWith(prefix) && !sourceKeys.has(key))
  );

  const images: Array<{ name: string; src: string }> = [];
  for (const file of planned) {
    const dest = `${prefix}${file.name}`;
    const error = await copyObject(env.BUCKET, file.key, dest, { overwrite: true });
    if (error) return error;
    images.push({ name: file.name, src: encodeURIComponent(file.name) });
  }

  await recordSiteSource(env.BUCKET, slug, null);
  const html = renderAlbumPage({ lang, title, images });
  await putGeneratedSiteIndex(env.BUCKET, prefix, html);
  const manifestFiles = [
    ...planned.map((file) => file.name),
    "index.html",
    ALBUM_MANIFEST_NAME,
  ];
  await env.BUCKET.put(
    manifestKey,
    JSON.stringify({ version: 1, kind: "album", files: manifestFiles }),
    { httpMetadata: { contentType: "application/json; charset=utf-8" } }
  );

  await deleteSiteKeys(
    env.BUCKET,
    prefix,
    oldRels
      .filter((rel) => isSafeManifestRel(rel))
      .map((rel) => `${prefix}${rel}`)
      .filter((key) => key.startsWith(prefix) && !newKeys.has(key))
  );

  return jsonResponse({
    slug,
    kind: "album",
    copied: planned.length,
    bytes,
    sitesHost: normalizeSitesHost(env.SITES_HOST) || null,
  });
}


async function publishPodcast(
  env: SitesApiEnv,
  slug: string,
  podcast: unknown
): Promise<Response> {
  const flags = await loadFeatureFlags(env.BUCKET);
  if (!flags.sites) return featureDisabledResponse();
  if (podcast === null || typeof podcast !== "object" || Array.isArray(podcast)) {
    return textResponse("bad podcast", 400);
  }
  const body = podcast as { lang?: unknown; title?: string; description?: string; files?: unknown };
  if (!Array.isArray(body.files)) return textResponse("bad podcast", 400);
  if (body.files.length > 5000) return textResponse("bad podcast", 400);

  const lang = pageLang(body.lang);
  const titleRaw = typeof body.title === "string" ? body.title.trim() : "";
  const title = (titleRaw || pageLabel(lang, "sitePodcastHeading")).slice(0, 200);
  const description =
    typeof body.description === "string" ? body.description.trim().slice(0, 1000) : "";

  const seen = new Set<string>();
  const media: Array<{ key: string; name: string }> = [];
  for (const item of body.files) {
    if (typeof item !== "string") return textResponse("bad podcast", 400);
    const key = normalizeFileKey(item);
    if (key instanceof Response) return key;
    if (seen.has(key)) continue;
    seen.add(key);
    const base = key.split("/").pop() || "";
    if (!mediaExtension(base)) continue;
    media.push({ key, name: base });
  }

  const limited = checkPodcastLimits(media.length, 0);
  if (!limited.ok && limited.error.startsWith("podcast episode limit exceeded")) {
    return textResponse(limited.error, 400);
  }
  if (!limited.ok && limited.error === "no podcast media") {
    return textResponse(limited.error, 400);
  }

  let bytes = 0;
  const sized: Array<{ key: string; name: string; size: number; uploaded: string; contentType: string }> =
    [];
  for (const file of media) {
    const head = await env.BUCKET.head(file.key);
    if (head === null) return textResponse("podcast file not found", 404);
    if (isCollectionObject(head)) continue;
    bytes += head.size;
    const uploaded =
      head.uploaded instanceof Date && !Number.isNaN(head.uploaded.getTime())
        ? head.uploaded.toISOString()
        : new Date(0).toISOString();
    // 已知音视频扩展名一律按扩展名映射（#203）：上传方常写成 application/octet-stream
    const contentType = mediaMimeType(file.name);
    sized.push({ ...file, size: head.size, uploaded, contentType });
    const after = checkPodcastLimits(sized.length, bytes);
    if (!after.ok && after.error.startsWith("podcast size limit exceeded")) {
      return textResponse(after.error, 400);
    }
    if (!after.ok && after.error.startsWith("podcast episode limit exceeded")) {
      return textResponse(after.error, 400);
    }
  }
  const finalLimits = checkPodcastLimits(sized.length, bytes);
  if (!finalLimits.ok) return textResponse(finalLimits.error, 400);

  // 新到旧，方便 RSS / 播放页
  sized.sort((a, b) => b.uploaded.localeCompare(a.uploaded) || a.name.localeCompare(b.name));

  const prefix = `${SITES_PREFIX}${slug}/`;
  const manifestKey = `${prefix}${SITE_MANIFEST_NAME}`;
  const indexKey = `${prefix}index.html`;
  const feedKey = `${prefix}${PODCAST_FEED_NAME}`;
  const oldRels = await loadOwnedSiteRels(env.BUCKET, prefix);
  const manifestKeys = new Set<string>();
  for (const rel of oldRels) {
    if (!isSafeManifestRel(rel)) continue;
    manifestKeys.add(`${prefix}${rel}`);
  }

  const used = new Set<string>();
  const planned: Array<{
    key: string;
    name: string;
    size: number;
    uploaded: string;
    contentType: string;
  }> = [];
  for (const file of sized) {
    let chosen: string | null = null;
    for (let attempt = 1; attempt <= 10000; attempt += 1) {
      const candidate = podcastNameCandidate(file.name, attempt);
      if (!candidate) continue;
      if (used.has(candidate.toLowerCase())) continue;
      const dest = `${prefix}${candidate}`;
      const head = await env.BUCKET.head(dest);
      if (head !== null && !manifestKeys.has(dest)) continue;
      chosen = candidate;
      break;
    }
    if (!chosen) return textResponse("bad podcast", 400);
    used.add(chosen.toLowerCase());
    planned.push({ ...file, name: chosen });
  }

  const sourceKeys = new Set(planned.map((file) => file.key));
  const newKeys = new Set<string>([indexKey, feedKey, manifestKey]);
  for (const file of planned) newKeys.add(`${prefix}${file.name}`);

  await writeEarlySiteManifest(env.BUCKET, prefix, "podcast", [
    ...oldRels,
    ...planned.map((file) => file.name),
    "index.html",
    PODCAST_FEED_NAME,
  ]);

  await deleteSiteKeys(
    env.BUCKET,
    prefix,
    oldRels
      .filter((rel) => isSafeManifestRel(rel))
      .map((rel) => `${prefix}${rel}`)
      .filter((key) => key.startsWith(prefix) && !sourceKeys.has(key))
  );

  const sitesHost = normalizeSitesHost(env.SITES_HOST) || null;
  const base = podcastPublicBase(sitesHost, slug);
  const episodes = [];
  for (const file of planned) {
    const dest = `${prefix}${file.name}`;
    const error = await copyObject(env.BUCKET, file.key, dest, {
      overwrite: true,
      httpMetadata: { contentType: file.contentType },
    });
    if (error) return error;
    episodes.push({
      name: file.name,
      size: file.size,
      uploaded: file.uploaded,
      contentType: file.contentType,
      url: base ? `${base}/${encodeURIComponent(file.name)}` : encodeURIComponent(file.name),
    });
  }

  await recordSiteSource(env.BUCKET, slug, null);
  const feedHref = base ? `${base}/${PODCAST_FEED_NAME}` : PODCAST_FEED_NAME;
  const html = renderPodcastPage({ lang, title, feedHref, episodes });
  await putGeneratedSiteIndex(env.BUCKET, prefix, html);
  const feed = renderPodcastFeed({
    lang,
    title,
    description,
    slug,
    sitesHost,
    episodes,
  });
  await env.BUCKET.put(feedKey, feed, {
    httpMetadata: { contentType: "application/rss+xml; charset=utf-8" },
  });
  const manifestFiles = [
    ...planned.map((file) => file.name),
    "index.html",
    PODCAST_FEED_NAME,
    SITE_MANIFEST_NAME,
  ];
  await env.BUCKET.put(
    manifestKey,
    JSON.stringify({ version: 1, kind: "podcast", files: manifestFiles }),
    { httpMetadata: { contentType: "application/json; charset=utf-8" } }
  );

  // 清掉相册清单（若从相册 slug 接管）
  await deleteKeysInChunks(
    env.BUCKET,
    SITE_MANIFEST_NAMES.filter((name) => name !== SITE_MANIFEST_NAME).map(
      (name) => `${prefix}${name}`
    )
  );

  await deleteSiteKeys(
    env.BUCKET,
    prefix,
    oldRels
      .filter((rel) => isSafeManifestRel(rel))
      .map((rel) => `${prefix}${rel}`)
      .filter((key) => key.startsWith(prefix) && !newKeys.has(key))
  );

  return jsonResponse({
    slug,
    kind: "podcast",
    copied: planned.length,
    bytes,
    feed: PODCAST_FEED_NAME,
    sitesHost,
  });
}


async function publishDownloads(
  env: SitesApiEnv,
  slug: string,
  downloads: unknown
): Promise<Response> {
  const flags = await loadFeatureFlags(env.BUCKET);
  if (!flags.sites) return featureDisabledResponse();
  if (downloads === null || typeof downloads !== "object" || Array.isArray(downloads)) {
    return textResponse("bad downloads", 400);
  }
  const body = downloads as { lang?: unknown; title?: string; files?: unknown; readmeKey?: unknown };
  if (!Array.isArray(body.files)) return textResponse("bad downloads", 400);
  if (body.files.length > 5000) return textResponse("bad downloads", 400);

  const lang = pageLang(body.lang);
  const titleRaw = typeof body.title === "string" ? body.title.trim() : "";
  const title = (titleRaw || pageLabel(lang, "siteDownloadsHeading")).slice(0, 200);

  const seen = new Set<string>();
  const assets: Array<{ key: string; name: string }> = [];
  for (const item of body.files) {
    if (typeof item !== "string") return textResponse("bad downloads", 400);
    const key = normalizeFileKey(item);
    if (key instanceof Response) return key;
    if (seen.has(key)) continue;
    seen.add(key);
    const base = key.split("/").pop() || "";
    if (!isDownloadsAssetName(base)) continue;
    assets.push({ key, name: base });
  }

  const limited = checkDownloadsLimits(assets.length, 0);
  if (!limited.ok && limited.error.startsWith("downloads file limit exceeded")) {
    return textResponse(limited.error, 400);
  }
  if (!limited.ok && limited.error === "no downloads assets") {
    return textResponse(limited.error, 400);
  }

  let readmeText: string | null = null;
  const readmeKeyRaw = typeof body.readmeKey === "string" ? body.readmeKey.trim() : "";
  if (readmeKeyRaw) {
    const readmeKey = normalizeFileKey(readmeKeyRaw);
    if (readmeKey instanceof Response) return readmeKey;
    const readmeObj = await env.BUCKET.get(readmeKey);
    if (readmeObj === null) return textResponse("downloads readme not found", 404);
    if (isCollectionObject(readmeObj)) return textResponse("bad downloads", 400);
    const name = readmeKey.split("/").pop() || "";
    if (!isDownloadsReadmeName(name)) return textResponse("bad downloads readme", 400);
    readmeText = await readmeObj.text();
  }

  let bytes = 0;
  const sized: Array<{ key: string; name: string; size: number; uploaded: string; contentType: string }> =
    [];
  for (const file of assets) {
    const head = await env.BUCKET.head(file.key);
    if (head === null) return textResponse("downloads file not found", 404);
    if (isCollectionObject(head)) continue;
    bytes += head.size;
    const uploaded =
      head.uploaded instanceof Date && !Number.isNaN(head.uploaded.getTime())
        ? head.uploaded.toISOString()
        : new Date(0).toISOString();
    const contentType = downloadsMimeType(file.name);
    sized.push({ ...file, size: head.size, uploaded, contentType });
    const after = checkDownloadsLimits(sized.length, bytes);
    if (!after.ok && after.error.startsWith("downloads size limit exceeded")) {
      return textResponse(after.error, 400);
    }
    if (!after.ok && after.error.startsWith("downloads file limit exceeded")) {
      return textResponse(after.error, 400);
    }
  }
  const finalLimits = checkDownloadsLimits(sized.length, bytes);
  if (!finalLimits.ok) return textResponse(finalLimits.error, 400);

  sized.sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));

  const prefix = `${SITES_PREFIX}${slug}/`;
  const manifestKey = `${prefix}${SITE_MANIFEST_NAME}`;
  const indexKey = `${prefix}index.html`;
  const oldRels = await loadOwnedSiteRels(env.BUCKET, prefix);
  const manifestKeys = new Set<string>();
  for (const rel of oldRels) {
    if (!isSafeManifestRel(rel)) continue;
    manifestKeys.add(`${prefix}${rel}`);
  }

  const used = new Set<string>();
  const planned: Array<{
    key: string;
    name: string;
    size: number;
    uploaded: string;
    contentType: string;
  }> = [];
  for (const file of sized) {
    let chosen: string | null = null;
    for (let attempt = 1; attempt <= 10000; attempt += 1) {
      const candidate = downloadsNameCandidate(file.name, attempt);
      if (!candidate) continue;
      if (used.has(candidate.toLowerCase())) continue;
      const dest = `${prefix}${candidate}`;
      const head = await env.BUCKET.head(dest);
      if (head !== null && !manifestKeys.has(dest)) continue;
      chosen = candidate;
      break;
    }
    if (!chosen) return textResponse("bad downloads", 400);
    used.add(chosen.toLowerCase());
    planned.push({ ...file, name: chosen });
  }

  const sourceKeys = new Set(planned.map((file) => file.key));
  const newKeys = new Set<string>([indexKey, manifestKey]);
  for (const file of planned) newKeys.add(`${prefix}${file.name}`);

  await writeEarlySiteManifest(env.BUCKET, prefix, "downloads", [
    ...oldRels,
    ...planned.map((file) => file.name),
    "index.html",
  ]);

  await deleteSiteKeys(
    env.BUCKET,
    prefix,
    oldRels
      .filter((rel) => isSafeManifestRel(rel))
      .map((rel) => `${prefix}${rel}`)
      .filter((key) => key.startsWith(prefix) && !sourceKeys.has(key))
  );

  const sitesHost = normalizeSitesHost(env.SITES_HOST) || null;
  const base = downloadsPublicBase(sitesHost, slug);
  const published: Array<{
    name: string;
    size: number;
    sha256: string;
    uploaded: string;
    contentType: string;
    url: string;
  }> = [];
  for (const file of planned) {
    const dest = `${prefix}${file.name}`;
    const source = await env.BUCKET.get(file.key);
    if (source === null) return textResponse("downloads file not found", 404);
    if (isCollectionObject(source)) return textResponse("bad downloads", 400);
    const buffer = await source.arrayBuffer();
    const sha256 = await sha256Bytes(buffer);
    await env.BUCKET.put(dest, new Uint8Array(buffer), {
      httpMetadata: { contentType: file.contentType },
      customMetadata: source.customMetadata,
    });
    published.push({
      name: file.name,
      size: file.size,
      sha256,
      uploaded: file.uploaded,
      contentType: file.contentType,
      url: base ? `${base}/${encodeURIComponent(file.name)}` : encodeURIComponent(file.name),
    });
  }

  await recordSiteSource(env.BUCKET, slug, null);
  const readmeHtml = readmeText != null ? renderReleaseNotesMarkdown(readmeText) : null;
  const html = renderDownloadsPage({ lang, title, files: published, readmeHtml });
  await putGeneratedSiteIndex(env.BUCKET, prefix, html);
  const manifestFiles = [...planned.map((file) => file.name), "index.html", SITE_MANIFEST_NAME];
  await env.BUCKET.put(
    manifestKey,
    JSON.stringify({ version: 1, kind: "downloads", files: manifestFiles }),
    { httpMetadata: { contentType: "application/json; charset=utf-8" } }
  );

  await deleteKeysInChunks(
    env.BUCKET,
    SITE_MANIFEST_NAMES.filter((name) => name !== SITE_MANIFEST_NAME).map(
      (name) => `${prefix}${name}`
    )
  );

  await deleteSiteKeys(
    env.BUCKET,
    prefix,
    oldRels
      .filter((rel) => isSafeManifestRel(rel))
      .map((rel) => `${prefix}${rel}`)
      .filter((key) => key.startsWith(prefix) && !newKeys.has(key))
  );

  return jsonResponse({
    slug,
    kind: "downloads",
    copied: planned.length,
    bytes,
    sitesHost,
  });
}


async function publishBookshelf(
  env: SitesApiEnv,
  slug: string,
  bookshelf: unknown
): Promise<Response> {
  const flags = await loadFeatureFlags(env.BUCKET);
  if (!flags.sites) return featureDisabledResponse();
  if (bookshelf === null || typeof bookshelf !== "object" || Array.isArray(bookshelf)) {
    return textResponse("bad bookshelf", 400);
  }
  const body = bookshelf as { lang?: unknown; title?: string; files?: unknown };
  if (!Array.isArray(body.files)) return textResponse("bad bookshelf", 400);
  if (body.files.length > 5000) return textResponse("bad bookshelf", 400);

  const lang = pageLang(body.lang);
  const titleRaw = typeof body.title === "string" ? body.title.trim() : "";
  const title = (titleRaw || pageLabel(lang, "siteBookshelfHeading")).slice(0, 200);

  const seen = new Set<string>();
  const assets: Array<{ key: string; name: string }> = [];
  for (const item of body.files) {
    if (typeof item !== "string") return textResponse("bad bookshelf", 400);
    const key = normalizeFileKey(item);
    if (key instanceof Response) return key;
    if (seen.has(key)) continue;
    seen.add(key);
    const base = key.split("/").pop() || "";
    if (!isBookshelfAssetName(base)) continue;
    assets.push({ key, name: base });
  }

  const limited = checkBookshelfLimits(assets.length, 0);
  if (!limited.ok && limited.error.startsWith("bookshelf file limit exceeded")) {
    return textResponse(limited.error, 400);
  }
  if (!limited.ok && limited.error === "no bookshelf assets") {
    return textResponse(limited.error, 400);
  }

  let bytes = 0;
  const sized: Array<{
    key: string;
    name: string;
    size: number;
    uploaded: string;
    contentType: string;
    thumbnail: string | null;
  }> = [];
  for (const file of assets) {
    const head = await env.BUCKET.head(file.key);
    if (head === null) return textResponse("bookshelf file not found", 404);
    if (isCollectionObject(head)) continue;
    bytes += head.size;
    const uploaded =
      head.uploaded instanceof Date && !Number.isNaN(head.uploaded.getTime())
        ? head.uploaded.toISOString()
        : new Date(0).toISOString();
    const contentType = bookshelfMimeType(file.name);
    const rawThumb = head.customMetadata?.thumbnail;
    const thumbnail = isValidThumbnailDigest(rawThumb) ? rawThumb : null;
    sized.push({ ...file, size: head.size, uploaded, contentType, thumbnail });
    const after = checkBookshelfLimits(sized.length, bytes);
    if (!after.ok && after.error.startsWith("bookshelf size limit exceeded")) {
      return textResponse(after.error, 400);
    }
    if (!after.ok && after.error.startsWith("bookshelf file limit exceeded")) {
      return textResponse(after.error, 400);
    }
  }
  const finalLimits = checkBookshelfLimits(sized.length, bytes);
  if (!finalLimits.ok) return textResponse(finalLimits.error, 400);

  sized.sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));

  const prefix = `${SITES_PREFIX}${slug}/`;
  const manifestKey = `${prefix}${SITE_MANIFEST_NAME}`;
  const indexKey = `${prefix}index.html`;
  const oldRels = await loadOwnedSiteRels(env.BUCKET, prefix);
  const manifestKeys = new Set<string>();
  for (const rel of oldRels) {
    if (!isSafeManifestRel(rel)) continue;
    manifestKeys.add(`${prefix}${rel}`);
  }

  const used = new Set<string>();
  const planned: Array<{
    key: string;
    name: string;
    size: number;
    uploaded: string;
    contentType: string;
    thumbnail: string | null;
    coverRel: string | null;
  }> = [];
  for (const file of sized) {
    let chosen: string | null = null;
    for (let attempt = 1; attempt <= 10000; attempt += 1) {
      const candidate = bookshelfNameCandidate(file.name, attempt);
      if (!candidate) continue;
      if (used.has(candidate.toLowerCase())) continue;
      const dest = `${prefix}${candidate}`;
      const head = await env.BUCKET.head(dest);
      if (head !== null && !manifestKeys.has(dest)) continue;
      chosen = candidate;
      break;
    }
    if (!chosen) return textResponse("bad bookshelf", 400);
    used.add(chosen.toLowerCase());
    const coverRel = file.thumbnail ? bookshelfCoverRel(chosen) : null;
    if (coverRel) used.add(coverRel.toLowerCase());
    planned.push({ ...file, name: chosen, coverRel });
  }

  const sourceKeys = new Set(planned.map((file) => file.key));
  const newKeys = new Set<string>([indexKey, manifestKey]);
  for (const file of planned) {
    newKeys.add(`${prefix}${file.name}`);
    if (file.coverRel) newKeys.add(`${prefix}${file.coverRel}`);
  }

  await writeEarlySiteManifest(env.BUCKET, prefix, "bookshelf", [
    ...oldRels,
    ...planned.map((file) => file.name),
    ...planned.filter((file) => file.coverRel).map((file) => file.coverRel!),
    "index.html",
  ]);

  await deleteSiteKeys(
    env.BUCKET,
    prefix,
    oldRels
      .filter((rel) => isSafeManifestRel(rel))
      .map((rel) => `${prefix}${rel}`)
      .filter((key) => key.startsWith(prefix) && !sourceKeys.has(key))
  );

  const sitesHost = normalizeSitesHost(env.SITES_HOST) || null;
  const base = bookshelfPublicBase(sitesHost, slug);
  const published: Array<{
    name: string;
    size: number;
    uploaded: string;
    contentType: string;
    url: string;
    cover: string | null;
  }> = [];
  const writtenCovers: string[] = [];
  for (const file of planned) {
    const dest = `${prefix}${file.name}`;
    const source = await env.BUCKET.get(file.key);
    if (source === null) return textResponse("bookshelf file not found", 404);
    if (isCollectionObject(source)) return textResponse("bad bookshelf", 400);
    const buffer = await source.arrayBuffer();
    await env.BUCKET.put(dest, new Uint8Array(buffer), {
      httpMetadata: { contentType: file.contentType },
      customMetadata: source.customMetadata,
    });

    let coverUrl: string | null = null;
    if (file.thumbnail && file.coverRel) {
      const thumbObj = await env.BUCKET.get(thumbnailObjectKey(file.thumbnail));
      if (thumbObj !== null && !isCollectionObject(thumbObj)) {
        const coverBuf = await thumbObj.arrayBuffer();
        await env.BUCKET.put(`${prefix}${file.coverRel}`, new Uint8Array(coverBuf), {
          httpMetadata: { contentType: "image/png" },
        });
        writtenCovers.push(file.coverRel);
        coverUrl = encodeURI(file.coverRel);
      }
    }

    published.push({
      name: file.name,
      size: file.size,
      uploaded: file.uploaded,
      contentType: file.contentType,
      url: base ? `${base}/${encodeURIComponent(file.name)}` : encodeURIComponent(file.name),
      cover: coverUrl,
    });
  }

  await recordSiteSource(env.BUCKET, slug, null);
  const html = renderBookshelfPage({ lang, title, files: published });
  await putGeneratedSiteIndex(env.BUCKET, prefix, html);
  const manifestFiles = [
    ...planned.map((file) => file.name),
    ...writtenCovers,
    "index.html",
    SITE_MANIFEST_NAME,
  ];
  await env.BUCKET.put(
    manifestKey,
    JSON.stringify({ version: 1, kind: "bookshelf", files: manifestFiles }),
    { httpMetadata: { contentType: "application/json; charset=utf-8" } }
  );

  await deleteKeysInChunks(
    env.BUCKET,
    SITE_MANIFEST_NAMES.filter((name) => name !== SITE_MANIFEST_NAME).map(
      (name) => `${prefix}${name}`
    )
  );

  await deleteSiteKeys(
    env.BUCKET,
    prefix,
    oldRels
      .filter((rel) => isSafeManifestRel(rel))
      .map((rel) => `${prefix}${rel}`)
      .filter((key) => key.startsWith(prefix) && !newKeys.has(key))
  );

  return jsonResponse({
    slug,
    kind: "bookshelf",
    copied: planned.length,
    bytes,
    sitesHost,
  });
}

export const onRequestGet: PagesFunction<SitesApiEnv> = async (context) => {
  const { request, env } = context;
  if (!(await isSessionOrKeyAuthorized(
      request,
      env.BUCKET,
      env.WEBDAV_USERNAME,
      env.WEBDAV_PASSWORD
    ))) {
    return textResponse("Unauthorized", 401);
  }

  const url = new URL(request.url);

  // 发布前的占用检查（#151）：?check=<slug> → 是否已存在、是哪种站点、上次从哪个文件夹发布。
  // 最多 4 次 R2 读（list 1 个 + 配置 + 两份清单），不扫全站。
  if (url.searchParams.has("check")) {
    const slug = (url.searchParams.get("check") || "").trim().toLowerCase();
    if (!isValidSlug(slug)) return new Response("Bad slug", { status: 400 });
    const prefix = `${SITES_PREFIX}${slug}/`;
    const [listing, config, manifestKind] = await Promise.all([
      env.BUCKET.list({ prefix, limit: 1 }),
      loadSiteConfig(env.BUCKET, slug),
      loadSiteManifestKind(env.BUCKET, prefix),
    ]);
    const exists = listing.objects.length > 0 && !(await isAbandonedPlaceholderSite(env.BUCKET, slug));
    return jsonResponse({
      slug,
      exists,
      kind: exists ? manifestKind || "static" : null,
      source: exists ? config?.source || null : null,
    });
  }

  const withStats = url.searchParams.get("stats") === "1";
  const statsSlug = url.searchParams.get("slug");

  const slugs = await listSiteSlugs(env.BUCKET);
  const sites = [];
  for (const slug of slugs) {
    if (await isAbandonedPlaceholderSite(env.BUCKET, slug)) continue;
    const config = (await loadSiteConfig(env.BUCKET, slug)) || { slug };
    let stats = config.stats;
    if (withStats && (!statsSlug || statsSlug === slug)) {
      stats = await computeSiteStats(env.BUCKET, slug, config.stats);
      // 缓存命中时 computeSiteStats 直接返回 config.stats 同一引用，跳过多余写入。
      if (stats !== config.stats) {
        await saveSiteConfig(env.BUCKET, { ...config, slug, stats });
      }
    }
    sites.push({
      slug,
      spa: Boolean(config.spa),
      passwordProtected: Boolean(config.passwordHash),
      hostname: config.hostname || null,
      stats: stats || null,
    });
  }

  return jsonResponse({
    sitesHost: normalizeSitesHost(env.SITES_HOST) || null,
    sites,
  });
};

export const onRequestPost: PagesFunction<SitesApiEnv> = async (context) => {
  const { request, env } = context;
  if (!(await isSessionOrKeyAuthorized(
      request,
      env.BUCKET,
      env.WEBDAV_USERNAME,
      env.WEBDAV_PASSWORD
    ))) {
    return textResponse("Unauthorized", 401);
  }

  let body: {
    slug?: string;
    spa?: boolean;
    source?: string;
    password?: string | null;
    hostname?: string | null;
    nav?: unknown;
    album?: unknown;
    podcast?: unknown;
    downloads?: unknown;
    bookshelf?: unknown;
    dir?: unknown;
    docs?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const slug = String(body.slug || "").trim().toLowerCase();
  if (!isValidSlug(slug)) {
    return new Response("Bad slug", { status: 400 });
  }

  // Publish: copy a drive folder onto sites/{slug}/ (same semantics as MCP publish_site).
  const sourceRaw = typeof body.source === "string" ? body.source.trim() : "";
  if (sourceRaw) {
    const flags = await loadFeatureFlags(env.BUCKET);
    if (!flags.sites) return featureDisabledResponse();

    const source = normalizeDirKey(sourceRaw);
    if (source instanceof Response) return source;

    const targetPrefix = `${SITES_PREFIX}${slug}`;
    if (source === targetPrefix || source.startsWith(`${targetPrefix}/`)) {
      return textResponse("source cannot be the target site folder", 400);
    }

    if (!(await resolveAsDirectory(env.BUCKET, source))) {
      return textResponse("source folder not found", 404);
    }

    const descendants = await listDescendants(env.BUCKET, source);
    if (descendants instanceof Response) return descendants;

    // 普通文件夹发布 = 普通静态站（#160）：之前若是公开目录 / 相册 / 文档站（或只做了 plan 的发布），
    // 复制完成后删掉上次生成的文件、两份清单和发布计划，站点回到「没有清单」的静态站规则。
    // 先复制、最后删清单：复制途中旧清单仍生效，旧的生成文件不会提前变成可执行。
    const sitePrefix = `${SITES_PREFIX}${slug}/`;
    const previouslyOwned = await loadOwnedSiteRels(env.BUCKET, sitePrefix);
    const manifestNames = SITE_MANIFEST_NAMES as readonly string[];
    const written = new Set<string>();
    let copied = 0;
    for (const object of descendants.objects) {
      if (isCollectionObject(object)) continue;
      const rel = object.key.slice(source.length + 1);
      if (!rel || rel.includes("..")) continue;
      // 源文件夹根目录里的清单文件不复制，否则会把普通静态站变成生成型站点
      if (manifestNames.includes(rel)) continue;
      const to = `${sitePrefix}${rel}`;
      const error = await copyObject(env.BUCKET, object.key, to, { overwrite: true });
      if (error) return error;
      written.add(rel);
      copied += 1;
    }
    const stale = previouslyOwned
      .filter((rel) => !manifestNames.includes(rel) && !written.has(rel))
      .map((rel) => `${sitePrefix}${rel}`);
    // 首页走回收站兜底（#177）：发布计划进行中上传的首页、被生成首页覆盖前的首页都不会被硬删
    await deleteSiteKeys(env.BUCKET, sitePrefix, stale);
    await deleteKeysInChunks(env.BUCKET, [
      ...manifestNames.map((name) => `${sitePrefix}${name}`),
      sitePublishPlanKey(slug),
    ]);
    // 之前有清单（生成型站点或放弃的发布）：服务规则变了，记下时间并入 Last-Modified（#173）。
    // 否则直接放进 sites/ 的 html 会回到旧的修改时间，浏览器带 If-Modified-Since 拿到 304，
    // 继续用「强制下载」时期的副本。
    const hadManifest = previouslyOwned.some((rel) => manifestNames.includes(rel));
    await recordSiteSource(env.BUCKET, slug, source, hadManifest ? { policyAt: new Date() } : {});

    return jsonResponse({
      slug,
      source,
      copied,
      sitesHost: normalizeSitesHost(env.SITES_HOST) || null,
    });
  }

  if (Object.prototype.hasOwnProperty.call(body, "nav")) {
    return publishNav(env, slug, body.nav);
  }
  if (Object.prototype.hasOwnProperty.call(body, "album")) {
    return publishAlbum(env, slug, body.album);
  }
  if (Object.prototype.hasOwnProperty.call(body, "podcast")) {
    return publishPodcast(env, slug, body.podcast);
  }
  if (Object.prototype.hasOwnProperty.call(body, "downloads")) {
    return publishDownloads(env, slug, body.downloads);
  }
  if (Object.prototype.hasOwnProperty.call(body, "bookshelf")) {
    return publishBookshelf(env, slug, body.bookshelf);
  }
  if (Object.prototype.hasOwnProperty.call(body, "dir")) {
    const flags = await loadFeatureFlags(env.BUCKET);
    if (!flags.sites) return featureDisabledResponse();
    return handleDirPublish(env.BUCKET, slug, body.dir, env.SITES_HOST);
  }

  if (Object.prototype.hasOwnProperty.call(body, "docs")) {
    const flags = await loadFeatureFlags(env.BUCKET);
    if (!flags.sites) return featureDisabledResponse();
    return handleDocsPublish(env.BUCKET, slug, body.docs, env.SITES_HOST);
  }

  // 只允许给已存在的站点改配置：前缀下至少要有一个对象
  const existing = await env.BUCKET.list({ prefix: `${SITES_PREFIX}${slug}/`, limit: 1 });
  if (existing.objects.length === 0) {
    return new Response("Site not found", { status: 404 });
  }

  const config = (await loadSiteConfig(env.BUCKET, slug)) || { slug };
  config.slug = slug;
  if (typeof body.spa === "boolean") {
    config.spa = body.spa;
  }

  // password key present: set (non-empty) or clear (null/""); omit leaves hash unchanged.
  // Never store plaintext — SHA-256 hex only; never echo the secret back.
  if (Object.prototype.hasOwnProperty.call(body, "password")) {
    if (body.password === null || body.password === "") {
      delete config.passwordHash;
    } else if (typeof body.password !== "string") {
      return new Response("Bad password", { status: 400 });
    } else {
      const password = body.password;
      if (password.length > SITE_PASSWORD_MAX_LEN) {
        return new Response("Password too long", { status: 400 });
      }
      config.passwordHash = await hashSitePassword(password);
    }
  }

  // hostname key present: set (non-empty) or clear (null/""); omit leaves unchanged.
  // Uniqueness: one hostname → one slug via reverse index.
  if (Object.prototype.hasOwnProperty.call(body, "hostname")) {
    if (body.hostname === null || body.hostname === "") {
      if (config.hostname) {
        await deleteHostnameIndex(env.BUCKET, config.hostname);
        delete config.hostname;
      }
    } else if (typeof body.hostname !== "string") {
      return new Response("Bad hostname", { status: 400 });
    } else {
      const hostname = normalizeHostname(body.hostname);
      if (!isValidHostname(hostname)) {
        return new Response("Bad hostname", { status: 400 });
      }
      const sitesHost = normalizeSitesHost(env.SITES_HOST);
      if (sitesHost && hostname === sitesHost) {
        return new Response("Hostname cannot equal SITES_HOST", { status: 400 });
      }
      const existingSlug = await loadSlugForHostname(env.BUCKET, hostname);
      if (existingSlug && existingSlug !== slug) {
        return new Response("Hostname already in use", { status: 409 });
      }
      if (config.hostname && config.hostname !== hostname) {
        await deleteHostnameIndex(env.BUCKET, config.hostname);
      }
      await putHostnameIndex(env.BUCKET, hostname, slug);
      config.hostname = hostname;
    }
  }

  await saveSiteConfig(env.BUCKET, config);

  return jsonResponse({
    slug,
    spa: Boolean(config.spa),
    passwordProtected: Boolean(config.passwordHash),
    hostname: config.hostname || null,
  });
};

export const onRequestDelete: PagesFunction<SitesApiEnv> = async (context) => {
  const { request, env } = context;
  if (!(await isSessionOrKeyAuthorized(
      request,
      env.BUCKET,
      env.WEBDAV_USERNAME,
      env.WEBDAV_PASSWORD
    ))) {
    return textResponse("Unauthorized", 401);
  }

  const slug = (new URL(request.url).searchParams.get("slug") || "").trim().toLowerCase();
  if (!isValidSlug(slug)) {
    return new Response("Bad slug", { status: 400 });
  }

  // 分批删除站点对象（R2 单次最多 1000 个键），封顶防止超大站点拖垮请求。
  // 默认保留站点配置（重新部署同一 slug 时 SPA 开关等自动保留）；
  // purge=1 连配置一起删，用于彻底移除站点。
  const purge = new URL(request.url).searchParams.get("purge") === "1";
  let deleted = 0;
  let cursor: string | undefined;
  do {
    const listing = await env.BUCKET.list({
      prefix: `${SITES_PREFIX}${slug}/`,
      cursor,
      limit: 500,
    });
    const keys = listing.objects.map((object) => object.key);
    if (keys.length > 0) {
      await env.BUCKET.delete(keys);
      deleted += keys.length;
    }
    if (deleted >= SITE_DELETE_MAX_OBJECTS && listing.truncated) {
      return new Response(
        `站点对象超过 ${SITE_DELETE_MAX_OBJECTS}，请用 WebDAV/CLI 分批清理`,
        { status: 400 }
      );
    }
    if (!listing.truncated) break;
    cursor = listing.cursor;
  } while (true);

  // 站点内容没了，未完成的发布计划也没有意义（#160：放弃的计划以前删站点也会留着）
  await env.BUCKET.delete(sitePublishPlanKey(slug));
  if (purge) {
    const config = await loadSiteConfig(env.BUCKET, slug);
    if (config?.hostname) await deleteHostnameIndex(env.BUCKET, config.hostname);
    await env.BUCKET.delete(siteConfigKey(slug));
  }
  return jsonResponse({ slug, deleted });
};
