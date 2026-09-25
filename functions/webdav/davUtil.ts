// WebDAV 通用工具：路径解析、集合（目录）判定、缩略图引用计数、条件请求头、
// 递归列表（listAll）与递归删除（deleteAll）。仅依赖 davTypes。
import type { DavObject, PagesContext } from "./davTypes";

const DAV_ENDPOINT = "/webdav";
const DAV_ENDPOINT_WITH_SLASH = "/webdav/";
const INTERNAL_PREFIX = "_$flaredrive$/";
const THUMBNAIL_PREFIX = "_$flaredrive$/thumbnails/";
const THUMBNAIL_REFS_PREFIX = `${THUMBNAIL_PREFIX}refs/`;
// 缩略图摘要由客户端生成（hex 编码哈希），写入 R2 key 前先校验格式。
const THUMBNAIL_DIGEST_RE = /^[a-f0-9]{16,128}$/;

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

// —— 缩略图引用计数 ————————————————————————————————
// 缩略图按内容摘要寻址（_$flaredrive$/thumbnails/<digest>.png）并被内容相同的
// 文件共享，删除单个文件时不能直接删图。每个引用文件在
// _$flaredrive$/thumbnails/refs/<digest>/<path> 保留一个不可变 marker 对象，
// 引用清零才回收缩略图。marker 是单次 PUT/DELETE 的独立对象，无读改写竞争：
// 并发删除最坏只会“多留”（无害泄漏），不会误删仍在使用的缩略图。

function isValidThumbnailDigest(digest: unknown): digest is string {
  return typeof digest === "string" && THUMBNAIL_DIGEST_RE.test(digest);
}

function thumbnailObjectKey(digest: string): string {
  return `${THUMBNAIL_PREFIX}${digest}.png`;
}

function thumbnailRefKey(digest: string, path: string): string {
  return `${THUMBNAIL_REFS_PREFIX}${digest}/${path}`;
}

async function addThumbnailRef(
  bucket: R2Bucket,
  digest: unknown,
  path: string,
): Promise<void> {
  if (!isValidThumbnailDigest(digest)) return;
  await bucket.put(thumbnailRefKey(digest, path), "");
}

/** 引用清零时回收缩略图。 */
async function gcThumbnail(bucket: R2Bucket, digest: unknown): Promise<void> {
  if (!isValidThumbnailDigest(digest)) return;
  const refs = await bucket.list({
    prefix: thumbnailRefKey(digest, ""),
    limit: 1,
  });
  if (refs.objects.length === 0) {
    await bucket.delete(thumbnailObjectKey(digest));
  }
}

/** 移除单个引用 marker，随后尝试回收缩略图。 */
async function releaseThumbnailRef(
  bucket: R2Bucket,
  digest: unknown,
  path: string,
): Promise<void> {
  if (!isValidThumbnailDigest(digest)) return;
  await bucket.delete(thumbnailRefKey(digest, path));
  await gcThumbnail(bucket, digest);
}

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function parseBucketPath(context: PagesContext): [R2Bucket, string] {
  const { request, env } = context;
  const url = new URL(request.url);

  let pathname = url.pathname;
  if (pathname === DAV_ENDPOINT) {
    pathname = DAV_ENDPOINT_WITH_SLASH;
  }
  let remainder = pathname.startsWith(DAV_ENDPOINT_WITH_SLASH)
    ? pathname.slice(DAV_ENDPOINT_WITH_SLASH.length)
    : "";
  remainder = remainder.endsWith("/") ? remainder.slice(0, -1) : remainder;
  const path = remainder
    .split("/")
    .map(decodePathSegment)
    .join("/");

  const driveId = url.hostname.replace(/\..*/, "");
  const bucket = env[driveId] || env.BUCKET;
  return [bucket, path];
}

function getResourceHref(key: string, isCollection: boolean): string {
  if (key === "") {
    return DAV_ENDPOINT_WITH_SLASH;
  }
  const encodedPath = key.split("/").map(encodeURIComponent).join("/");
  return `${DAV_ENDPOINT_WITH_SLASH}${encodedPath}${isCollection ? "/" : ""}`;
}

function decodeResourcePath(pathname: string): string {
  let resourcePath = pathname.slice(1);
  resourcePath = resourcePath.endsWith("/")
    ? resourcePath.slice(0, -1)
    : resourcePath;
  if (resourcePath === "") {
    return "";
  }
  return resourcePath.split("/").map(decodePathSegment).join("/");
}

