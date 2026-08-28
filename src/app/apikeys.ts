import { authFetch } from "./auth";
import { ApiKeyInfo } from "./types";

export async function listApiKeys(): Promise<ApiKeyInfo[]> {
  const response = await authFetch("/api/keys");
  if (!response.ok) throw new Error((await response.text()) || "获取 API 密钥失败");
  return response.json();
}

export async function createApiKey(input: {
  name: string;
  expiresInHours?: number | null;
  key?: string;
}): Promise<ApiKeyInfo & { key: string }> {
  const body: Record<string, unknown> = { name: input.name };
  if (input.expiresInHours) body.expiresInHours = input.expiresInHours;
  const custom = input.key?.trim();
  if (custom) body.key = custom;
  const response = await authFetch("/api/keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error((await response.text()) || "创建 API 密钥失败");
  }
  return response.json();
}

export async function revokeApiKey(id: string) {
  const response = await authFetch(`/api/keys?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error((await response.text()) || "作废密钥失败");
}

export function uploadCurlExample(origin: string, apiKey = "<apiKey>", path = "folder/") {
  return `curl -X POST "${origin}/api/upload?path=${path}" -H "Authorization: Bearer ${apiKey}" -F "file=@photo.jpg"`;
}

export function downloadCurlExample(
  origin: string,
  apiKey = "<apiKey>",
  path = "DBX/sync/snapshot.json"
) {
  return `curl -L "${origin}/api/download?path=${path}" -H "Authorization: Bearer ${apiKey}" -o snapshot.json`;
}

export function listCurlExample(origin: string, apiKey = "<apiKey>", path = "folder/") {
  return `curl "${origin}/api/list?path=${path}" -H "Authorization: Bearer ${apiKey}"`;
}

export function formatApiUsage(origin: string, apiKey = "<apiKey>") {
  const key = apiKey || "<apiKey>";
  return [
    "调用说明",
    "",
    `接口：POST ${origin}/api/upload`,
    "鉴权（二选一）：",
    `  Authorization: Bearer ${key}`,
    `  X-Api-Key: ${key}`,
    "查询参数：path=目标目录/ （可空，表示根目录）",
    "请求体：multipart 字段 file=@本地文件",
    "也可发送原始请求体，并加上 X-File-Name 文件名头。",
    "",
    "成功：201，返回 JSON { key, name, size, path }",
    "密钥无效或已过期：401",
    "单次文件过大（约 100MB）：413",
    "更大的文件请改用网页端分块上传。",
    "",
    "示例（multipart，当前目录根）：",
    `curl -X POST "${origin}/api/upload" \\`,
    `  -H "Authorization: Bearer ${key}" \\`,
    `  -F "file=@photo.jpg"`,
    "",
    "示例（上传到子目录）：",
    `curl -X POST "${origin}/api/upload?path=folder/" \\`,
    `  -H "Authorization: Bearer ${key}" \\`,
    `  -F "file=@photo.jpg"`,
    "",
    "示例（X-Api-Key + 原始请求体）：",
    `curl -X POST "${origin}/api/upload?path=docs/" \\`,
    `  -H "X-Api-Key: ${key}" \\`,
    `  -H "X-File-Name: notes.txt" \\`,
    `  --data-binary @notes.txt`,
    "",
    "示例（fetch）：",
    `const form = new FormData();`,
    `form.append("file", file);`,
    `await fetch("${origin}/api/upload?path=folder/", {`,
    `  method: "POST",`,
    `  headers: { Authorization: "Bearer ${key}" },`,
    `  body: form,`,
    `});`,
    "",
    "—— 下载 ——",
    "",
    `接口：GET ${origin}/api/download`,
    "鉴权与上传相同（Authorization: Bearer 或 X-Api-Key），无需网页登录。",
    "查询参数：path=对象键（必填，须为文件，不能是目录）",
    "成功：200，返回文件内容",
    "  Content-Type：对象元数据或 application/octet-stream",
    "  Content-Disposition：attachment; filename=文件名",
    "  Content-Length：已知时带上",
    "密钥无效或已过期：401",
    "缺少 path、path 为空，或目标是目录：400",
    "文件不存在：404",
    "文件夹不能整包下载，请先 list 再逐个文件下载（与上传相同，一次一个文件）。",
    "",
    "示例（curl）：",
    `curl -L "${origin}/api/download?path=DBX/sync/snapshot.json" \\`,
    `  -H "Authorization: Bearer ${key}" \\`,
    `  -o snapshot.json`,
    "",
    "示例（X-Api-Key）：",
    `curl -L "${origin}/api/download?path=DBX/sync/snapshot.json" \\`,
    `  -H "X-Api-Key: ${key}" \\`,
    `  -o snapshot.json`,
    "",
    "示例（fetch）：",
    `const res = await fetch("${origin}/api/download?path=DBX/sync/snapshot.json", {`,
    `  headers: { Authorization: "Bearer ${key}" },`,
    `});`,
    `if (!res.ok) throw new Error(await res.text());`,
    `const blob = await res.blob();`,
    "",
    "—— 列出目录（Depth 1，下载前先列出）——",
    "",
    `接口：GET ${origin}/api/list`,
    "鉴权与上传/下载相同（Authorization: Bearer 或 X-Api-Key），无需网页登录。",
    "查询参数：path=目录/ （可空，表示根目录）",
    "只返回当前层：文件 + 直接子文件夹，不会递归整桶。",
    "成功：200，JSON { items: [{ key, name, size, isDir, uploaded? }] }",
    "密钥无效或已过期：401",
    "path 是文件：400（请改用 /api/download）",
    "路径不合法或内部目录：400",
    "目录不存在：404",
    "下载目录：先 list，再对 isDir 为 false 的每一项调用 /api/download。",
    "子文件夹：再对 path=<item.key> 调用 /api/list。",
    "",
    "示例（curl 列出）：",
    `curl "${origin}/api/list?path=folder/" \\`,
    `  -H "Authorization: Bearer ${key}"`,
    "",
    "示例（列出后逐个下载文件）：",
    `curl -L "${origin}/api/download?path=<item.key>" \\`,
    `  -H "Authorization: Bearer ${key}" \\`,
    `  -o <item.name>`,
    "",
    "示例（fetch：list 后下载文件，子目录再 list）：",
    `const listRes = await fetch("${origin}/api/list?path=folder/", {`,
    `  headers: { Authorization: "Bearer ${key}" },`,
    `});`,
    `if (!listRes.ok) throw new Error(await listRes.text());`,
    `const { items } = await listRes.json();`,
    `for (const item of items) {`,
    `  if (item.isDir) continue; // 子目录：再 GET /api/list?path=item.key`,
    `  const fileRes = await fetch(`,
    `    "${origin}/api/download?path=" + encodeURIComponent(item.key),`,
    `    { headers: { Authorization: "Bearer ${key}" } }`,
    `  );`,
    `  if (!fileRes.ok) throw new Error(await fileRes.text());`,
    `  const blob = await fileRes.blob();`,
    `}`,
  ].join("\n");
}
