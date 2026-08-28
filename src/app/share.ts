import { authFetch } from "./auth";
import { ShareInfo } from "./types";

export async function createShare(
  key: string,
  expiresInHours?: number,
  extractCode?: string
): Promise<ShareInfo> {
  const body: Record<string, unknown> = { key };
  if (expiresInHours) body.expiresInHours = expiresInHours;
  const code = extractCode?.trim();
  if (code) body.extractCode = code;
  const response = await authFetch("/api/shares", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error((await response.text()) || "创建分享失败");
  }
  return response.json();
}

export async function listShares(): Promise<ShareInfo[]> {
  const response = await authFetch("/api/shares");
  if (!response.ok) throw new Error("获取分享失败");
  return response.json();
}

export async function revokeShare(token: string) {
  const response = await authFetch(`/api/shares?token=${encodeURIComponent(token)}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("撤销分享失败");
}

export function formatShareClipboard(share: ShareInfo): string {
  const lines = [`链接：${share.url}`];
  if (share.expiresAt) {
    lines.push(`有效期至：${new Date(share.expiresAt).toLocaleString()}`);
  }
  if (share.extractCode) {
    lines.push(`提取码：${share.extractCode}`);
  }
  return lines.join("\n");
}
