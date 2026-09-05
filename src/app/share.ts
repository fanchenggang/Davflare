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

export interface ShareExpiryView {
  label: string;
  /** 剩余不足 24 小时，Chip 用 warning 色 */
  urgent: boolean;
}

/** 纯函数：剩余毫秒 → 倒计时人话（>48h「N 天」、2-48h「N 小时」、<2h「N 分钟」），非正数视为已过期 */
export function formatShareCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return translate("shareExpired");
  if (remainingMs > 48 * 60 * 60 * 1000) {
    return translate("shareDaysLeft", { n: Math.floor(remainingMs / (24 * 60 * 60 * 1000)) });
  }
  if (remainingMs > 2 * 60 * 60 * 1000) {
    return translate("shareHoursLeft", { n: Math.floor(remainingMs / (60 * 60 * 1000)) });
  }
  return translate("shareMinutesLeft", { n: Math.max(1, Math.ceil(remainingMs / 60000)) });
}

/**
 * Chip 渲染模型；null = 永不过期（expiresAt 缺失或非法）。
 * now 参数供单测注入，默认取当前时间。
 */
export function shareExpiryView(
  expiresAt: string | null | undefined,
  now: number = Date.now()
): ShareExpiryView | null {
  if (!expiresAt) return null;
  const expires = new Date(expiresAt).getTime();
  if (Number.isNaN(expires)) return null;
  const remaining = expires - now;
  const countdown = formatShareCountdown(remaining);
  return {
    label: remaining > 0 ? translate("shareExpiresIn", { time: countdown }) : countdown,
    // 已过期同样走 warning 色，提示访客链接不再可用
    urgent: remaining < 24 * 60 * 60 * 1000,
  };
}
