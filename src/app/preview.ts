import { FileItem } from "./types";

export const TEXT_PREVIEW_MAX_BYTES = 2 * 1024 * 1024;

const TEXT_EXTENSIONS = new Set("txt md markdown json jsonc html htm xml svg css scss less js jsx mjs cjs ts tsx vue svelte py rb go rs java kt c h cpp hpp cs php sh bash zsh yaml yml toml ini conf cfg env properties csv tsv log sql graphql gql proto dockerfile gitignore editorconfig lock".split(" "));
const TEXT_CONTENT_TYPES = new Set("application/json application/xml application/javascript application/x-javascript application/ecmascript application/typescript application/yaml application/x-yaml application/toml application/graphql application/sql application/x-sh application/x-httpd-php application/xhtml+xml".split(" "));
const TEXT_BASENAMES = new Set(["dockerfile","editorconfig"]);
export type FileIconKind = "folder" | "image" | "video" | "audio" | "pdf" | "zip" | "json" | "html" | "css" | "js" | "code" | "text" | "csv" | "shell" | "other";
function basenameLower(name: string) { return (name.replace(/\/$/, "").split("/").pop() ?? "").toLowerCase(); }
export function fileExtension(name: string) { const base = basenameLower(name); if (!base) return ""; if (base.startsWith(".") && base.indexOf(".", 1) === -1) return base.slice(1); const dot = base.lastIndexOf("."); return dot > 0 ? base.slice(dot + 1) : ""; }
export function mimeType(contentType: string | undefined) { return (contentType || "").toLowerCase().split(";")[0].trim(); }
export function isTextPreviewable(file: { name: string; contentType?: string; isDir?: boolean }) { if (file.isDir) return false; const base = basenameLower(file.name); const ext = fileExtension(file.name); const type = mimeType(file.contentType); if (TEXT_BASENAMES.has(base)) return true; if (ext && TEXT_EXTENSIONS.has(ext)) return true; if (!type) return false; if (type.startsWith("text/")) return true; if (TEXT_CONTENT_TYPES.has(type)) return true; return type.endsWith("+xml") || type.endsWith("+json"); }
export function isMediaPreviewable(file: { contentType?: string; isDir?: boolean }) { if (file.isDir) return false; const type = mimeType(file.contentType); return (type.startsWith("image/") && type !== "image/svg+xml") || type.startsWith("video/") || type.startsWith("audio/") || type === "application/pdf"; }
export function isJsonFile(file: { name: string; contentType?: string }) { const ext = fileExtension(file.name); const type = mimeType(file.contentType); return ext === "json" || ext === "jsonc" || type === "application/json" || type.endsWith("+json"); }
export function isPreviewable(file: FileItem) { return isMediaPreviewable(file) || isTextPreviewable(file); }
export function fileIconKind(file: { name?: string; contentType?: string; isDir?: boolean }): FileIconKind { if (file.isDir || mimeType(file.contentType) === "application/x-directory") return "folder"; const type = mimeType(file.contentType); const ext = fileExtension(file.name || ""); if (type.startsWith("image/") && ext !== "svg") return "image"; if (type.startsWith("video/")) return "video"; if (type.startsWith("audio/")) return "audio"; if (type === "application/pdf" || ext === "pdf") return "pdf"; if (type === "application/zip" || type === "application/gzip" || ["zip","gz","tgz","tar","7z","rar"].includes(ext)) return "zip"; if (ext === "json" || ext === "jsonc" || type === "application/json" || type.endsWith("+json")) return "json"; if (ext === "html" || ext === "htm" || type === "text/html") return "html"; if (ext === "css" || ext === "scss" || ext === "less" || type === "text/css") return "css"; if (["js","jsx","mjs","cjs","ts","tsx"].includes(ext) || type.includes("javascript") || type.includes("typescript")) return "js"; if (["csv","tsv"].includes(ext) || type === "text/csv") return "csv"; if (["sh","bash","zsh"].includes(ext) || type === "application/x-sh") return "shell"; if (["txt","md","markdown","log"].includes(ext)) return "text"; if (isTextPreviewable({ name: file.name || "", contentType: type })) return "code"; return "other"; }
export function prettyJsonOrRaw(raw: string): { text: string; parseError: boolean } { try { return { text: JSON.stringify(JSON.parse(raw), null, 2), parseError: false }; } catch { return { text: raw, parseError: true }; } }
export async function readResponseTextCapped(response: Response, maxBytes = TEXT_PREVIEW_MAX_BYTES): Promise<{ ok: true; text: string; size: number } | { ok: false; tooLarge: true; size: number }> {
  const headerLen = Number(response.headers.get("content-length") || 0);
  if (headerLen > maxBytes) { try { await response.body?.cancel(); } catch {} return { ok: false, tooLarge: true, size: headerLen }; }
  if (!response.body) { const blob = await response.blob(); if (blob.size > maxBytes) return { ok: false, tooLarge: true, size: blob.size }; return { ok: true, text: await blob.text(), size: blob.size }; }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) { try { await reader.cancel(); } catch {} return { ok: false, tooLarge: true, size: Math.max(headerLen, received) }; }
    chunks.push(value);
  }
  const all = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.byteLength; }
  return { ok: true, text: new TextDecoder("utf-8").decode(all), size: received };
}
