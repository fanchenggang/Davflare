// JSON-RPC 2.0 / MCP Streamable HTTP dispatcher (pure; no R2).
// Pages Function at functions/mcp.ts wraps Open API handlers.

export const MCP_PROTOCOL_VERSION = "2025-03-26";
export const MCP_PROTOCOL_VERSION_LEGACY = "2024-11-05";
export const MCP_SERVER_INFO = { name: "davflare", version: "0.1.0" };
/** 单请求内联上限（下载整取/上传小文件直传） */
export const MCP_MAX_BYTES = 1024 * 1024;
/** 上传自动改走三段式分块的阈值上限（base64 后单条 JSON-RPC ~34MB） */
export const MCP_MAX_UPLOAD_BYTES = 25 * 1000 * 1000;
/** 分块大小：R2 除末块外最小 5MiB */
export const MCP_UPLOAD_PART_SIZE = 5 * 1024 * 1024;
/** download 分页读取的分片大小 */
export const MCP_DOWNLOAD_PART_SIZE = MCP_MAX_BYTES;

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
  search: (query: {
    query: string;
    limit?: number;
    cursor?: string;
  }) => Promise<Response>;
  move: (query: {
    from: string;
    to: string;
    overwrite?: boolean;
  }) => Promise<Response>;
  copy: (query: {
    from: string;
    to: string;
    overwrite?: boolean;
  }) => Promise<Response>;
  stat: (query: { path: string }) => Promise<Response>;
  downloadRange: (query: {
    path: string;
    offset: number;
    length: number;
  }) => Promise<Response>;
  uploadStart: (query: { key: string }) => Promise<Response>;
  uploadPart: (query: {
    key: string;
    uploadId: string;
    partNumber: number;
    body: Uint8Array;
  }) => Promise<Response>;
  uploadComplete: (query: {
    key: string;
    uploadId: string;
    parts: Array<{ partNumber: number; etag: string }>;
  }) => Promise<Response>;
  uploadAbort: (query: { key: string; uploadId: string }) => Promise<Response>;
  shareCreate: (query: {
    key: string;
    extractCode?: string;
    expiresInHours?: number;
  }) => Promise<Response>;
  shareList: () => Promise<Response>;
  shareRevoke: (query: { token: string }) => Promise<Response>;
  sitesList: (query: { withStats?: boolean }) => Promise<Response>;
  sitesConfig: (query: { slug: string; spa: boolean }) => Promise<Response>;
  sitesDelete: (query: { slug: string; purge?: boolean }) => Promise<Response>;
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
      "Upload a file. Up to 1 MiB is sent inline; larger content (up to 25 MB) is automatically uploaded in multipart chunks. For even larger files use the web UI or API key scripts.",
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
          description: "Overwrite if the same name already exists (inline uploads only)",
        },
      },
      required: ["name", "content"],
    },
  },
  {
    name: "download",
    description:
      "Download a file. Up to 1 MiB is returned inline (utf8 text or base64). For larger files pass part (1-based) to page through the file in partSize (default 1 MiB) chunks as base64.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Object key of the file" },
        part: {
          type: "number",
          minimum: 1,
          description: "1-based part index for paged download of large files",
        },
        partSize: {
          type: "number",
          minimum: 1,
          maximum: 1048576,
          description: "Chunk size in bytes for paged download; default 1 MiB",
        },
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
  {
    name: "search",
    description:
      "Search all objects by filename substring (server-side full scan). Returns matches with a nextCursor for pagination.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Filename substring to match" },
        limit: {
          type: "number",
          minimum: 1,
          maximum: 500,
          description: "Max matches per page (default 100)",
        },
        cursor: {
          type: "string",
          description: "Pagination cursor from the previous nextCursor",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "move",
    description:
      "Move/rename a file or folder to a new key.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Source file or folder key" },
        to: { type: "string", description: "Destination key" },
        overwrite: {
          type: "boolean",
          default: false,
          description: "Overwrite destination file if it exists",
        },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "copy",
    description:
      "Copy a file to a new key (metadata preserved). Directories are not supported — copy files individually.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Source file key" },
        to: { type: "string", description: "Destination file key" },
        overwrite: {
          type: "boolean",
          default: false,
          description: "Overwrite destination file if it exists",
        },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "stat",
    description:
      "Get object metadata: kind (file/directory), size, etag, uploaded time, content type.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File or folder key" },
      },
      required: ["path"],
    },
  },
  {
    name: "share_create",
    description:
      "Create a public share link for a file or folder. Optional extract code (4-32 chars) and expiry in hours.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File or folder key to share" },
        extractCode: {
          type: "string",
          description: "Optional extraction code, 4-32 characters",
        },
        expiresInHours: {
          type: "number",
          minimum: 1,
          description: "Optional expiry in hours from now",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "share_list",
    description: "List all active share links (token, target, expiry, extract code).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "share_revoke",
    description: "Revoke a share link by token.",
    inputSchema: {
      type: "object",
      properties: {
        token: { type: "string", description: "Share token from share_create/share_list" },
      },
      required: ["token"],
    },
  },
  {
    name: "sites_list",
    description:
      "List static sites hosted under sites/ with their SPA flag and cached stats (file count, total size).",
    inputSchema: {
      type: "object",
      properties: {
        stats: {
          type: "boolean",
          default: true,
          description: "Include per-site stats (may be cached up to 10 minutes)",
        },
      },
    },
  },
  {
    name: "sites_config",
    description:
      "Update a site config. spa=true makes unknown paths fall back to the site index.html (SPA history routing). The site must already exist.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Site slug" },
        spa: { type: "boolean", description: "Enable SPA index.html fallback" },
      },
      required: ["slug", "spa"],
    },
  },
  {
    name: "sites_delete",
    description:
      "Delete a static site. Default removes files but keeps the config (SPA flag survives redeploys); purge=true also removes the config.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Site slug" },
        purge: {
          type: "boolean",
          default: false,
          description: "Also delete the site config",
        },
      },
      required: ["slug"],
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

