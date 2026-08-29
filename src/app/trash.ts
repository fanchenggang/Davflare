import { authFetch } from "./auth";
import { translate } from "./strings";
import { TrashItem } from "./types";

export async function listTrash(): Promise<TrashItem[]> {
  const response = await authFetch("/api/trash");
  if (!response.ok) throw new Error(translate("getTrashFailed"));
  return response.json();
}

export async function moveToTrash(keys: string[]) {
  const response = await authFetch("/api/trash", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keys }),
  });
  if (!response.ok) throw new Error((await response.text()) || translate("moveToTrashFailed"));
  return (await response.json()) as { results: Array<{ key: string; id: string }> };
}

export async function restoreTrash(trashKeys: string[]) {
  const response = await authFetch("/api/trash?action=restore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trashKeys }),
  });
  if (!response.ok) throw new Error(translate("restoreFailed"));
  return response.json() as Promise<
    Array<{ trashKey: string; status: string; message?: string }>
  >;
}

export async function permanentDeleteTrash(
  trashKeys: string[],
  all = false
) {
  const response = await authFetch("/api/trash", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trashKeys, all }),
  });
  if (!response.ok) throw new Error(translate("permanentDeleteFailed"));
}
