import { authorizeApiKey } from "./api/_apikey";
import { onRequestPost as copyOnPost } from "./api/copy";
import { onRequestDelete as deleteOnDelete } from "./api/delete";
import { onRequestGet as downloadOnGet } from "./api/download";
import { onRequestGet as listOnGet } from "./api/list";
import { onRequestPost as mkdirOnPost } from "./api/mkdir";
import { onRequestPost as renameOnPost } from "./api/rename";
import { onRequestGet as searchOnGet } from "./api/search";
import {
  onRequestDelete as sharesOnDelete,
  onRequestGet as sharesOnGet,
  onRequestPost as sharesOnPost,
} from "./api/shares";
import {
  onRequestDelete as sitesOnDelete,
  onRequestGet as sitesOnGet,
  onRequestPost as sitesOnPost,
} from "./api/sites";
import { onRequestGet as statOnGet } from "./api/stat";
import {
  onRequestDelete as uploadOnDelete,
  onRequestPost as uploadOnPost,
  onRequestPut as uploadOnPut,
} from "./api/upload";
import {
  dispatchMcpRequest,
  parseJsonRpcBody,
  type JsonRpcResponse,
  type ToolCallApis,
} from "./_mcp";

interface McpEnv {
  BUCKET: R2Bucket;
}

type McpContext = EventContext<McpEnv, any, any>;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, X-Api-Key, Accept, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS)) headers.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function jsonResponse(body: unknown, status = 200) {
  return withCors(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    })
  );
}

function rpcResponse(body: JsonRpcResponse, status = 200) {
  return jsonResponse(body, status);
}

function cloneApiRequest(
  original: Request,
  method: string,
  url: URL,
  init?: { body?: BodyInit; headers?: Record<string, string> }
) {
  const headers = new Headers(original.headers);
  headers.delete("content-length");
  if (init?.headers) {
    for (const [key, value] of Object.entries(init.headers)) {
      headers.set(key, value);
    }
  }
  const hasBody = init?.body !== undefined && method !== "GET" && method !== "HEAD";
  if (!hasBody) headers.delete("content-type");
  return new Request(url.toString(), {
    method,
    headers,
    body: hasBody ? init!.body : undefined,
  });
}

function withRequest<T extends { BUCKET: R2Bucket }>(
  context: McpContext,
  request: Request
): EventContext<T, any, any> {
  // MCP 流程已通过 API key 鉴权；shares/sites handler 的 Basic 凭据字段在
  // 该分支下仅用于"是否同时允许会话"的判定，缺失时安全跳过。
  return Object.assign({}, context, { request }) as unknown as EventContext<
    T,
    any,
    any
  >;
}

