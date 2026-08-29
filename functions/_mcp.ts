// JSON-RPC 2.0 / MCP Streamable HTTP dispatcher (pure; no R2).
// Pages Function at functions/mcp.ts wraps Open API handlers.

export const MCP_PROTOCOL_VERSION = "2025-03-26";
export const MCP_PROTOCOL_VERSION_LEGACY = "2024-11-05";
export const MCP_SERVER_INFO = { name: "davflare", version: "0.1.0" };
export const MCP_MAX_BYTES = 1024 * 1024;

export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
  hasId: boolean;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: JsonRpcError;
}

export type McpContent = { type: "text"; text: string };

export type McpToolResult = {
  content: McpContent[];
  isError?: boolean;
};

export type McpHttpResult =
  | { kind: "rpc"; body: JsonRpcResponse }
  | { kind: "accepted" };

export type ToolCallApis = {
  list: (query: {
    path: string;
    limit?: number;
    cursor?: string;
  }) => Promise<Response>;
  upload: (query: {
    path: string;
    name: string;
    body: Uint8Array;
    overwrite?: boolean;
  }) => Promise<Response>;
  download: (query: { path: string }) => Promise<Response>;
  mkdir: (query: { path: string }) => Promise<Response>;
  delete: (query: { path: string; hard?: boolean }) => Promise<Response>;
};

export const MCP_TOOLS = [
  {
    name: "list",
    description:
      "List files and folders at path (depth 1). Empty path is the root.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          default: "",
          description: "Folder key; empty string is the root",
        },
        limit: {
          type: "number",
          minimum: 1,
          maximum: 1000,
          description: "Page size 1-1000",
        },
        cursor: {
          type: "string",
          description: "Pagination cursor from the previous nextCursor",
        },
      },
    },
  },
  {
    name: "upload",
    description:
      "Upload a small file (MCP v1 cap ~1 MiB). For larger files use the web UI. Raw body only — no multipart or chunked upload.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          default: "",
          description: "Target folder; empty is the root",
        },
        name: { type: "string", description: "File name" },
        content: {
          type: "string",
          description: "File content (utf8 text or base64)",
        },
        encoding: {
          type: "string",
          enum: ["utf8", "base64"],
          default: "utf8",
          description: "How to decode content; default utf8",
        },
        overwrite: {
          type: "boolean",
          description: "Overwrite if the same name already exists",
        },
      },
      required: ["name", "content"],
    },
  },
  {
    name: "download",
    description:
      "Download a file. Files larger than 1 MiB return an error (HTTP 413); use the web UI. Text is returned as utf8; binary as base64.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Object key of the file" },
      },
      required: ["path"],
    },
  },
  {
    name: "mkdir",
    description: "Create a folder (parent folders are created automatically).",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Folder key to create" },
      },
      required: ["path"],
    },
  },
  {
    name: "delete",
    description:
      "Delete a file or folder. Default is soft delete to trash; set hard=true to permanently delete.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File or folder key" },
        hard: {
          type: "boolean",
          default: false,
          description:
            "If true, permanently delete; otherwise soft-delete to trash",
        },
      },
      required: ["path"],
    },
  },
] as const;

export const MCP_TOOL_NAMES = MCP_TOOLS.map((tool) => tool.name);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseJsonRpcBody(
  raw: string
): { ok: true; rpc: JsonRpcRequest } | { ok: false; body: JsonRpcResponse } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      body: {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      },
    };
  }
  if (!isPlainObject(parsed)) {
    return {
      ok: false,
      body: {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32600, message: "Invalid Request" },
      },
    };
  }
  const hasId = Object.prototype.hasOwnProperty.call(parsed, "id");
  const id = hasId ? (parsed.id as JsonRpcId) : undefined;
  const method = parsed.method;
  if (typeof method !== "string" || !method) {
    return {
      ok: false,
      body: {
        jsonrpc: "2.0",
        id: hasId ? (id as JsonRpcId) : null,
        error: { code: -32600, message: "Invalid Request" },
      },
    };
  }
  return {
    ok: true,
    rpc: {
      jsonrpc: typeof parsed.jsonrpc === "string" ? parsed.jsonrpc : undefined,
      id,
      method,
      params: parsed.params,
      hasId,
    },
  };
}

function rpcResult(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  const error: JsonRpcError = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: "2.0", id, error };
}

function toolText(text: string, isError = false): McpToolResult {
  return { content: [{ type: "text", text }], isError: isError || undefined };
}

function toolError(text: string): McpToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

export function decodeBase64(value: string): Uint8Array {
  const cleaned = value.replace(/\s+/g, "");
  if (!cleaned) return new Uint8Array();
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x2000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk))
    );
  }
  return btoa(binary);
}

export function decodeUploadContent(
  content: string,
  encoding?: string
): { ok: true; bytes: Uint8Array } | { ok: false; error: string } {
  const enc = (encoding || "utf8").trim().toLowerCase();
  if (enc === "utf8" || enc === "utf-8") {
    return { ok: true, bytes: new TextEncoder().encode(content) };
  }
  if (enc === "base64") {
    try {
      return { ok: true, bytes: decodeBase64(content) };
    } catch {
      return { ok: false, error: "Invalid base64 content" };
    }
  }
  return { ok: false, error: "encoding must be utf8 or base64" };
}

export function isUtf8Text(bytes: Uint8Array): boolean {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return text.indexOf("\0") < 0;
  } catch {
    return false;
  }
}

