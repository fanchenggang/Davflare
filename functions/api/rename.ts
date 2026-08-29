import {
  authorizeApiKey,
  copyThenDelete,
  ensureFolderMarkers,
  isCollectionObject,
  isInternalKey,
  isPrefixOnlyFolder,
  isTruthyParam,
  jsonResponse,
  moveDirectory,
  normalizeFileKey,
  textResponse,
  touchLastUsed,
} from "./_apikey";

interface RenameEnv {
  BUCKET: R2Bucket;
}

async function readRenameInput(request: Request): Promise<
  { from: string; to: string; overwrite: boolean } | Response
> {
  const url = new URL(request.url);
  let body: { from?: unknown; to?: unknown; overwrite?: unknown } = {};
  const contentType = request.headers.get("Content-Type") || "";
  if (contentType.toLowerCase().includes("application/json")) {
    try {
      const parsed = await request.json();
      if (parsed && typeof parsed === "object") {
        body = parsed as typeof body;
      }
    } catch {
      return textResponse("无法解析 JSON", 400);
    }
  }

  const fromRaw =
    url.searchParams.get("from") ||
    (typeof body.from === "string" ? body.from : null);
  const toRaw =
    url.searchParams.get("to") ||
    (typeof body.to === "string" ? body.to : null);
  const overwrite =
    isTruthyParam(url.searchParams.get("overwrite")) ||
    isTruthyParam(body.overwrite);

  const from = normalizeFileKey(fromRaw);
  if (from instanceof Response) {
    return fromRaw ? from : textResponse("缺少 from 参数", 400);
  }
  const to = normalizeFileKey(toRaw);
  if (to instanceof Response) {
    return toRaw ? to : textResponse("缺少 to 参数", 400);
  }
  if (from === to) {
    return textResponse("from 与 to 不能相同", 400);
  }
  if (isInternalKey(from) || isInternalKey(to)) {
    return textResponse("禁止访问内部目录", 400);
  }
  return { from, to, overwrite };
}

export const onRequestPost: PagesFunction<RenameEnv> = async (context) => {
  const { request, env } = context;
  const auth = await authorizeApiKey(request, env.BUCKET);
  if (auth instanceof Response) return auth;

  const input = await readRenameInput(request);
  if (input instanceof Response) return input;

  const sourceHead = await env.BUCKET.head(input.from);
  const sourceIsDir =
    sourceHead !== null
      ? isCollectionObject(sourceHead)
      : await isPrefixOnlyFolder(env.BUCKET, input.from);
  if (sourceHead === null && !sourceIsDir) {
    return textResponse("文件不存在", 404);
  }

  if (!sourceIsDir) {
    const destHead = await env.BUCKET.head(input.to);
    if (destHead !== null) {
      if (isCollectionObject(destHead)) {
        return textResponse("目标已存在且为目录", 409);
      }
      if (!input.overwrite) {
        return textResponse("目标已存在", 409);
      }
    } else if (await isPrefixOnlyFolder(env.BUCKET, input.to)) {
      return textResponse("目标已存在且为目录", 409);
    }

    const slash = input.to.lastIndexOf("/");
    if (slash > 0) {
      await ensureFolderMarkers(env.BUCKET, input.to.slice(0, slash + 1));
    }

    const copied = await copyThenDelete(env.BUCKET, input.from, input.to);
    if (copied) return copied;

    await touchLastUsed(env.BUCKET, auth);
    return jsonResponse({ from: input.from, to: input.to });
  }

  // 目录整体移动（rename / move）
  if (input.overwrite) {
    return textResponse("目录移动不支持 overwrite", 400);
  }
  if (input.to === input.from || input.to.startsWith(`${input.from}/`)) {
    return textResponse("目标目录不能是源目录自身或其子路径", 400);
  }
  const destHead = await env.BUCKET.head(input.to);
  if (destHead !== null || (await isPrefixOnlyFolder(env.BUCKET, input.to))) {
    return textResponse("目标目录已存在", 409);
  }
  const slash = input.to.lastIndexOf("/");
  if (slash > 0) {
    await ensureFolderMarkers(env.BUCKET, input.to.slice(0, slash + 1));
  }

  const moved = await moveDirectory(env.BUCKET, input.from, input.to);
  if (moved) return moved;

  await touchLastUsed(env.BUCKET, auth);
  return jsonResponse({ from: input.from, to: input.to, kind: "directory" });
};
