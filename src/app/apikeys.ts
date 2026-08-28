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
  ].join("\n");
}
