// agent 配置层（skills/rules/mcp 的 global/agent/project 分层）与 pull/push 所需的
// 目录遍历、文件读取（超限自动分页）、上传（超限自动分块）助手。
import {
  MCP_DOWNLOAD_PART_SIZE,
  MCP_MAX_BYTES,
  MCP_MAX_UPLOAD_BYTES,
  type McpToolResult,
  type ToolCallApis,
} from "./_mcpShared";
import { encodeBase64, isUtf8Text } from "./_mcpBytes";
import { isPlainObject, readJsonBody, toolError, wrapApiResponse } from "./_mcpRpc";
import { downloadPartTool, multipartUploadTool } from "./_mcpTransfer";

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

export async function walkFolderFiles(
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

export async function readPulledFile(
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

export async function uploadBytes(
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