function getParentPath(resourcePath: string): string {
  const normalizedPath = resourcePath.endsWith("/")
    ? resourcePath.slice(0, -1)
    : resourcePath;
  return normalizedPath.split("/").slice(0, -1).join("/");
}

function isCollectionObject(object: R2Object | DavObject | null | undefined): boolean {
  if (!object) {
    return false;
  }
  return (
    object.customMetadata?.resourcetype === "<collection />" ||
    object.httpMetadata?.contentType === "application/x-directory" ||
    (object as DavObject).isCollection === true
  );
}

async function hasCollectionResource(
  bucket: R2Bucket,
  resourcePath: string,
): Promise<boolean> {
  if (resourcePath === "") {
    return true;
  }

  const resource = await bucket.head(resourcePath);
  if (resource !== null) {
    if (isCollectionObject(resource)) {
      return true;
    }
  }

  // Folders created by other WebDAV clients may have no placeholder object.
  // Treat a path as a collection when it has descendants.
  const descendants = await bucket.list({
    prefix: `${resourcePath}/`,
    limit: 1,
  });
  return descendants.objects.length > 0 || descendants.delimitedPrefixes.length > 0;
}

async function isCollectionPath(
  bucket: R2Bucket,
  resourcePath: string,
): Promise<boolean> {
  if (resourcePath === "") {
    return true;
  }
  const resource = await bucket.head(resourcePath);
  if (resource !== null && isCollectionObject(resource)) {
    return true;
  }
  const descendants = await bucket.list({
    prefix: `${resourcePath}/`,
    limit: 1,
  });
  return descendants.objects.length > 0 || descendants.delimitedPrefixes.length > 0;
}

function parseDestinationPath(
  destinationHeader: string,
  requestUrl: string,
): string | null {
  try {
    const destinationUrl = new URL(destinationHeader, requestUrl);
    if (destinationUrl.origin !== new URL(requestUrl).origin) {
      return null;
    }

    let pathname = destinationUrl.pathname;
    if (!pathname.startsWith(DAV_ENDPOINT)) {
      return null;
    }
    return decodeResourcePath(pathname.slice(DAV_ENDPOINT.length) || "/");
  } catch {
    return null;
  }
}

function isSameOrDescendantPath(
  resourcePath: string,
  destinationPath: string,
): boolean {
  if (destinationPath === resourcePath) {
    return true;
  }
  if (resourcePath === "") {
    return destinationPath !== "";
  }
  return destinationPath.startsWith(`${resourcePath}/`);
}

function createdResponse(
  resourcePath: string,
  isCollection: boolean,
  body: BodyInit | null = "",
  extraHeaders?: Headers,
): Response {
  const headers = new Headers(extraHeaders);
  headers.set("Location", getResourceHref(resourcePath, isCollection));
  return new Response(body, {
    status: 201,
    headers,
  });
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  let mismatch = 0;
  for (let index = 0; index < left.byteLength; index++) {
    mismatch |= left[index] ^ right[index];
  }
  return mismatch === 0;
}

function getConditionalHeaders(source: Headers, excludeNoneMatch = false): Headers {
  const headers = new Headers();
  for (const name of [
    "if-match",
    "if-none-match",
    "if-modified-since",
    "if-unmodified-since",
    "if-range",
  ]) {
    if (excludeNoneMatch && name === "if-none-match") continue;
    const value = source.get(name);
    if (value !== null) {
      headers.set(name, value);
    }
  }
  return headers;
}

