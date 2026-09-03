import { Zip, ZipPassThrough } from "fflate";
import { decodeRawPath } from "./_apikey";

// 把选中键（文件或目录）打包为 zip 流。目录递归收齐后代，空目录写占位条目。
// archive（会话鉴权）与 share（目录分享）共用。

export async function listAllObjects(
  bucket: R2Bucket,
  prefix: string
): Promise<R2Object[]> {
  const objects: R2Object[] = [];
  let cursor: string | undefined;
  do {
    const listing = await bucket.list({
      prefix,
      cursor,
      // @ts-ignore `include` is supported by R2 but missing from this types version.
      include: ["httpMetadata"],
    });
    objects.push(...listing.objects);
    if (!listing.truncated) break;
    cursor = listing.cursor;
  } while (true);
  return objects;
}

export async function buildZipStream(
  bucket: R2Bucket,
  selectedKeys: string[],
  options: { stripPrefix?: string } = {}
): Promise<ReadableStream<Uint8Array>> {
  const stripPrefix = options.stripPrefix?.replace(/\/$/, "") ?? null;
  const rel = (key: string) =>
    stripPrefix && key.startsWith(`${stripPrefix}/`)
      ? key.slice(stripPrefix.length + 1)
      : key;

  const fileKeys = new Set<string>();
  const objectSet = new Map<string, R2Object>();
  const emptyDirNames = new Set<string>();

  for (const rawKey of selectedKeys) {
    // 使用与 API 鉴权层一致的 decodeRawPath（内部已 try/catch），
    // 避免对真实文件名里的字面量 `%`（如 100%.txt）二次 decode 时抛 URIError。
    const key = decodeRawPath(rawKey).replace(/\/$/, "");
    if (!key) continue;

    const head = await bucket.head(key);
    const isExplicitDir =
      head?.httpMetadata?.contentType === "application/x-directory";

    const descendants = await listAllObjects(bucket, `${key}/`);
    if (descendants.length === 0) {
      if (isExplicitDir) {
        emptyDirNames.add(`${rel(key)}/`);
      } else if (head !== null) {
        fileKeys.add(key);
      }
      continue;
    }

    for (const object of descendants) {
      if (object.key.startsWith("_$flaredrive$/")) continue;
      objectSet.set(object.key, object);
    }
  }

  // 区分文件与目录占位：有子对象的是目录。同时覆盖未写
  // application/x-directory content-type 的工具建出的目录。
  for (const [key, object] of objectSet) {
    const hasChildren = [...objectSet.keys()].some((candidate) =>
      candidate.startsWith(`${key}/`)
    );
    if (hasChildren) continue;
    if (object.httpMetadata?.contentType === "application/x-directory") {
      emptyDirNames.add(`${rel(key)}/`);
    } else {
      fileKeys.add(key);
    }
  }

  return new ReadableStream({
    start(controller) {
      const zip = new Zip((error, data, final) => {
        if (error) {
          controller.error(error);
          return;
        }
        if (data) controller.enqueue(data);
        if (final) controller.close();
      });

      (async () => {
        try {
          for (const name of emptyDirNames) {
            const entry = new ZipPassThrough(name);
            zip.add(entry);
            entry.push(new Uint8Array(0), true);
          }

          for (const key of fileKeys) {
            const object = await bucket.get(key);
            if (!object || !("body" in object)) continue;
            const entry = new ZipPassThrough(rel(key));
            zip.add(entry);
            const reader = object.body.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              entry.push(value, false);
            }
            entry.push(new Uint8Array(0), true);
          }
          zip.end();
        } catch (error) {
          controller.error(error);
        }
      })();
    },
  });
}
