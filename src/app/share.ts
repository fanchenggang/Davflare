import { authFetch } from "./auth";
import { ShareInfo } from "./types";

export async function createShare(
  key: string,
  expiresInHours?: number
): Promise<ShareInfo> {
  const response = await authFetch("/api/shares", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, expiresInHours }),
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