/** 读取 JSON 响应体；非 JSON/解析失败返回 null */
async function readJsonBody(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const parsed = (await response.json()) as unknown;
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * 大于 1MiB 的上传自动改走三段式分块（create → parts → complete）。
 * 任一分块失败即 abort 清理并返回错误。
 */
async function multipartUploadTool(
  apis: ToolCallApis,
  key: string,
  bytes: Uint8Array
): Promise<McpToolResult> {
  const startResponse = await apis.uploadStart({ key });
  if (!startResponse.ok) return wrapApiResponse(startResponse);
  const start = await readJsonBody(startResponse);
  const uploadId =
    start && typeof start.uploadId === "string" ? start.uploadId : null;
  if (!uploadId) return toolError("分块上传创建失败：缺少 uploadId");

  const parts: Array<{ partNumber: number; etag: string }> = [];
  const fail = async (
    result: McpToolResult | Promise<McpToolResult>
  ): Promise<McpToolResult> => {
    try {
      await apis.uploadAbort({ key, uploadId });
    } catch {
      // abort 失败不影响错误上报
    }
    return await result;
  };
  try {
    let partNumber = 1;
    for (let offset = 0; offset < bytes.byteLength; partNumber += 1) {
      const chunk = bytes.subarray(
        offset,
        Math.min(offset + MCP_UPLOAD_PART_SIZE, bytes.byteLength)
      );
      const partResponse = await apis.uploadPart({
        key,
        uploadId,
        partNumber,
        body: chunk,
      });
      if (!partResponse.ok) {
        return await fail(wrapApiResponse(partResponse));
      }
      const part = await readJsonBody(partResponse);
      const etag = part && typeof part.etag === "string" ? part.etag : null;
      if (!etag) {
        return await fail(toolError(`分块 ${partNumber} 上传失败：缺少 etag`));
      }
      parts.push({ partNumber, etag });
      offset += chunk.byteLength;
    }
    const completeResponse = await apis.uploadComplete({
      key,
      uploadId,
      parts,
    });
    if (!completeResponse.ok) {
      return await fail(wrapApiResponse(completeResponse));
    }
    return wrapApiResponse(completeResponse);
  } catch (error) {
    return await fail(toolError((error as Error)?.message || "分块上传失败"));
  }
}

/** 大文件分页下载：stat 取大小 → Range 读指定分片 → base64 */
async function downloadPartTool(
  apis: ToolCallApis,
  path: string,
  part?: number,
  partSize?: number
): Promise<McpToolResult> {
  const statResponse = await apis.stat({ path });
  if (!statResponse.ok) return wrapApiResponse(statResponse);
  const stat = await readJsonBody(statResponse);
  const size = stat && typeof stat.size === "number" ? stat.size : NaN;
  if (!Number.isFinite(size) || size <= 0) {
    return toolError("无法确定文件大小（目录或空文件不支持分页下载）");
  }
  const chunkSize = Math.min(
    Math.max(Math.floor(partSize ?? MCP_DOWNLOAD_PART_SIZE), 1),
    MCP_DOWNLOAD_PART_SIZE
  );
  const totalParts = Math.ceil(size / chunkSize);
  const index = Math.floor(part ?? 1);
  if (index < 1 || index > totalParts) {
    return toolError(`part 需在 1-${totalParts}（共 ${totalParts} 片）`);
  }
  const offset = (index - 1) * chunkSize;
  const length = Math.min(chunkSize, size - offset);
  const response = await apis.downloadRange({ path, offset, length });
  if (!response.ok) return wrapApiResponse(response);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MCP_MAX_BYTES) {
    return toolError("分片超出内联上限，请减小 partSize");
  }
  return toolText(
    JSON.stringify({
      path,
      size,
      part: index,
      totalParts,
      offset,
      length: bytes.byteLength,
      encoding: "base64",
      content: encodeBase64(bytes),
    })
  );
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
      if (decoded.bytes.byteLength > MCP_MAX_UPLOAD_BYTES) {
        return toolError(
          `Content larger than ${Math.floor(MCP_MAX_UPLOAD_BYTES / 1000000)} MB (MCP cap). Use the web UI or API scripts.`
        );
      }
      if (decoded.bytes.byteLength > MCP_MAX_BYTES) {
        // 大于 1MiB 自动改走三段式分块（覆盖语义；overwrite 参数不适用于分块流）
        const fullKey = path ? `${path.replace(/\/+$/, "")}/${fileName}` : fileName;
        return multipartUploadTool(apis, fullKey, decoded.bytes);
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
      const part = asOptionalNumber(args.part);
      const partSize = asOptionalNumber(args.partSize);
      if (part !== undefined || partSize !== undefined) {
        return downloadPartTool(apis, path, part, partSize);
      }
      const response = await apis.download({ path });
      if (response.status >= 400) return wrapApiResponse(response);
      const declared = Number(response.headers.get("Content-Length"));
      if (Number.isFinite(declared) && declared > MCP_MAX_BYTES) {
        return toolError(
          `File larger than 1 MiB (${declared} bytes). Pass part=1 to page through it, or use the web UI.`
        );
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > MCP_MAX_BYTES) {
        return toolError(
          `File larger than 1 MiB (${bytes.byteLength} bytes). Pass part=1 to page through it, or use the web UI.`
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
    case "search": {
      const query = asString(args.query).trim();
      if (!query) return toolError("query is required");
      const limit = asOptionalNumber(args.limit);
      const cursor = typeof args.cursor === "string" ? args.cursor : undefined;
      return wrapApiResponse(await apis.search({ query, limit, cursor }));
    }
    case "move": {
      const from = asString(args.from);
      const to = asString(args.to);
      if (!from || !to) return toolError("from and to are required");
      const overwrite = asOptionalBoolean(args.overwrite);
      return wrapApiResponse(await apis.move({ from, to, overwrite }));
    }
    case "copy": {
      const from = asString(args.from);
      const to = asString(args.to);
      if (!from || !to) return toolError("from and to are required");
      const overwrite = asOptionalBoolean(args.overwrite);
      return wrapApiResponse(await apis.copy({ from, to, overwrite }));
    }
    case "stat": {
      const path = asString(args.path);
      if (!path) return toolError("path is required");
      return wrapApiResponse(await apis.stat({ path }));
    }
    case "share_create": {
      const key = asString(args.path);
      if (!key) return toolError("path is required");
      const extractCode = asString(args.extractCode) || undefined;
      const expiresInHours = asOptionalNumber(args.expiresInHours);
      return wrapApiResponse(
        await apis.shareCreate({ key, extractCode, expiresInHours })
      );
    }
    case "share_list": {
      return wrapApiResponse(await apis.shareList());
    }
    case "share_revoke": {
      const token = asString(args.token);
      if (!token) return toolError("token is required");
      return wrapApiResponse(await apis.shareRevoke({ token }));
    }
    case "sites_list": {
      const withStats = asOptionalBoolean(args.stats) !== false;
      return wrapApiResponse(await apis.sitesList({ withStats }));
    }
    case "sites_config": {
      const slug = asString(args.slug);
      const spa = asOptionalBoolean(args.spa);
      if (!slug) return toolError("slug is required");
      if (spa === undefined) return toolError("spa is required");
      return wrapApiResponse(await apis.sitesConfig({ slug, spa }));
    }
    case "sites_delete": {
      const slug = asString(args.slug);
      if (!slug) return toolError("slug is required");
      const purge = asOptionalBoolean(args.purge) === true;
      return wrapApiResponse(await apis.sitesDelete({ slug, purge }));
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