async function* listAll(
  bucket: R2Bucket,
  prefix?: string,
  isRecursive: boolean = false,
): AsyncGenerator<DavObject> {
  const seen = new Set<string>();
  let cursor: string | undefined = undefined;
  do {
    // The `include` option is intentionally typed loosely here because some
    // @cloudflare/workers-types versions lag behind the Workers runtime.
    // Paginate every page (truncated/cursor). Never drop later objects or
    // delimited prefixes — a missing snapshot.json is a client-filter bug,
    // not a reason to silently cap the listing.
    const r2Objects: R2Objects = await (bucket as any).list({
      prefix,
      delimiter: isRecursive ? undefined : "/",
      cursor,
      limit: 1000,
      include: ["httpMetadata", "customMetadata"],
    });

    const entries = new Map<string, DavObject>();

    for (const object of r2Objects.objects) {
      if (object.key.startsWith(INTERNAL_PREFIX)) {
        continue;
      }
      entries.set(object.key, {
        ...object,
        isCollection: isCollectionObject(object),
      });
    }

    if (isRecursive) {
      const effectivePrefix = prefix ?? "";
      for (const key of [...entries.keys()]) {
        if (!key || !key.startsWith(effectivePrefix)) {
          continue;
        }
        const relativePath = key.slice(effectivePrefix.length);
        const parts = relativePath.split("/");
        for (let index = 1; index < parts.length; index++) {
          const ancestor = effectivePrefix + parts.slice(0, index).join("/");
          const existing = entries.get(ancestor);
          if (existing) {
            existing.isCollection = true;
          } else {
            entries.set(ancestor, {
              key: ancestor,
              isCollection: true,
              uploaded: new Date(),
              size: 0,
              etag: "",
              httpMetadata: { contentType: "application/x-directory" },
            });
          }
        }
      }
    } else {
      for (const directory of r2Objects.delimitedPrefixes) {
        if (directory.startsWith(INTERNAL_PREFIX)) {
          continue;
        }
        const key = directory.endsWith("/") ? directory.slice(0, -1) : directory;
        const existing = entries.get(key);
        if (existing) {
          existing.isCollection = true;
        } else {
          entries.set(key, {
            key,
            isCollection: true,
            uploaded: new Date(),
            size: 0,
            etag: "",
            httpMetadata: { contentType: "application/x-directory" },
          });
        }
      }
    }

    for (const entry of entries.values()) {
      if (seen.has(entry.key)) {
        continue;
      }
      seen.add(entry.key);
      yield entry;
    }

    cursor = r2Objects.truncated ? r2Objects.cursor : undefined;
  } while (cursor);
}

async function deleteAll(
  bucket: R2Bucket,
  prefix?: string,
  excludeInternal: boolean = true,
): Promise<void> {
  let cursor: string | undefined = undefined;
  const releasedDigests = new Set<string>();
  do {
    const objects = await bucket.list({
      prefix,
      cursor,
      include: ["customMetadata"],
    });
    const keys = objects.objects
      .map((object) => object.key)
      .filter((key) => !excludeInternal || !key.startsWith(INTERNAL_PREFIX));
    if (keys.length > 0) {
      await bucket.delete(keys);
    }
    // 先逐个移除引用 marker（internal 子树本身不含 marker，无需处理），
    // 全部分页结束后再按 digest 去重回收一次缩略图。
    for (const object of objects.objects) {
      if (excludeInternal && object.key.startsWith(INTERNAL_PREFIX)) continue;
      const { thumbnail } = object.customMetadata ?? {};
      if (isValidThumbnailDigest(thumbnail)) {
        releasedDigests.add(thumbnail);
        await bucket.delete(thumbnailRefKey(thumbnail, object.key));
      }
    }
    cursor = objects.truncated ? objects.cursor : undefined;
  } while (cursor);
  for (const digest of releasedDigests) {
    await gcThumbnail(bucket, digest);
  }
}

function calcContentRange(object: R2ObjectBody) {
  let rangeOffset = 0;
  let rangeEnd = object.size - 1;
  if (object.range) {
    if ("suffix" in object.range) {
      rangeOffset = Math.max(object.size - object.range.suffix, 0);
    } else {
      rangeOffset = object.range.offset ?? 0;
      const length = object.range.length ?? object.size - rangeOffset;
      rangeEnd = Math.min(rangeOffset + length - 1, object.size - 1);
    }
  }
  return { rangeOffset, rangeEnd };
}

export {
  DAV_ENDPOINT,
  DAV_ENDPOINT_WITH_SLASH,
  INTERNAL_PREFIX,
  THUMBNAIL_PREFIX,
  escapeXml,
  isValidThumbnailDigest,
  thumbnailObjectKey,
  thumbnailRefKey,
  addThumbnailRef,
  gcThumbnail,
  releaseThumbnailRef,
  decodePathSegment,
  parseBucketPath,
  getResourceHref,
  decodeResourcePath,
  getParentPath,
  isCollectionObject,
  hasCollectionResource,
  isCollectionPath,
  parseDestinationPath,
  isSameOrDescendantPath,
  createdResponse,
  timingSafeEqual,
  getConditionalHeaders,
  listAll,
  deleteAll,
  calcContentRange,
};
