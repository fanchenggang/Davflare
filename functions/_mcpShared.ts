// MCP 共享常量与 JSON-RPC / 工具结果类型（无依赖，供各 _mcp* 模块引用）。
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
/** Image host upload cap (matches /api/images) */
export const MCP_MAX_IMAGE_BYTES = 20 * 1024 * 1024;

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
  /** Authenticated folder/file zip via GET /api/archive?path= */
  zip: (query: { path: string }) => Promise<Response>;
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
  trashList: () => Promise<Response>;
  trashRestore: (query: { trashKeys: string[] }) => Promise<Response>;
  trashEmpty: (query: {
    trashKeys?: string[];
    all?: boolean;
  }) => Promise<Response>;
  sitesList: (query: { withStats?: boolean }) => Promise<Response>;
  sitesConfig: (query: { slug: string; spa: boolean }) => Promise<Response>;
  sitesDelete: (query: { slug: string; purge?: boolean }) => Promise<Response>;
  /** Product Sites switch; publish_site is 404 when false. */
  sitesEnabled: () => Promise<boolean>;
  imageList: () => Promise<Response>;
  imageUpload: (query: {
    name: string;
    body: Uint8Array;
    contentType?: string;
  }) => Promise<Response>;
  imageDelete: (query: { id: string }) => Promise<Response>;
  /** Product Image Host switch; image_* tools error when false. */
  imageHostEnabled: () => Promise<boolean>;
};