async function wrapApiResponse(response: Response): Promise<McpToolResult> {
  const text = await response.text();
  const isError = response.status >= 400;
  const contentType = response.headers.get("Content-Type") || "";
  let payload = text;
  if (contentType.toLowerCase().includes("application/json") && text) {
    try {
      payload = JSON.stringify(JSON.parse(text));
    } catch {
      payload = text;
    }
  }
  if (!payload) payload = `HTTP ${response.status}`;
  return toolText(payload, isError);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function asOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function parseToolCall(
  params: unknown
): { name: string; args: Record<string, unknown> } | { error: string } {
  if (!isPlainObject(params) || typeof params.name !== "string" || !params.name) {
    return { error: "tools/call requires params.name" };
  }
  let args: unknown = params.arguments;
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch {
      return { error: "tools/call arguments is not valid JSON" };
    }
  }
  if (args == null) args = {};
  if (!isPlainObject(args)) {
    return { error: "tools/call arguments must be an object" };
  }
  return { name: params.name, args };
}

function initializeResult(params: unknown) {
  let protocolVersion = MCP_PROTOCOL_VERSION;
  if (isPlainObject(params) && typeof params.protocolVersion === "string") {
    if (
      params.protocolVersion === MCP_PROTOCOL_VERSION ||
      params.protocolVersion === MCP_PROTOCOL_VERSION_LEGACY
    ) {
      protocolVersion = params.protocolVersion;
    }
  }
  return {
    protocolVersion,
    capabilities: { tools: {} },
    serverInfo: MCP_SERVER_INFO,
  };
}

async function callTool(
  name: string,
  args: Record<string, unknown>,
  apis: ToolCallApis
): Promise<McpToolResult> {
  switch (name) {
    case "list": {
      const path = asString(args.path, "");
      const limit = asOptionalNumber(args.limit);
      const cursor = typeof args.cursor === "string" ? args.cursor : undefined;
      return wrapApiResponse(await apis.list({ path, limit, cursor }));
    }
    case "upload": {
      const path = asString(args.path, "");
      const fileName = asString(args.name);
      const content = asString(args.content);
      if (!fileName) return toolError("name is required");
      if (!Object.prototype.hasOwnProperty.call(args, "content")) {
        return toolError("content is required");
      }
      const decoded = decodeUploadContent(
        content,
        typeof args.encoding === "string" ? args.encoding : undefined
      );
      if (!decoded.ok) return toolError(decoded.error);
      if (decoded.bytes.byteLength > MCP_MAX_BYTES) {
        return toolError(
          "Content larger than 1 MiB. MCP v1 does not support large uploads; use the web UI."
        );
      }
      const overwrite = asOptionalBoolean(args.overwrite);
      return wrapApiResponse(
        await apis.upload({
          path,
          name: fileName,
          body: decoded.bytes,
          overwrite,
        })
      );
    }
    case "download": {
      const path = asString(args.path);
      if (!path) return toolError("path is required");
      const response = await apis.download({ path });
      if (response.status >= 400) return wrapApiResponse(response);
      const declared = Number(response.headers.get("Content-Length"));
      if (Number.isFinite(declared) && declared > MCP_MAX_BYTES) {
        return toolError(
          "File larger than 1 MiB (HTTP 413). Use the web UI to download large files."
        );
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > MCP_MAX_BYTES) {
        return toolError(
          "File larger than 1 MiB (HTTP 413). Use the web UI to download large files."
        );
      }
      const contentType =
        response.headers.get("Content-Type") || "application/octet-stream";
      if (isUtf8Text(bytes)) {
        return toolText(
          JSON.stringify({
            path,
            size: bytes.byteLength,
            contentType,
            encoding: "utf8",
            content: new TextDecoder("utf-8").decode(bytes),
          })
        );
      }
      return toolText(
        JSON.stringify({
          path,
          size: bytes.byteLength,
          contentType,
          encoding: "base64",
          content: encodeBase64(bytes),
          note: "binary content encoded as base64",
        })
      );
    }
    case "mkdir": {
      const path = asString(args.path);
      if (!path) return toolError("path is required");
      return wrapApiResponse(await apis.mkdir({ path }));
    }
    case "delete": {
      const path = asString(args.path);
      if (!path) return toolError("path is required");
      const hard = asOptionalBoolean(args.hard) === true;
      return wrapApiResponse(await apis.delete({ path, hard }));
    }
    default:
      return toolError(`Unknown tool: ${name}`);
  }
}

export async function dispatchMcpRequest(
  rpc: JsonRpcRequest,
  apis: ToolCallApis
): Promise<McpHttpResult> {
  const id: JsonRpcId = rpc.hasId ? (rpc.id as JsonRpcId) : null;
  const method = rpc.method || "";

  if (method === "notifications/initialized" || method === "initialized") {
    if (!rpc.hasId) return { kind: "accepted" };
    return { kind: "rpc", body: rpcResult(id, {}) };
  }

  if (!rpc.hasId) {
    // Drop other notifications without a JSON-RPC error.
    return { kind: "accepted" };
  }

  if (method === "initialize") {
    return {
      kind: "rpc",
      body: rpcResult(id, initializeResult(rpc.params)),
    };
  }

  if (method === "ping") {
    return { kind: "rpc", body: rpcResult(id, {}) };
  }

  if (method === "tools/list") {
    return {
      kind: "rpc",
      body: rpcResult(id, { tools: MCP_TOOLS }),
    };
  }

  if (method === "tools/call") {
    const parsed = parseToolCall(rpc.params);
    if ("error" in parsed) {
      return {
        kind: "rpc",
        body: rpcError(id, -32602, "Invalid params", parsed.error),
      };
    }
    const result = await callTool(parsed.name, parsed.args, apis);
    return { kind: "rpc", body: rpcResult(id, result) };
  }

  return {
    kind: "rpc",
    body: rpcError(id, -32601, "Method not found", method),
  };
}
