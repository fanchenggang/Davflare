// JSON-RPC 2.0 / MCP Streamable HTTP dispatcher (pure; no R2).
// Pages Function at functions/mcp.ts wraps Open API handlers.
// 工具定义见 _mcpTools，类型/常量见 _mcpShared，编码见 _mcpBytes，
// rpc 解析见 _mcpRpc，传输与 agent 助手见 _mcpTransfer/_mcpAgent；
// 本文件保留 tools/call 分发与 JSON-RPC 编排，并 re-export 全部公开符号。

import {
  AGENT_LAYOUT_TYPES,
  AGENT_MERGE_ORDER,
  agentLayerPrefixes,
  agentPushPrefix,
  isSiteSlug,
  mcpJsonHasRawSecrets,
  readPulledFile,
  sanitizeAgentRelPath,
  uploadBytes,
  walkFolderFiles,
  type AgentLayer,
} from "./_mcpAgent";
import { decodeUploadContent, encodeBase64, isUtf8Text } from "./_mcpBytes";
import {
  initializeResult,
  isPlainObject,
  parseToolCall,
  rpcError,
  rpcResult,
  toolError,
  toolText,
  wrapApiResponse,
} from "./_mcpRpc";
import { downloadPartTool, multipartUploadTool, zipTool } from "./_mcpTransfer";
import {
  MCP_MAX_BYTES,
  MCP_MAX_IMAGE_BYTES,
  MCP_MAX_UPLOAD_BYTES,
  type JsonRpcId,
  type JsonRpcRequest,
  type McpHttpResult,
  type McpToolResult,
  type ToolCallApis,
} from "./_mcpShared";
import { MCP_TOOLS } from "./_mcpTools";

export * from "./_mcpShared";
export * from "./_mcpTools";
export * from "./_mcpBytes";
export * from "./_mcpRpc";
export * from "./_mcpAgent";
export * from "./_mcpTransfer";

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
    case "zip": {
      const path = asString(args.path);
      if (!path) return toolError("path is required");
      const part = asOptionalNumber(args.part);
      const partSize = asOptionalNumber(args.partSize);
      return zipTool(apis, path, part, partSize);
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
    case "trash_list": {
      return wrapApiResponse(await apis.trashList());
    }
    case "trash_restore": {
      const trashKeys: string[] = [];
      const single = asString(args.trashKey).trim();
      if (single) trashKeys.push(single);
      if (Array.isArray(args.trashKeys)) {
        for (const item of args.trashKeys) {
          const key = asString(item).trim();
          if (key) trashKeys.push(key);
        }
      }
      if (trashKeys.length === 0) {
        return toolError("trashKey or trashKeys is required");
      }
      return wrapApiResponse(await apis.trashRestore({ trashKeys }));
    }
    case "trash_empty": {
      if (Array.isArray(args.trashKeys) && args.trashKeys.length > 0) {
        const trashKeys: string[] = [];
        for (const item of args.trashKeys) {
          const key = asString(item).trim();
          if (key) trashKeys.push(key);
        }
        if (trashKeys.length === 0) {
          return toolError("trashKeys must be non-empty strings");
        }
        return wrapApiResponse(await apis.trashEmpty({ trashKeys }));
      }
      return wrapApiResponse(await apis.trashEmpty({ all: true }));
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
    case "image_list": {
      if (!(await apis.imageHostEnabled())) {
        return toolError(
          "Image Host feature is off (404). Enable the Image Host switch to list images."
        );
      }
      return wrapApiResponse(await apis.imageList());
    }
    case "image_upload": {
      if (!(await apis.imageHostEnabled())) {
        return toolError(
          "Image Host feature is off (404). Enable the Image Host switch to upload images."
        );
      }
      const fileName = asString(args.name);
      const content = asString(args.content);
      if (!fileName) return toolError("name is required");
      if (!Object.prototype.hasOwnProperty.call(args, "content")) {
        return toolError("content is required");
      }
      const encoding =
        typeof args.encoding === "string" ? args.encoding : "base64";
      const decoded = decodeUploadContent(content, encoding);
      if (!decoded.ok) return toolError(decoded.error);
      if (decoded.bytes.byteLength > MCP_MAX_IMAGE_BYTES) {
        return toolError("Image larger than 20 MB (image host cap).");
      }
      const contentType =
        typeof args.contentType === "string" ? args.contentType : undefined;
      return wrapApiResponse(
        await apis.imageUpload({
          name: fileName,
          body: decoded.bytes,
          contentType,
        })
      );
    }
    case "image_delete": {
      if (!(await apis.imageHostEnabled())) {
        return toolError(
          "Image Host feature is off (404). Enable the Image Host switch to delete images."
        );
      }
      const id = asString(args.id).trim();
      if (!id) return toolError("id is required");
      return wrapApiResponse(await apis.imageDelete({ id }));
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
