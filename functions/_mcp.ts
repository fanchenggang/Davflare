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
  /** Product Sites switch; publish_site is 404 when false. */
  sitesEnabled: () => Promise<boolean>;
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
  {
    name: "pull",
    description:
      "Walk agents/{global|agent|agent/project}/{skills|rules|mcp}/ and return the tree plus file contents. Merge order for the client: project > agent > global (files are tagged with layer and remote key). Large files page with part/partSize like download.",
    inputSchema: {
      type: "object",
      properties: {
        agent: {
          type: "string",
          description: "Optional agent slug, e.g. cursor. Omit to read the global layer only.",
        },
        project: {
          type: "string",
          description: "Optional project/workspace name under that agent. Requires agent.",
        },
        type: {
          type: "string",
          enum: ["skills", "rules", "mcp"],
          description: "Optional folder filter (skills, rules, or mcp)",
        },
      },
    },
  },
  {
    name: "push",
    description:
      "Upload files into agents/{global|agent|agent/project}/ (mkdir as needed). mcp.json must use ${env:...} placeholders — raw API keys are rejected. No local disk watcher; pass file contents.",
    inputSchema: {
      type: "object",
      properties: {
        agent: {
          type: "string",
          description: "Optional agent slug, e.g. cursor. Omit to write the global layer.",
        },
        project: {
          type: "string",
          description: "Optional project/workspace name. Requires agent.",
        },
        files: {
          type: "array",
          description: "Files relative to that layer root, e.g. skills/commit/SKILL.md or mcp/mcp.json",
          items: {
            type: "object",
            properties: {
              path: { type: "string", description: "Relative path under the layer root" },
              content: { type: "string", description: "File content (utf8 text or base64)" },
              encoding: {
                type: "string",
                enum: ["utf8", "base64"],
                default: "utf8",
                description: "How to decode content; default utf8",
              },
            },
            required: ["path", "content"],
          },
        },
      },
      required: ["files"],
    },
  },
  {
    name: "publish_site",
    description:
      "Copy a drive folder onto sites/{slug}/ (overwrite same names; does not wipe SPA config). Slug is [a-z0-9][a-z0-9-]{0,62}. Errors if the Sites feature switch is off.",
    inputSchema: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "Site slug [a-z0-9][a-z0-9-]{0,62}",
        },
        source: {
          type: "string",
          description: "Source folder key in the drive",
        },
      },
      required: ["slug", "source"],
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

export const AGENT_LAYOUT_TYPES = ["skills", "rules", "mcp"] as const;
export type AgentLayoutType = (typeof AGENT_LAYOUT_TYPES)[number];
export const AGENT_MERGE_ORDER = ["project", "agent", "global"] as const;
export type AgentLayer = (typeof AGENT_MERGE_ORDER)[number];
export const AGENT_WALK_ORDER: AgentLayer[] = ["global", "agent", "project"];

const SITE_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const AGENT_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function isSiteSlug(slug: string): boolean {
  return SITE_SLUG_RE.test(slug);
}

export function isAgentLayoutType(value: string): value is AgentLayoutType {
  return (AGENT_LAYOUT_TYPES as readonly string[]).includes(value);
}

