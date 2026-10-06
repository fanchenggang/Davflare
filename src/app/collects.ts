import { authFetch } from "./auth";
import { translate } from "./strings";

export type CollectStatus = "active" | "expired" | "disabled";

export interface CollectInfo {
  token: string;
  url: string;
  folder: string;
  name: string;
  note: string;
  createdAt: string;
  expiresAt: string;
  disabledAt: string | null;
  status: CollectStatus;
  limits: { maxFileBytes: number; maxFiles: number; maxTotalBytes: number };
  usage: { files: number; bytes: number };
  pendingCount: number;
}

/** 管理端可选的有效期（小时）；服务端上限 168 小时（7 天） */
export const COLLECT_EXPIRY_OPTIONS: Array<{ hours: number; labelKey: string }> = [
  { hours: 24, labelKey: "collectExpiry1d" },
  { hours: 72, labelKey: "collectExpiry3d" },
  { hours: 168, labelKey: "collectExpiry7d" },
];

async function failure(response: Response, fallbackKey: string): Promise<Error> {
  let text = "";
  try {
    text = await response.text();
  } catch {
    // ignore
  }
  return new Error(text && text.length < 200 ? text : translate(fallbackKey));
}

export async function listCollects(): Promise<CollectInfo[]> {
  const response = await authFetch("/api/collects");
  if (!response.ok) throw new Error(translate("loadCollectsFailed"));
  return response.json();
}

export async function createCollect(
  folder: string,
  expiresInHours: number,
  note?: string
): Promise<CollectInfo> {
  const body: Record<string, unknown> = { folder, expiresInHours };
  const trimmed = note?.trim();
  if (trimmed) body.note = trimmed;
  const response = await authFetch("/api/collects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await failure(response, "createCollectFailed");
  return response.json();
}

export async function disableCollect(token: string): Promise<CollectInfo> {
  const response = await authFetch(`/api/collects?token=${encodeURIComponent(token)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ disabled: true }),
  });
  if (!response.ok) throw await failure(response, "disableCollectFailed");
  return response.json();
}

export async function deleteCollect(token: string): Promise<void> {
  const response = await authFetch(`/api/collects?token=${encodeURIComponent(token)}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error(translate("deleteCollectFailed"));
}

export function collectStatusLabel(status: CollectStatus): string {
  if (status === "disabled") return translate("collectStatusDisabled");
  if (status === "expired") return translate("collectStatusExpired");
  return translate("collectStatusActive");
}
