// JSON-RPC 2.0 解析、rpc 结果构造与 API 响应→工具结果的包装层。
import {
  MCP_PROTOCOL_VERSION,
  MCP_PROTOCOL_VERSION_LEGACY,
  MCP_SERVER_INFO,
  type JsonRpcError,
  type JsonRpcId,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type McpToolResult,
} from "./_mcpShared";

export function isPlainObject(value: unknown): value is Record<string, unknown> {
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

export function rpcResult(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

export function rpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  const error: JsonRpcError = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: "2.0", id, error };
}

export function toolText(text: string, isError = false): McpToolResult {
  return { content: [{ type: "text", text }], isError: isError || undefined };
}

export function toolError(text: string): McpToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

export async function wrapApiResponse(response: Response): Promise<McpToolResult> {
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

/** 读取 JSON 响应体；非 JSON/解析失败返回 null */
export async function readJsonBody(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const parsed = (await response.json()) as unknown;
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function parseToolCall(
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

export function initializeResult(params: unknown) {
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
