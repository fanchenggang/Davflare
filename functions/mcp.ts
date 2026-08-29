import { authorizeApiKey } from "./api/_apikey";
import { onRequestDelete as deleteOnDelete } from "./api/delete";
import { onRequestGet as downloadOnGet } from "./api/download";
import { onRequestGet as listOnGet } from "./api/list";
import { onRequestPost as mkdirOnPost } from "./api/mkdir";
import { onRequestPost as uploadOnPost } from "./api/upload";
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

function withRequest(context: McpContext, request: Request): McpContext {
  return Object.assign({}, context, { request });
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
