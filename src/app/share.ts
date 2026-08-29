import { authFetch } from "./auth";
import { translate } from "./strings";
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
    throw new Error((await response.text()) || translate("createShareFailed"));
  }
  return response.json();
}

export async function listShares(): Promise<ShareInfo[]> {
  const response = await authFetch("/api/shares");
  if (!response.ok) throw new Error(translate("loadSharesFailed"));
  return response.json();
}

export async function revokeShare(token: string) {
  const response = await authFetch(`/api/shares?token=${encodeURIComponent(token)}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error(translate("revokeShareFailed"));
}

export function formatShareClipboard(share: ShareInfo): string {
  const lines = [translate("shareClipboard", { url: share.url })];
  if (share.expiresAt) {
    lines.push(translate("shareClipboardExpiry", { time: new Date(share.expiresAt).toLocaleString() }));
  }
  if (share.extractCode) {
    lines.push(translate("shareClipboardCode", { code: share.extractCode }));
  }
  return lines.join("\n");
}
