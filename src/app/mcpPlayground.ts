/** Client helpers for the MCP playground (#/mcp). Calls existing POST /mcp only. */

export type McpToolInfo = {
  name: string;
  description?: string;
};

export type McpRpcError = {
  code: number;
  message: string;
  data?: unknown;
};

export type McpJsonRpcSuccess<T> = {
  jsonrpc: "2.0";
  id: string | number | null;
  result: T;
};

export type McpJsonRpcFailure = {
  jsonrpc: "2.0";
  id: string | number | null;
  error: McpRpcError;
};

export type McpJsonRpcResponse<T> = McpJsonRpcSuccess<T> | McpJsonRpcFailure;

export type ToolsListResult = { tools: McpToolInfo[] };

export type ToolCallResult = {
  content?: Array<{ type?: string; text?: string }>;
  isError?: boolean;
};

const SESSION_KEY = "davflare.mcpPlayground.apiKey";

export function mcpEndpoint(origin = window.location.origin): string {
  return `${origin.replace(/\/+$/, "")}/mcp`;
}

/** Same shape as GET /api/setup mcpJson, optionally with a real key. */
export function buildMcpJsonSnippet(
  origin: string,
  apiKey = "<apiKey>"
): string {
  const url = mcpEndpoint(origin);
  return JSON.stringify(
    {
      mcpServers: {
        davflare: {
          url,
          headers: {
            Authorization: `Bearer ${apiKey || "<apiKey>"}`,
          },
        },
      },
    },
    null,
    2
  );
}

export function loadStoredApiKey(): string {
  try {
    return sessionStorage.getItem(SESSION_KEY) || "";
  } catch {
    return "";
  }
}

export function storeApiKey(key: string): void {
  try {
    const trimmed = key.trim();
    if (trimmed) sessionStorage.setItem(SESSION_KEY, trimmed);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // private mode / blocked storage — ignore
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseToolsListPayload(body: unknown): McpToolInfo[] {
  if (!isRecord(body)) {
    throw new Error("Invalid MCP response");
  }
  if ("error" in body && body.error) {
    const err = body.error as McpRpcError;
    throw new Error(err.message || `MCP error ${err.code}`);
  }
  if (!("result" in body)) {
    throw new Error("Invalid MCP response: missing result");
  }
  const result = body.result;
  if (!isRecord(result) || !Array.isArray(result.tools)) {
    throw new Error("Invalid tools/list result");
  }
  return result.tools.map((tool) => {
    if (!isRecord(tool) || typeof tool.name !== "string") {
      throw new Error("Invalid tool entry in tools/list");
    }
    return {
      name: tool.name,
      description:
        typeof tool.description === "string" ? tool.description : undefined,
    };
  });
}

export function parseToolCallPayload(body: unknown): {
  isError: boolean;
  text: string;
  raw: ToolCallResult;
} {
  if (!isRecord(body)) {
    throw new Error("Invalid MCP response");
  }
  if ("error" in body && body.error) {
    const err = body.error as McpRpcError;
    throw new Error(err.message || `MCP error ${err.code}`);
  }
  if (!("result" in body) || !isRecord(body.result)) {
    throw new Error("Invalid tools/call result");
  }
  const raw = body.result as ToolCallResult;
  const parts = Array.isArray(raw.content) ? raw.content : [];
  const text = parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n");
  return { isError: Boolean(raw.isError), text, raw };
}

async function postMcp(
  apiKey: string,
  method: string,
  params?: unknown,
  id: number = 1
): Promise<unknown> {
  const key = apiKey.trim();
  if (!key) throw new Error("API key is required");

  const response = await fetch(mcpEndpoint(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      ...(params !== undefined ? { params } : {}),
    }),
  });

  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (!response.ok) {
    const detail =
      (isRecord(body) &&
        isRecord(body.error) &&
        typeof body.error.message === "string" &&
        body.error.message) ||
      text ||
      `HTTP ${response.status}`;
    throw new Error(detail);
  }

  if (body === null) {
    throw new Error(`Empty MCP response (HTTP ${response.status})`);
  }
  return body;
}

export async function mcpToolsList(apiKey: string): Promise<McpToolInfo[]> {
  const body = await postMcp(apiKey, "tools/list", undefined, 1);
  return parseToolsListPayload(body);
}

/** Read-only list of the drive root via MCP tools/call. */
export async function mcpTryListRoot(apiKey: string): Promise<{
  isError: boolean;
  text: string;
  raw: ToolCallResult;
}> {
  const body = await postMcp(
    apiKey,
    "tools/call",
    { name: "list", arguments: { path: "" } },
    2
  );
  return parseToolCallPayload(body);
}
