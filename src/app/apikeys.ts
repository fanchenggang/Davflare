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

export function overwriteCurlExample(
  origin: string,
  apiKey = "<apiKey>",
  path = "folder/"
) {
  return `curl -X POST "${origin}/api/upload?path=${path}&overwrite=1" -H "Authorization: Bearer ${apiKey}" -F "file=@photo.jpg"`;
}

export function backupCurlExample(
  origin: string,
  apiKey = "<apiKey>",
  path = "folder/notes.txt"
) {
  return `curl -X POST "${origin}/api/backup?path=${path}" -H "Authorization: Bearer ${apiKey}"`;
}

export function deleteCurlExample(
  origin: string,
  apiKey = "<apiKey>",
  path = "folder/notes.txt"
) {
  return `curl -X DELETE "${origin}/api/delete?path=${path}" -H "Authorization: Bearer ${apiKey}"`;
}

export function renameCurlExample(
  origin: string,
  apiKey = "<apiKey>",
  fromPath = "folder/old.txt",
  toPath = "folder/new.txt"
) {
  return `curl -X POST "${origin}/api/rename" -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '{"from":"${fromPath}","to":"${toPath}"}'`;
}

export function formatApiUsage(origin: string, apiKey = "<apiKey>") {
  const key = apiKey || "<apiKey>";
  return [
    "调用说明",
    "",
    "鉴权（所有开放接口相同，二选一，无需网页登录）：",
    `  Authorization: Bearer ${key}`,
    `  X-Api-Key: ${key}`,
    "内部目录 _$flaredrive$/ 一律拒绝。不使用网页 session。",
    "",
    "—— 上传 ——",
    "",
    `接口：POST ${origin}/api/upload`,
    "查询参数：path=目标目录/ （可空，表示根目录）",
    "  overwrite=1 或 true：按原文件名 PUT 覆盖同路径对象",
    "  默认（不带 overwrite）：同名会 uniqueName 为 name (2).ext，兼容现有客户端",
    "请求体：multipart 字段 file=@本地文件",
    "也可发送原始请求体，并加上 X-File-Name 文件名头。",
    "成功：201，返回 JSON { key, name, size, path, overwritten }",
    "目标是目录：409",
    "密钥无效或已过期：401",
    "单次文件过大（约 100MB）：413",
    "更大的文件请改用网页端分块上传。",
    "",
    "示例（multipart，不覆盖）：",
    `curl -X POST "${origin}/api/upload?path=folder/" \\`,
    `  -H "Authorization: Bearer ${key}" \\`,
    `  -F "file=@photo.jpg"`,
    "",
    "示例（覆盖上传 overwrite=1）：",
    `curl -X POST "${origin}/api/upload?path=folder/&overwrite=1" \\`,
    `  -H "Authorization: Bearer ${key}" \\`,
    `  -F "file=@photo.jpg"`,
    "",
    "示例（X-Api-Key + 原始请求体）：",
    `curl -X POST "${origin}/api/upload?path=docs/" \\`,
    `  -H "X-Api-Key: ${key}" \\`,
    `  -H "X-File-Name: notes.txt" \\`,
    `  --data-binary @notes.txt`,
    "",
    "—— 下载 ——",
    "",
    `接口：GET ${origin}/api/download`,
    "查询参数：path=对象键（必填，须为文件，不能是目录）",
    "成功：200，返回文件内容（Content-Disposition: attachment）",
    "缺少 path 或目标是目录：400；不存在：404；密钥无效：401",
    "",
    "示例：",
    `curl -L "${origin}/api/download?path=DBX/sync/snapshot.json" \\`,
    `  -H "Authorization: Bearer ${key}" \\`,
    `  -o snapshot.json`,
    "",
    "—— 列出目录（Depth 1）——",
    "",
    `接口：GET ${origin}/api/list`,
    "查询参数：path=目录/ （可空，表示根目录）",
    "只返回当前层：文件 + 直接子文件夹，不会递归整桶。",
    "成功：200，JSON { items: [{ key, name, size, isDir, uploaded, etag }] }",
    "  文件始终带 size（字节）、uploaded（ISO；缺省用纪元）和 etag，另有 updated 别名。",
    "  分隔前缀文件夹：isDir 为 true，size 为 0，uploaded 为 null。",
    "path 是文件：400；目录不存在：404",
    "",
    "示例：",
    `curl "${origin}/api/list?path=folder/" \\`,
    `  -H "Authorization: Bearer ${key}"`,
    "",
    "—— 冲突备份（同步冲突用这个）——",
    "",
    `接口：POST ${origin}/api/backup`,
    "查询参数：path=远端文件键（也可 JSON { path }）",
    "将文件复制到同目录 name.conflict-YYYYMMDDTHHMMSS.ext（保留扩展名，时间戳为 UTC），再删除原键。",
    "例如 notes.txt → notes.conflict-20260828T115537.txt",
    "R2 没有原生 rename，因此是 copy + delete。",
    "成功：200，JSON { from, to }",
    "目录：400；不存在：404",
    "",
    "示例：",
    `curl -X POST "${origin}/api/backup?path=folder/notes.txt" \\`,
    `  -H "Authorization: Bearer ${key}"`,
    "",
    "—— 重命名 ——",
    "",
    `接口：POST ${origin}/api/rename`,
    "JSON { from, to } 或查询参数 from / to。",
    "复制到 to 再删除 from。to 已存在则 409，除非 overwrite=1。",
    "成功：200，JSON { from, to }",
    "",
    "示例：",
    `curl -X POST "${origin}/api/rename" \\`,
    `  -H "Authorization: Bearer ${key}" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{"from":"folder/old.txt","to":"folder/new.txt"}'`,
    "",
    "—— 删除 ——",
    "",
    `接口：DELETE ${origin}/api/delete`,
    "查询参数：path=文件键。仅删除文件；目录返回 400（安全起见不递归）。",
    "成功：200，JSON { key, deleted: true }",
    "密钥无效：401；内部目录：400；不存在：404",
    "只有带有效密钥调用本接口才会删除用户文件。",
    "",
    "示例：",
    `curl -X DELETE "${origin}/api/delete?path=folder/notes.txt" \\`,
    `  -H "Authorization: Bearer ${key}"`,
    "",
    "—— 双向同步配方（本地优先，远端冲突先备份）——",
    "",
    "本地 = 用户机器上的文件。冲突策略：保留 LOCAL，先把 REMOTE 改名备份。",
    "1. GET /api/list 列出文件夹；按 key 比较：本地 mtime/size/etag 与远端 uploaded/size/etag。",
    "2. 仅本地新增或已改 → POST /api/upload?overwrite=1",
    "3. 仅远端新增或已改 → GET /api/download",
    "4. 双方都改（冲突）→ POST /api/backup?path=remoteKey",
    "   （远端改为 *.conflict-YYYYMMDDTHHMMSS.*），再 POST /api/upload?overwrite=1",
    "   用本地字节写回原文件名。",
    "5. 本地已删（可选）：DELETE /api/delete。默认配方可跳过删除，除非客户端有同步库跟踪。",
    "6. 远端多出来的文件：下载到本地。",
  ].join("\n");
}
