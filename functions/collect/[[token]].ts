/**
 * 文件收集链接匿名路由（无需登录，令牌即凭据）：
 *   GET|HEAD /collect/{token}            上传页
 *   POST     /collect/{token}/create     开始一个文件（声明 name/size/type）
 *   PUT      /collect/{token}/part       ?uploadId=&partNumber= 上传一块（≤10 MiB）
 *   POST     /collect/{token}/complete   { uploadId, parts }
 *   POST     /collect/{token}/abort      { uploadId }
 * 只读取 `_$flaredrive$/collects/{token}.json`；分享令牌在这里一律 404。
 */
import { collectStatus, isCollectToken, loadCollect } from "../_collect";
import { collectLang, renderCollectMessage, renderCollectPage } from "../_collectPage";
import {
  collectError,
  handleCollectAbort,
  handleCollectComplete,
  handleCollectCreate,
  handleCollectPart,
} from "../_collectUpload";

interface CollectEnv {
  BUCKET: R2Bucket;
}

function segmentsFromParams(params: Record<string, unknown>): string[] {
  const raw = params.token;
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string" && raw) return [raw];
  return [];
}

const ACTIONS: Record<string, string> = {
  create: "POST",
  part: "PUT",
  complete: "POST",
  abort: "POST",
};

export const onRequest: PagesFunction<CollectEnv> = async (context) => {
  const { request, env } = context;
  const method = request.method.toUpperCase();
  const [token, action, ...rest] = segmentsFromParams(context.params as Record<string, unknown>);
  const lang = collectLang(request);

  if (!action) {
    if (method !== "GET" && method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    const head = method === "HEAD";
    if (!isCollectToken(token)) return renderCollectMessage("notFound", lang, head);
    const loaded = await loadCollect(env.BUCKET, token);
    if (!loaded) return renderCollectMessage("notFound", lang, head);
    const status = collectStatus(loaded.record);
    if (status !== "active") return renderCollectMessage(status, lang, head);
    return renderCollectPage(loaded.record, token, lang, { head });
  }

  if (rest.length > 0 || !isCollectToken(token) || !Object.prototype.hasOwnProperty.call(ACTIONS, action)) {
    return collectError("not_found", 404);
  }
  if (method !== ACTIONS[action]) {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: ACTIONS[action] } });
  }
  switch (action) {
    case "create":
      return handleCollectCreate(env.BUCKET, token, request);
    case "part":
      return handleCollectPart(env.BUCKET, token, request);
    case "complete":
      return handleCollectComplete(env.BUCKET, token, request);
    default:
      return handleCollectAbort(env.BUCKET, token, request);
  }
};
