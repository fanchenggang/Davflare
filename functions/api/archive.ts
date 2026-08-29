import { Zip, ZipPassThrough } from "fflate";

interface ArchiveEnv {
  BUCKET: R2Bucket;
  WEBDAV_USERNAME: string;
  WEBDAV_PASSWORD: string;
}

async function listObjects(bucket: R2Bucket, prefix: string) {
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

export const onRequestPost: PagesFunction<ArchiveEnv> = async (context) => {
  const { request, env } = context;

  const authorization = request.headers.get("Authorization");
  const expected = `Basic ${btoa(
    `${env.WEBDAV_USERNAME}:${env.WEBDAV_PASSWORD}`
  )}`;
  if (!authorization || authorization !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  let selectedKeys: string[];
  try {
    const body = (await request.json()) as { keys?: string[] };
    selectedKeys = body.keys ?? [];
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  if (!Array.isArray(selectedKeys) || selectedKeys.length === 0) {
    return new Response("Bad Request", { status: 400 });
  }

  const fileKeys = new Set<string>();
  const objectSet = new Map<string, R2Object>();
  const emptyDirNames = new Set<string>();

  for (const rawKey of selectedKeys) {
    const key = decodeURIComponent(rawKey).replace(/\/$/, "");
    if (!key) continue;

    const head = await env.BUCKET.head(key);
    const isExplicitDir =
      head?.httpMetadata?.contentType === "application/x-directory";

    const descendants = await listObjects(env.BUCKET, `${key}/`);
    if (descendants.length === 0) {
      if (isExplicitDir) {
        emptyDirNames.add(`${key}/`);
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

  // Distinguish files from directory placeholders by checking for children.
  // This also covers directories created by tools that omit the
  // application/x-directory content-type.
  for (const [key, object] of objectSet) {
    const hasChildren = [...objectSet.keys()].some((candidate) =>
      candidate.startsWith(`${key}/`)
    );
    if (hasChildren) continue;
    if (object.httpMetadata?.contentType === "application/x-directory") {
      emptyDirNames.add(`${key}/`);
    } else {
      fileKeys.add(key);
    }
  }

  const stream = new ReadableStream({
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
            const object = await env.BUCKET.get(key);
            if (!object || !("body" in object)) continue;
            const entry = new ZipPassThrough(key);
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

  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="archive.zip"',
    },
  });
};
