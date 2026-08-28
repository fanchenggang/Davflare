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

export const onRequestGet: PagesFunction<ListEnv> = async (context) => {
  const { request, env } = context;
  const auth = await authorizeApiKey(request, env.BUCKET);
  if (auth instanceof Response) return auth;

  const folder = normalizeFolder(new URL(request.url).searchParams.get("path"));
  if (folder instanceof Response) return folder;

  let folderHead: R2Object | null = null;
  if (folder) {
    const parentKey = folder.replace(/\/$/, "");
    folderHead = await env.BUCKET.head(parentKey);
    if (folderHead !== null && !isCollectionObject(folderHead)) {
      return textResponse("path 是文件，请使用 /api/download 下载", 400);
    }
  }

  const itemsByKey = new Map<string, ListItem>();
  let cursor: string | undefined;
  do {
    const listing = await env.BUCKET.list({
      prefix: folder,
      delimiter: "/",
      cursor,
      // @ts-ignore `include` is supported by R2 but missing from this types version.
      include: ["httpMetadata", "customMetadata"],
    });

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

    if (!listing.truncated) break;
    cursor = listing.cursor;
  } while (true);

  if (folder && folderHead === null && itemsByKey.size === 0) {
    return textResponse("目录不存在", 404);
  }

  await touchLastUsed(env.BUCKET, auth);

  const items = Array.from(itemsByKey.values()).sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name, "zh");
  });

  return jsonResponse({ items });
};
