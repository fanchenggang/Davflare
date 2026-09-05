import {
  authorizeApiKey,
  decodeRawPath,
  isCollectionObject,
  isInternalKey,
  jsonResponse,
  splitSafeParts,
  textResponse,
  touchLastUsed,
} from "./_apikey";

interface ListEnv {
  BUCKET: R2Bucket;
}

const LIST_LIMIT_MAX = 1000;

interface ListItem {
  key: string;
  name: string;
  size: number;
  isDir: boolean;
  uploaded: string | null;
  updated: string | null;
  etag: string | null;
}

function normalizeFolder(raw: string | null): string | Response {
  const decoded = decodeRawPath(raw);
  if (!decoded) return "";
  const parts = splitSafeParts(decoded);
  if (parts instanceof Response) return parts;
  if (parts.length === 0) return "";
  const joined = parts.join("/");
  if (isInternalKey(joined)) {
    return textResponse("禁止访问内部目录", 400);
  }
  return `${joined}/`;
}

function fileUploaded(object: R2Object): string {
  const raw = object.uploaded;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString();
  }
  if (raw) {
    const parsed = new Date(raw as unknown as string);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date(0).toISOString();
}

function fileEtag(object: R2Object): string {
  const httpEtag = (object as { httpEtag?: string }).httpEtag;
  if (httpEtag) return httpEtag;
  if (object.etag) return object.etag;
  return "";
}

// 把一页 R2 listing 折叠进 itemsByKey（对象 + 分隔前缀 → 条目）
function collectPage(
  listing: R2Objects,
  folder: string,
  itemsByKey: Map<string, ListItem>
) {
  for (const object of listing.objects) {
    if (isInternalKey(object.key)) continue;
    const name = object.key.slice(folder.length);
    if (!name || name.includes("/")) continue;
    const isDir = isCollectionObject(object);
    const uploaded = fileUploaded(object);
    const item: ListItem = {
      key: object.key,
      name,
      size: isDir ? 0 : Number(object.size) || 0,
      isDir,
      uploaded,
      updated: uploaded,
      etag: fileEtag(object),
    };
    itemsByKey.set(object.key, item);
  }

  const prefixes = (listing as { delimitedPrefixes?: string[] })
    .delimitedPrefixes;
  if (prefixes) {
    for (const prefix of prefixes) {
      if (isInternalKey(prefix)) continue;
      const name = prefix.slice(folder.length).replace(/\/$/, "");
      if (!name) continue;
      const key = prefix.replace(/\/$/, "");
      if (itemsByKey.has(key)) {
        const existing = itemsByKey.get(key)!;
        existing.isDir = true;
        existing.size = 0;
      } else {
        itemsByKey.set(key, {
          key,
          name,
          size: 0,
          isDir: true,
          uploaded: null,
          updated: null,
          etag: null,
        });
      }
    }
  }
}

function sortItems(items: ListItem[]): ListItem[] {
  return items.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name, "zh");
  });
}

export const onRequestGet: PagesFunction<ListEnv> = async (context) => {
  const { request, env } = context;
  const auth = await authorizeApiKey(request, env.BUCKET);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const folder = normalizeFolder(url.searchParams.get("path"));
  if (folder instanceof Response) return folder;

  // 分页模式：limit + cursor 单页透传（nextCursor 以 truncated 为准）
  const limitParam = url.searchParams.get("limit");
  let limit: number | undefined;
  if (limitParam !== null && limitParam !== "") {
    const parsed = Number(limitParam);
    if (
      !Number.isFinite(parsed) ||
      !Number.isInteger(parsed) ||
      parsed < 1 ||
      parsed > LIST_LIMIT_MAX
    ) {
      return textResponse(`limit 需为 1-${LIST_LIMIT_MAX} 的整数`, 400);
    }
    limit = parsed;
  }
  const cursorParam = url.searchParams.get("cursor") || undefined;

  let folderHead: R2Object | null = null;
  if (folder) {
    const parentKey = folder.replace(/\/$/, "");
    folderHead = await env.BUCKET.head(parentKey);
    if (folderHead !== null && !isCollectionObject(folderHead)) {
      return textResponse("path 是文件，请使用 /api/download 下载", 400);
    }
  }

  const itemsByKey = new Map<string, ListItem>();
  let nextCursor: string | undefined;

  if (limit !== undefined) {
    const listing = await env.BUCKET.list({
      prefix: folder,
      delimiter: "/",
      cursor: cursorParam,
      limit,
      include: ["httpMetadata", "customMetadata"],
    });
    collectPage(listing, folder, itemsByKey);
    if (listing.truncated) nextCursor = listing.cursor;
  } else {
    let cursor: string | undefined;
    do {
      const listing = await env.BUCKET.list({
        prefix: folder,
        delimiter: "/",
        cursor,
        include: ["httpMetadata", "customMetadata"],
      });
      collectPage(listing, folder, itemsByKey);
      if (!listing.truncated) break;
      cursor = listing.cursor;
    } while (true);
  }

  if (
    folder &&
    folderHead === null &&
    itemsByKey.size === 0 &&
    !nextCursor
  ) {
    return textResponse("目录不存在", 404);
  }

  await touchLastUsed(env.BUCKET, auth);

  const items = sortItems(Array.from(itemsByKey.values()));
  return jsonResponse(
    nextCursor ? { items, nextCursor } : { items }
  );
};