/** Davflare keys (`fd_` + hex) or Bearer / Authorization values that are not `${env:...}`. */
export function mcpJsonHasRawSecrets(text: string): boolean {
  if (/\bfd_[0-9a-fA-F]{16,}\b/.test(text)) return true;
  const bearer = /Bearer\s+(\S+)/gi;
  let match: RegExpExecArray | null;
  while ((match = bearer.exec(text))) {
    const token = match[1].replace(/[,"']+$/g, "");
    if (!/^\$\{env:[^}]+\}/i.test(token)) return true;
  }
  if (/"X-Api-Key"\s*:\s*"(?!\$\{env:)[^"]+"/i.test(text)) return true;
  if (/"Authorization"\s*:\s*"(?!Bearer \$\{env:)[^"]+"/i.test(text)) return true;
  return false;
}

function normalizeAgentSlug(raw: string): string | { error: string } {
  const slug = raw.trim().toLowerCase();
  if (!slug) return { error: "agent is empty" };
  if (slug === "global") {
    return { error: "omit agent to use the global layer; 'global' is not an agent slug" };
  }
  if (!AGENT_SLUG_RE.test(slug)) {
    return { error: "agent must be a lowercase slug like cursor" };
  }
  return slug;
}

function normalizeProjectName(raw: string): string | { error: string } {
  const name = raw.trim();
  if (!name) return { error: "project is empty" };
  if (
    name.includes("/") ||
    name.includes("\\") ||
    name === "." ||
    name === ".." ||
    name.includes("..")
  ) {
    return { error: "project must be a single path segment" };
  }
  if ((AGENT_LAYOUT_TYPES as readonly string[]).includes(name)) {
    return { error: "project cannot be skills, rules, or mcp" };
  }
  return name;
}

export function agentLayerPrefixes(opts: {
  agent?: string;
  project?: string;
  type?: string;
}):
  | { ok: true; typeFilter: AgentLayoutType | null; layers: Array<{ layer: AgentLayer; prefix: string }> }
  | { ok: false; error: string } {
  const typeRaw = typeof opts.type === "string" ? opts.type.trim().toLowerCase() : "";
  if (typeRaw && !isAgentLayoutType(typeRaw)) {
    return { ok: false, error: "type must be skills, rules, or mcp" };
  }
  const typeFilter = typeRaw ? (typeRaw as AgentLayoutType) : null;

  let agent: string | undefined;
  if (opts.agent !== undefined && opts.agent !== "") {
    const parsed = normalizeAgentSlug(opts.agent);
    if (typeof parsed !== "string") return { ok: false, error: parsed.error };
    agent = parsed;
  }
  let project: string | undefined;
  if (opts.project !== undefined && opts.project !== "") {
    if (!agent) return { ok: false, error: "project requires agent" };
    const parsed = normalizeProjectName(opts.project);
    if (typeof parsed !== "string") return { ok: false, error: parsed.error };
    project = parsed;
  }

  const layers: Array<{ layer: AgentLayer; prefix: string }> = [
    { layer: "global", prefix: "agents/global/" },
  ];
  if (agent) layers.push({ layer: "agent", prefix: `agents/${agent}/` });
  if (agent && project) {
    layers.push({ layer: "project", prefix: `agents/${agent}/${project}/` });
  }
  return { ok: true, typeFilter, layers };
}

export function agentPushPrefix(opts: { agent?: string; project?: string }):
  | { ok: true; prefix: string; layer: AgentLayer }
  | { ok: false; error: string } {
  const parsed = agentLayerPrefixes(opts);
  if (!parsed.ok) return parsed;
  const last = parsed.layers[parsed.layers.length - 1];
  return { ok: true, prefix: last.prefix, layer: last.layer };
}

export function sanitizeAgentRelPath(raw: string): string | { error: string } {
  const trimmed = raw.trim().replace(/^\/+/, "");
  if (!trimmed) return { error: "path is required" };
  const parts = trimmed.split("/").filter((part) => part && part !== ".");
  if (parts.length === 0) return { error: "path is required" };
  if (parts.some((part) => part === ".." || part === "\\" || part.includes("\\"))) {
    return { error: "path cannot contain '..'" };
  }
  return parts.join("/");
}

type ListedItem = { key: string; name: string; isDir: boolean; size: number };

async function listFolderPages(
  apis: ToolCallApis,
  path: string
): Promise<ListedItem[] | { error: string } | "missing"> {
  const items: ListedItem[] = [];
  let cursor: string | undefined;
  do {
    const response = await apis.list({ path, limit: 1000, cursor });
    if (response.status === 404) return "missing";
    if (response.status === 400) {
      const text = await response.text();
      return { error: text || "path is not a folder" };
    }
    if (!response.ok) {
      const text = await response.text();
      return { error: text || `HTTP ${response.status}` };
    }
    const body = await readJsonBody(response);
    if (!body || !Array.isArray(body.items)) {
      return { error: "list returned unexpected JSON" };
    }
    for (const item of body.items) {
      if (!isPlainObject(item) || typeof item.key !== "string" || !item.key) continue;
      items.push({
        key: item.key.replace(/\/+$/, ""),
        name: typeof item.name === "string" ? item.name : item.key,
        isDir: item.isDir === true,
        size: typeof item.size === "number" ? item.size : 0,
      });
    }
    cursor = typeof body.nextCursor === "string" ? body.nextCursor : undefined;
  } while (cursor);
  return items;
}

async function walkFolderFiles(
  apis: ToolCallApis,
  root: string
): Promise<{ files: ListedItem[] } | { error: string } | "missing"> {
  const folder = root.replace(/\/+$/, "");
  const first = await listFolderPages(apis, folder);
  if (first === "missing") return "missing";
  if ("error" in first) return first;
  const files: ListedItem[] = [];
  const queue: string[] = [];
  const seen = new Set<string>([folder]);
  for (const item of first) {
    if (item.isDir) queue.push(item.key);
    else files.push(item);
  }
  while (queue.length) {
    const next = queue.shift()!;
    if (seen.has(next)) continue;
    seen.add(next);
    const listed = await listFolderPages(apis, next);
    if (listed === "missing") continue;
    if ("error" in listed) return listed;
    for (const item of listed) {
      if (item.isDir) {
        if (!seen.has(item.key)) queue.push(item.key);
      } else {
        files.push(item);
      }
    }
  }
  return { files };
}

async function readPulledFile(
  apis: ToolCallApis,
  key: string
): Promise<Record<string, unknown> | { error: string }> {
  const statResponse = await apis.stat({ path: key });
  if (statResponse.ok) {
    const stat = await readJsonBody(statResponse);
    const size = stat && typeof stat.size === "number" ? stat.size : NaN;
    if (Number.isFinite(size) && size > MCP_MAX_BYTES) {
      const paged = await downloadPartTool(apis, key, 1, MCP_DOWNLOAD_PART_SIZE);
      if (paged.isError) {
        return { error: paged.content[0]?.text || "paged download failed" };
      }
      try {
        const parsed = JSON.parse(paged.content[0].text) as Record<string, unknown>;
        return {
          ...parsed,
          key,
          size,
          note: "File larger than 1 MiB. Use download with part=N to read the rest.",
        };
      } catch {
        return { error: "paged download returned unexpected JSON" };
      }
    }
  }
  const response = await apis.download({ path: key });
  if (response.status >= 400) {
    const text = await response.text();
    return { error: text || `HTTP ${response.status}` };
  }
  const declared = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > MCP_MAX_BYTES) {
    const paged = await downloadPartTool(apis, key, 1, MCP_DOWNLOAD_PART_SIZE);
    if (paged.isError) {
      return { error: paged.content[0]?.text || "paged download failed" };
    }
    try {
      return JSON.parse(paged.content[0].text) as Record<string, unknown>;
    } catch {
      return { error: "paged download returned unexpected JSON" };
    }
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MCP_MAX_BYTES) {
    return {
      error: `File larger than 1 MiB (${bytes.byteLength} bytes). Use download with part=1.`,
    };
  }
  const contentType =
    response.headers.get("Content-Type") || "application/octet-stream";
  if (isUtf8Text(bytes)) {
    return {
      key,
      size: bytes.byteLength,
      contentType,
      encoding: "utf8",
      content: new TextDecoder("utf-8").decode(bytes),
    };
  }
  return {
    key,
    size: bytes.byteLength,
    contentType,
    encoding: "base64",
    content: encodeBase64(bytes),
  };
}

