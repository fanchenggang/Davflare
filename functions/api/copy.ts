import {
  authorizeApiKey,
  copyObject,
  isInternalKey,
  isTruthyParam,
  jsonResponse,
  normalizeFileKey,
  textResponse,
  touchLastUsed,
} from "./_apikey";

interface CopyEnv {
  BUCKET: R2Bucket;
}

async function readCopyInput(request: Request): Promise<
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
  // 禁止把文件拷贝进其自身内部（单文件不适用，但防御 from/a → from/a/b 之类的目录歧义）
  if (to.startsWith(`${from}/`)) {
    return textResponse("to 不能位于 from 内部", 400);
  }
  return { from, to, overwrite };
}

export const onRequestPost: PagesFunction<CopyEnv> = async (context) => {
  const { request, env } = context;
  const auth = await authorizeApiKey(request, env.BUCKET);
  if (auth instanceof Response) return auth;

  const input = await readCopyInput(request);
  if (input instanceof Response) return input;

  const result = await copyObject(env.BUCKET, input.from, input.to, {
    overwrite: input.overwrite,
  });
  if (result instanceof Response) return result;

  await touchLastUsed(env.BUCKET, auth);
  return jsonResponse({ from: input.from, to: input.to, copied: true });
};
