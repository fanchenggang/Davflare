import { buildZipStream } from "./_zip";
import { decodeRawPath, isInternalKey, verifyBasicAuth } from "./_apikey";

interface ArchiveEnv {
  BUCKET: R2Bucket;
  WEBDAV_USERNAME: string;
  WEBDAV_PASSWORD: string;
}

export const onRequestPost: PagesFunction<ArchiveEnv> = async (context) => {
  const { request, env } = context;

  if (!verifyBasicAuth(request, env.WEBDAV_USERNAME, env.WEBDAV_PASSWORD)) {
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

  // 与其他端点一致：禁止把内部目录（shares/apikeys/trash 元数据）打进压缩包。
  // buildZipStream 内部会 decodeURIComponent，这里用 decodeRawPath 做同样的归一化后再判断。
  for (const rawKey of selectedKeys) {
    if (typeof rawKey !== "string") {
      return new Response("Bad Request", { status: 400 });
    }
    if (isInternalKey(decodeRawPath(rawKey))) {
      return new Response("禁止访问内部目录", { status: 400 });
    }
  }

  const stream = await buildZipStream(env.BUCKET, selectedKeys);
  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="archive.zip"',
    },
  });
};
