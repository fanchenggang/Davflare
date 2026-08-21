export interface RequestHandlerParams {
  bucket: R2Bucket;
  path: string;
  request: Request;
}

export const WEBDAV_ENDPOINT = "/webdav/";

export interface FsEntry {
  key: string;
  isDir: boolean;
  uploaded: Date;
  size: number;
  httpMetadata?: {
    contentType?: string;
    contentDisposition?: string;
    contentLanguage?: string;
  };
  customMetadata?: Record<string, string>;
  etag?: string;
}

export const ROOT_OBJECT: FsEntry = {
  key: "",
  isDir: true,
  uploaded: new Date(),
  httpMetadata: {
    contentType: "application/x-directory",
    contentDisposition: undefined,
    contentLanguage: undefined,
  },
  customMetadata: undefined,
  size: 0,
  etag: undefined,
};

export function notFound() {
  return new Response("Not found", { status: 404 });
}

export function parseBucketPath(context: any): [R2Bucket, string] {
  const { request, env, params } = context;
  const url = new URL(request.url);

  const pathSegments = (params.path || []) as String[];
  const path = decodeURIComponent(pathSegments.join("/"));
  const driveid = url.hostname.replace(/\..*/, "");

  return [env[driveid] || env["BUCKET"], path];
}

export function toFsEntry(object: R2Object, isDir: boolean): FsEntry {
  return {
    key: object.key,
    isDir,
    uploaded: object.uploaded,
    size: object.size,
    httpMetadata: object.httpMetadata,
    customMetadata: object.customMetadata,
    etag: object.etag,
  };
}

export async function* listAll(
  bucket: R2Bucket,
  prefix?: string,
  isRecursive: boolean = false
): AsyncGenerator<FsEntry> {
  const seen = new Set<string>();
  let cursor: string | undefined = undefined;
  do {
    var r2Objects = await bucket.list({
      prefix: prefix,
      delimiter: isRecursive ? undefined : "/",
      cursor: cursor,
      // @ts-ignore
      include: ["httpMetadata", "customMetadata"],
    });

    const entries = new Map<string, FsEntry>();

    // Placeholder objects and files
    for (const obj of r2Objects.objects) {
      if (obj.key.startsWith("_$flaredrive$/")) continue;
      const isDir =
        obj.httpMetadata?.contentType === "application/x-directory";
      entries.set(obj.key, toFsEntry(obj, isDir));
    }

    if (isRecursive) {
      // Folders implied by the key hierarchy (a/b/c => a, a/b are directories)
      for (const key of [...entries.keys()]) {
        if (!key) continue;
        const parts = key.split("/");
        for (let i = 1; i < parts.length; i++) {
          const ancestor = parts.slice(0, i).join("/");
          const existing = entries.get(ancestor);
          if (existing) existing.isDir = true;
          else
            entries.set(ancestor, {
              key: ancestor,
              isDir: true,
              uploaded: new Date(),
              size: 0,
              httpMetadata: { contentType: "application/x-directory" },
            });
        }
      }
    } else {
      // Folders surfaced by the delimiter (no placeholder object needed)
      for (const dir of r2Objects.delimitedPrefixes) {
        if (dir.startsWith("_$flaredrive$/")) continue;
        const key = dir.endsWith("/") ? dir.slice(0, -1) : dir;
        const existing = entries.get(key);
        if (existing) existing.isDir = true;
        else
          entries.set(key, {
            key,
            isDir: true,
            uploaded: new Date(),
            size: 0,
            httpMetadata: { contentType: "application/x-directory" },
          });
      }
    }

    for (const entry of entries.values()) {
      if (seen.has(entry.key)) continue;
      seen.add(entry.key);
      yield entry;
    }

    if (r2Objects.truncated) cursor = r2Objects.cursor;
  } while (r2Objects.truncated);
}