async function uploadBytes(
  apis: ToolCallApis,
  folder: string,
  name: string,
  bytes: Uint8Array
): Promise<McpToolResult> {
  if (bytes.byteLength > MCP_MAX_UPLOAD_BYTES) {
    return toolError(
      `Content larger than ${Math.floor(MCP_MAX_UPLOAD_BYTES / 1000000)} MB (MCP cap). Use the web UI or API scripts.`
    );
  }
  if (bytes.byteLength > MCP_MAX_BYTES) {
    const fullKey = folder ? `${folder.replace(/\/+$/, "")}/${name}` : name;
    return multipartUploadTool(apis, fullKey, bytes);
  }
  return wrapApiResponse(
    await apis.upload({ path: folder, name, body: bytes, overwrite: true })
  );
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
    case "pull": {
      const planned = agentLayerPrefixes({
        agent: asString(args.agent) || undefined,
        project: asString(args.project) || undefined,
        type: asString(args.type) || undefined,
      });
      if (!planned.ok) return toolError(planned.error);
      const types = planned.typeFilter
        ? [planned.typeFilter]
        : [...AGENT_LAYOUT_TYPES];
      const files: Array<Record<string, unknown>> = [];
      for (const layer of planned.layers) {
        for (const type of types) {
          const root = `${layer.prefix}${type}`;
          const walked = await walkFolderFiles(apis, root);
          if (walked === "missing") continue;
          if ("error" in walked) return toolError(walked.error);
          for (const item of walked.files) {
            const rel = item.key.startsWith(layer.prefix)
              ? item.key.slice(layer.prefix.length)
              : item.key;
            const content = await readPulledFile(apis, item.key);
            if ("error" in content) return toolError(`${item.key}: ${content.error}`);
            files.push({
              ...content,
              layer: layer.layer,
              type,
              rel,
              key: item.key,
            });
          }
        }
      }
      return toolText(
        JSON.stringify({
          mergeOrder: [...AGENT_MERGE_ORDER],
          mergeHint:
            "When the same rel exists in more than one layer, apply project > agent > global (project wins).",
          layers: planned.layers,
          files,
        })
      );
    }
    case "push": {
      const dest = agentPushPrefix({
        agent: asString(args.agent) || undefined,
        project: asString(args.project) || undefined,
      });
      if (!dest.ok) return toolError(dest.error);
      if (!Array.isArray(args.files)) return toolError("files is required");
      const uploaded: Array<{ key: string; layer: AgentLayer }> = [];
      for (const entry of args.files) {
        if (!isPlainObject(entry)) return toolError("each file must be an object");
        const rel = sanitizeAgentRelPath(asString(entry.path));
        if (typeof rel !== "string") return toolError(rel.error);
        if (!Object.prototype.hasOwnProperty.call(entry, "content")) {
          return toolError(`${rel}: content is required`);
        }
        const decoded = decodeUploadContent(
          asString(entry.content),
          typeof entry.encoding === "string" ? entry.encoding : undefined
        );
        if (!decoded.ok) return toolError(`${rel}: ${decoded.error}`);
        const base = rel.split("/").pop() || rel;
        if (base.toLowerCase() === "mcp.json") {
          const text = new TextDecoder("utf-8").decode(decoded.bytes);
          if (mcpJsonHasRawSecrets(text)) {
            return toolError(
              `${rel}: mcp.json must not contain raw API keys — use \${env:...} placeholders only`
            );
          }
        }
        const slash = rel.lastIndexOf("/");
        const folder =
          slash >= 0 ? `${dest.prefix}${rel.slice(0, slash)}` : dest.prefix.replace(/\/+$/, "");
        const name = slash >= 0 ? rel.slice(slash + 1) : rel;
        if (slash >= 0) {
          const mkdirResult = await wrapApiResponse(await apis.mkdir({ path: folder }));
          if (mkdirResult.isError) return mkdirResult;
        }
        const uploadedResult = await uploadBytes(apis, folder, name, decoded.bytes);
        if (uploadedResult.isError) return uploadedResult;
        uploaded.push({ key: `${dest.prefix}${rel}`, layer: dest.layer });
      }
      return toolText(
        JSON.stringify({
          layer: dest.layer,
          prefix: dest.prefix,
          uploaded,
        })
      );
    }
    case "publish_site": {
      if (!(await apis.sitesEnabled())) {
        return toolError(
          "Sites feature is off (404). Enable the Sites switch to publish."
        );
      }
      const slug = asString(args.slug).trim().toLowerCase();
      if (!slug) return toolError("slug is required");
      if (!isSiteSlug(slug)) {
        return toolError("slug must match [a-z0-9][a-z0-9-]{0,62}");
      }
      const sourceRaw = asString(args.source).trim().replace(/^\/+/, "").replace(/\/+$/, "");
      if (!sourceRaw) return toolError("source is required");
      if (sourceRaw.includes("..") || sourceRaw.startsWith("_$flaredrive$")) {
        return toolError("source is not a usable folder key");
      }
      const walked = await walkFolderFiles(apis, sourceRaw);
      if (walked === "missing") return toolError(`source folder not found: ${sourceRaw}`);
      if ("error" in walked) return toolError(walked.error);
      const copied: Array<{ from: string; to: string }> = [];
      const sourcePrefix = `${sourceRaw}/`;
      for (const item of walked.files) {
        const rel = item.key.startsWith(sourcePrefix)
          ? item.key.slice(sourcePrefix.length)
          : item.key === sourceRaw
            ? item.name
            : item.key.startsWith(`${sourceRaw}/`)
              ? item.key.slice(sourceRaw.length + 1)
              : item.name;
        if (!rel || rel.includes("..")) continue;
        const to = `sites/${slug}/${rel}`;
        const copyResult = await wrapApiResponse(
          await apis.copy({ from: item.key, to, overwrite: true })
        );
        if (copyResult.isError) return copyResult;
        copied.push({ from: item.key, to });
      }
      return toolText(
        JSON.stringify({
          slug,
          source: sourceRaw,
          copied: copied.length,
          files: copied,
        })
      );
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