function makeApis(context: McpContext): ToolCallApis {
  const origin = new URL(context.request.url).origin;
  return {
    async list({ path, limit, cursor }) {
      const url = new URL("/api/list", origin);
      url.searchParams.set("path", path);
      if (limit !== undefined) url.searchParams.set("limit", String(limit));
      if (cursor) url.searchParams.set("cursor", cursor);
      const request = cloneApiRequest(context.request, "GET", url);
      return listOnGet(withRequest(context, request));
    },
    async upload({ path, name, body, overwrite }) {
      const url = new URL("/api/upload", origin);
      url.searchParams.set("path", path);
      if (overwrite) url.searchParams.set("overwrite", "1");
      const request = cloneApiRequest(context.request, "POST", url, {
        body: body as unknown as BodyInit,
        headers: {
          "Content-Type": "application/octet-stream",
          "X-File-Name": name,
        },
      });
      return uploadOnPost(withRequest(context, request));
    },
    async download({ path }) {
      const url = new URL("/api/download", origin);
      url.searchParams.set("path", path);
      const request = cloneApiRequest(context.request, "GET", url);
      return downloadOnGet(withRequest(context, request));
    },
    async mkdir({ path }) {
      const url = new URL("/api/mkdir", origin);
      const request = cloneApiRequest(context.request, "POST", url, {
        body: JSON.stringify({ path }),
        headers: { "Content-Type": "application/json" },
      });
      return mkdirOnPost(withRequest(context, request));
    },
    async delete({ path, hard }) {
      const url = new URL("/api/delete", origin);
      url.searchParams.set("path", path);
      if (hard === true) {
        url.searchParams.set("soft", "0");
      } else {
        url.searchParams.set("soft", "1");
      }
      const request = cloneApiRequest(context.request, "DELETE", url);
      return deleteOnDelete(withRequest(context, request));
    },
    async search({ query, limit, cursor }) {
      const url = new URL("/api/search", origin);
      url.searchParams.set("q", query);
      if (limit !== undefined) url.searchParams.set("limit", String(limit));
      if (cursor) url.searchParams.set("cursor", cursor);
      const request = cloneApiRequest(context.request, "GET", url);
      return searchOnGet(withRequest(context, request));
    },
    async move({ from, to, overwrite }) {
      const url = new URL("/api/rename", origin);
      const request = cloneApiRequest(context.request, "POST", url, {
        body: JSON.stringify({ from, to, overwrite: overwrite === true }),
        headers: { "Content-Type": "application/json" },
      });
      return renameOnPost(withRequest(context, request));
    },
    async copy({ from, to, overwrite }) {
      const url = new URL("/api/copy", origin);
      const request = cloneApiRequest(context.request, "POST", url, {
        body: JSON.stringify({ from, to, overwrite: overwrite === true }),
        headers: { "Content-Type": "application/json" },
      });
      return copyOnPost(withRequest(context, request));
    },
    async stat({ path }) {
      const url = new URL("/api/stat", origin);
      url.searchParams.set("path", path);
      const request = cloneApiRequest(context.request, "GET", url);
      return statOnGet(withRequest(context, request));
    },
    async downloadRange({ path, offset, length }) {
      const url = new URL("/api/download", origin);
      url.searchParams.set("path", path);
      const request = cloneApiRequest(context.request, "GET", url, {
        headers: { Range: `bytes=${offset}-${offset + length - 1}` },
      });
      return downloadOnGet(withRequest(context, request));
    },
    async uploadStart({ key }) {
      const url = new URL("/api/upload", origin);
      url.searchParams.set("uploads", "");
      url.searchParams.set("path", key);
      const request = cloneApiRequest(context.request, "POST", url);
      return uploadOnPost(withRequest(context, request));
    },
    async uploadPart({ key, uploadId, partNumber, body }) {
      const url = new URL("/api/upload", origin);
      url.searchParams.set("path", key);
      url.searchParams.set("uploadId", uploadId);
      url.searchParams.set("partNumber", String(partNumber));
      const request = cloneApiRequest(context.request, "PUT", url, {
        body: body as unknown as BodyInit,
        headers: { "Content-Type": "application/octet-stream" },
      });
      return uploadOnPut(withRequest(context, request));
    },
    async uploadComplete({ key, uploadId, parts }) {
      const url = new URL("/api/upload", origin);
      url.searchParams.set("path", key);
      url.searchParams.set("uploadId", uploadId);
      const request = cloneApiRequest(context.request, "POST", url, {
        body: JSON.stringify({ parts }),
        headers: { "Content-Type": "application/json" },
      });
      return uploadOnPost(withRequest(context, request));
    },
    async uploadAbort({ key, uploadId }) {
      const url = new URL("/api/upload", origin);
      url.searchParams.set("path", key);
      url.searchParams.set("uploadId", uploadId);
      const request = cloneApiRequest(context.request, "DELETE", url);
      return uploadOnDelete(withRequest(context, request));
    },
    async shareCreate({ key, extractCode, expiresInHours }) {
      const url = new URL("/api/shares", origin);
      const body: Record<string, unknown> = { key };
      if (extractCode) body.extractCode = extractCode;
      if (expiresInHours !== undefined) body.expiresInHours = expiresInHours;
      const request = cloneApiRequest(context.request, "POST", url, {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      });
      return sharesOnPost(withRequest(context, request));
    },
    async shareList() {
      const url = new URL("/api/shares", origin);
      const request = cloneApiRequest(context.request, "GET", url);
      return sharesOnGet(withRequest(context, request));
    },
    async shareRevoke({ token }) {
      const url = new URL("/api/shares", origin);
      url.searchParams.set("token", token);
      const request = cloneApiRequest(context.request, "DELETE", url);
      return sharesOnDelete(withRequest(context, request));
    },
    async sitesList({ withStats }) {
      const url = new URL("/api/sites", origin);
      if (withStats) url.searchParams.set("stats", "1");
      const request = cloneApiRequest(context.request, "GET", url);
      return sitesOnGet(withRequest(context, request));
    },
    async sitesConfig({ slug, spa }) {
      const url = new URL("/api/sites", origin);
      const request = cloneApiRequest(context.request, "POST", url, {
        body: JSON.stringify({ slug, spa }),
        headers: { "Content-Type": "application/json" },
      });
      return sitesOnPost(withRequest(context, request));
    },
    async sitesDelete({ slug, purge }) {
      const url = new URL("/api/sites", origin);
      url.searchParams.set("slug", slug);
      if (purge) url.searchParams.set("purge", "1");
      const request = cloneApiRequest(context.request, "DELETE", url);
      return sitesOnDelete(withRequest(context, request));
    },
  };
}

export const onRequest: PagesFunction<McpEnv> = async (context) => {
  const { request, env } = context;
  const method = request.method.toUpperCase();

  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (method !== "POST") {
    return withCors(
      new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "POST, OPTIONS", "Content-Type": "text/plain; charset=utf-8" },
      })
    );
  }

  const auth = await authorizeApiKey(request, env.BUCKET);
  if (auth instanceof Response) return withCors(auth);

  const raw = await request.text();
  const parsed = parseJsonRpcBody(raw);
  if (!parsed.ok) return rpcResponse(parsed.body);

  const result = await dispatchMcpRequest(parsed.rpc, makeApis(context));
  if (result.kind === "accepted") {
    return new Response(null, { status: 202, headers: CORS });
  }
  return rpcResponse(result.body);
};
