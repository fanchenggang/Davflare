import { authFetch } from "./auth";
import { createShare, formatShareClipboard } from "./share";
import { translate } from "./strings";
import { ShareInfo } from "./types";
import { encodeKey } from "./utils";
import { WEBDAV_ENDPOINT } from "./uploadTransfer";

/** Max paste body accepted in the UI (same order as share landing preview cap). */
export const PASTE_MAX_CHARS = 512 * 1024;

/**
 * Default paste filename: paste-YYYYMMDD-HHMMSS.txt (local time).
 * Pure helper for tests / PasteDialog.
 */
export function defaultPasteFilename(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `paste-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours()
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}.txt`;
}

/** Sanitize user-entered name; always end with .txt; strip path separators. */
export function sanitizePasteFilename(name: string): string {
  let cleaned = (name || "").trim().replace(/[/\\]/g, "_");
  if (!cleaned) cleaned = defaultPasteFilename();
  if (!/\.txt$/i.test(cleaned)) cleaned = `${cleaned}.txt`;
  return cleaned;
}

export function joinCwdKey(cwd: string, filename: string): string {
  const base = cwd.replace(/^\/+/, "").replace(/\/+$/, "");
  return base ? `${base}/${filename}` : filename;
}

/** PUT a UTF-8 text/plain object via WebDAV (reuses existing upload path). */
export async function uploadPlainText(key: string, text: string): Promise<void> {
  const response = await authFetch(`${WEBDAV_ENDPOINT}${encodeKey(key)}`, {
    method: "PUT",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    body: text,
  });
  if (!response.ok) {
    throw new Error((await response.text()) || translate("pasteUploadFailed"));
  }
}

export type PasteShareOptions = {
  cwd: string;
  text: string;
  filename?: string;
  expiresInHours?: number;
  extractCode?: string;
};

/**
 * Write text as .txt under cwd, then create a share link (expiry / extract code optional).
 * No new API — PUT /webdav + POST /api/shares.
 */
export async function createPasteShare(options: PasteShareOptions): Promise<{
  key: string;
  share: ShareInfo;
  clipboard: string;
}> {
  const text = options.text;
  if (!text.trim()) throw new Error(translate("pasteEmpty"));
  if (text.length > PASTE_MAX_CHARS) throw new Error(translate("pasteTooLarge"));

  const filename = sanitizePasteFilename(options.filename || defaultPasteFilename());
  const key = joinCwdKey(options.cwd, filename);
  await uploadPlainText(key, text);
  const share = await createShare(key, options.expiresInHours, options.extractCode);
  return { key, share, clipboard: formatShareClipboard(share) };
}
