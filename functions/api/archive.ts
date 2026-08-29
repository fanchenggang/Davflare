import { buildZipStream } from "./_zip";

interface ArchiveEnv {
  BUCKET: R2Bucket;
  WEBDAV_USERNAME: string;
  WEBDAV_PASSWORD: string;
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

  const stream = await buildZipStream(env.BUCKET, selectedKeys);
  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="archive.zip"',
    },
  });
};
