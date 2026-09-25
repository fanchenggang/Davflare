import { contentDisposition } from "./_disposition";
import { buildZipStream } from "./_zip";
import {
  decodeRawPath,
  isCollectionObject,
  isInternalKey,
  isSessionOrKeyAuthorized,
  normalizeDirKey,
  textResponse,
} from "./_apikey";

interface ArchiveEnv {
  BUCKET: R2Bucket;
  WEBDAV_USERNAME: string;
  WEBDAV_PASSWORD: string;
}

function basename(key: string) {
  const name = key.split("/").filter(Boolean).pop() || "archive";
  return name.replace(/[\u0000-\u001f]/g, "");
}

function attachmentDisposition(filename: string) {
  return contentDisposition(filename, "attachment", "archive.zip");
}

async function authorizeArchive(
  request: Request,
  env: ArchiveEnv
): Promise<Response | null> {
  if (
    !(await isSessionOrKeyAuthorized(
      request,
      env.BUCKET,
      env.WEBDAV_USERNAME,
      env.WEBDAV_PASSWORD
    ))
  ) {
    return textResponse("Unauthorized", 401);
  }
  return null;
}

async function zipResponse(
  bucket: R2Bucket,
  selectedKeys: string[],
  options: { stripPrefix?: string; filename?: string } = {}
) {
  const stream = await buildZipStream(bucket, selectedKeys, {
    stripPrefix: options.stripPrefix,
  });
  const filename = options.filename || "archive.zip";
  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": attachmentDisposition(filename),
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Authenticated folder/file zip for Open API + web UI.
 * - POST { keys: string[], base?: string }: multi-select (session Basic or API key).
 *   Optional `base` (the folder the selection lives in) strips that prefix from entry paths
 *   and names the zip `<base name>.zip`; without it entries keep full keys (unchanged behaviour).
 * - GET ?path=: single key (folder preferred); directories strip the folder prefix
 *   so zip roots at the folder name, matching directory shares.
 */
export const onRequestPost: PagesFunction<ArchiveEnv> = async (context) => {
  const { request, env } = context;
  const denied = await authorizeArchive(request, env);
  if (denied) return denied;

  let selectedKeys: string[];
  let rawBase: unknown;
  try {
    const body = (await request.json()) as { keys?: string[]; base?: unknown };
    selectedKeys = body.keys ?? [];
    rawBase = body.base;
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

  if (rawBase !== undefined && rawBase !== null && typeof rawBase !== "string") {
    return new Response("Bad Request", { status: 400 });
  }
  const base = decodeRawPath(typeof rawBase === "string" ? rawBase : "").replace(/\/+$/, "");
  if (base && isInternalKey(base)) {
    return new Response("禁止访问内部目录", { status: 400 });
  }

  return zipResponse(env.BUCKET, selectedKeys, {
    stripPrefix: base || undefined,
    filename: base ? `${basename(base)}.zip` : "archive.zip",
  });
};

export const onRequestGet: PagesFunction<ArchiveEnv> = async (context) => {
  const { request, env } = context;
  const denied = await authorizeArchive(request, env);
  if (denied) return denied;

  const rawPath = new URL(request.url).searchParams.get("path");
  const keyOrErr = normalizeDirKey(rawPath);
  if (keyOrErr instanceof Response) return keyOrErr;
  const key = keyOrErr;

  const head = await env.BUCKET.head(key);
  const listing = await env.BUCKET.list({
    prefix: `${key}/`,
    limit: 1,
  });
  const hasChildren = listing.objects.length > 0;
  const isDir =
    isCollectionObject(head) ||
    (rawPath || "").trim().endsWith("/") ||
    (head === null && hasChildren);

  if (head === null && !hasChildren) {
    return textResponse("路径不存在", 404);
  }

  // 目录：去掉父前缀，zip 根即该文件夹内容（与目录分享一致）。
  // 单文件：整键打进 zip，便于脚本对文件也走同一接口。
  const filename = `${basename(key)}.zip`;
  return zipResponse(env.BUCKET, [key], {
    stripPrefix: isDir ? key : undefined,
    filename,
  });
};
