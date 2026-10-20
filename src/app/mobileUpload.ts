/**
 * Build iOS Shortcuts / Android HTTP Shortcuts recipes for Davflare mobile upload.
 * Always uses YOUR_API_KEY placeholder — never embeds a live fd_ key.
 * Reuses existing POST /api/upload and POST /api/images — no new APIs.
 */

import {
  IMAGE_HOST_API_KEY_PLACEHOLDER,
  imagesApiUrl,
  normalizeDriveOrigin,
} from "./imageHostExport";
import { downloadTextFile } from "./mcpExport";

/** Default folder for phone uploads (trailing slash). */
export const MOBILE_UPLOAD_DEFAULT_PATH = "mobile/";

/** Placeholder users replace with their real API key (fd_…). */
export const MOBILE_UPLOAD_API_KEY_PLACEHOLDER = IMAGE_HOST_API_KEY_PLACEHOLDER;

export { imagesApiUrl, normalizeDriveOrigin, downloadTextFile };

/**
 * Normalize a folder path for `?path=` on /api/upload.
 * Strips leading slashes, ensures a trailing slash when non-empty.
 * Rejects the internal `_$flaredrive$/` prefix (returns "").
 */
export function normalizeUploadFolderPath(path: string): string {
  let p = (path || "").trim().replace(/^\/+/, "");
  if (!p) return "";
  if (p.startsWith("_$flaredrive$/") || p === "_$flaredrive$") return "";
  if (!p.endsWith("/")) p += "/";
  return p;
}

/** Absolute (or relative) POST /api/upload URL with optional ?path=. */
export function uploadApiUrl(origin: string, folderPath: string): string {
  const base = normalizeDriveOrigin(origin);
  const folder = normalizeUploadFolderPath(folderPath);
  const qs = folder ? `?path=${encodeURIComponent(folder)}` : "";
  return base ? `${base}/api/upload${qs}` : `/api/upload${qs}`;
}

/**
 * One-line curl for Open API raw-body upload (X-File-Name + binary).
 * `$1` is the local file path — handy for shell / Typora-style wrappers too.
 */
export function buildMobileUploadCurl(
  origin: string,
  folderPath: string,
  apiKeyPlaceholder = MOBILE_UPLOAD_API_KEY_PLACEHOLDER
): string {
  const endpoint = uploadApiUrl(origin, folderPath);
  return [
    `curl -sS -X POST '${endpoint}'`,
    `-H 'Authorization: Bearer ${apiKeyPlaceholder}'`,
    `-H 'X-Api-Key: ${apiKeyPlaceholder}'`,
    `-H "X-File-Name: $(basename "$1")"`,
    `--data-binary @"$1"`,
  ].join(" ");
}

/**
 * One-line curl for POST /api/images (public CDN URL in JSON `url`).
 * Same auth / X-File-Name pattern as ShareX / Typora exports.
 */
export function buildMobileImagesCurl(
  origin: string,
  apiKeyPlaceholder = MOBILE_UPLOAD_API_KEY_PLACEHOLDER
): string {
  const endpoint = imagesApiUrl(origin);
  return [
    `curl -sS -X POST '${endpoint}'`,
    `-H 'Authorization: Bearer ${apiKeyPlaceholder}'`,
    `-H 'X-Api-Key: ${apiKeyPlaceholder}'`,
    `-H "X-File-Name: $(basename "$1")"`,
    `--data-binary @"$1"`,
  ].join(" ");
}

export type MobileUploadMode = "upload" | "images";

/**
 * Machine-readable recipe for Android HTTP Shortcuts / Tasker / docs.
 * Not a full HTTP Shortcuts zip import (format is proprietary) — users
 * recreate the shortcut from these fields, or paste the curl into the app's
 * "Import from cURL" flow.
 */
export type AndroidHttpShortcutRecipe = {
  name: string;
  description: string;
  client: "HTTP Shortcuts" | "Tasker" | "curl";
  method: "POST";
  url: string;
  headers: Record<string, string>;
  body: "binary";
  /** How to pick the file: share-sheet / file-picker / camera */
  fileSource: "share-sheet";
  notes: string[];
};

export function buildAndroidHttpShortcutRecipe(
  origin: string,
  folderPath: string,
  mode: MobileUploadMode = "upload",
  apiKeyPlaceholder = MOBILE_UPLOAD_API_KEY_PLACEHOLDER
): AndroidHttpShortcutRecipe {
  const isImages = mode === "images";
  const url = isImages ? imagesApiUrl(origin) : uploadApiUrl(origin, folderPath);
  return {
    name: isImages ? "Davflare Image Host" : "Davflare Upload",
    description: isImages
      ? "POST /api/images → public https://<SITES_HOST>/i/{id}"
      : `POST /api/upload into ${normalizeUploadFolderPath(folderPath) || "(root)"}`,
    client: "HTTP Shortcuts",
    method: "POST",
    url,
    headers: {
      Authorization: `Bearer ${apiKeyPlaceholder}`,
      "X-Api-Key": apiKeyPlaceholder,
      "X-File-Name": "{{file.name}}",
    },
    body: "binary",
    fileSource: "share-sheet",
    notes: [
      `Replace ${apiKeyPlaceholder} with your API key from the Davflare web UI.`,
      "In HTTP Shortcuts: New shortcut → Request → Method POST → URL above → Headers → Body = File (from share / file picker).",
      "Or: Import / Export → Import from cURL and paste the curl one-liner from Settings.",
      isImages
        ? "Response JSON includes url (CDN). Show it as a toast or copy action."
        : "File lands in the folder given by ?path= (uniqueNames on collision unless overwrite=1).",
    ],
  };
}

export function buildAndroidHttpShortcutRecipeJson(
  origin: string,
  folderPath: string,
  mode: MobileUploadMode = "upload",
  apiKeyPlaceholder = MOBILE_UPLOAD_API_KEY_PLACEHOLDER
): string {
  return `${JSON.stringify(
    buildAndroidHttpShortcutRecipe(origin, folderPath, mode, apiKeyPlaceholder),
    null,
    2
  )}\n`;
}

export function androidRecipeFilename(mode: MobileUploadMode = "upload"): string {
  return mode === "images"
    ? "davflare-android-images.json"
    : "davflare-android-upload.json";
}

/** True if exported text embeds a live-looking API key instead of the placeholder. */
export function mobileUploadContainsRawKey(text: string): boolean {
  if (/\bfd_[A-Za-z0-9_-]{8,}\b/.test(text)) return true;
  if (
    /Bearer\s+(?!YOUR_API_KEY)(?!\$\{)[A-Za-z0-9._-]{12,}/i.test(text)
  ) {
    return true;
  }
  return false;
}

/**
 * Compact values block for copy-paste into Shortcuts / notes.
 * Language-agnostic labels (URL / headers) — UI wraps with i18n hints.
 */
export function buildMobileUploadValuesBlock(
  origin: string,
  folderPath: string,
  apiKeyPlaceholder = MOBILE_UPLOAD_API_KEY_PLACEHOLDER
): string {
  const base = normalizeDriveOrigin(origin) || origin.trim();
  const folder = normalizeUploadFolderPath(folderPath) || "(root)";
  return [
    `Drive origin: ${base}`,
    `Upload URL: ${uploadApiUrl(origin, folderPath)}`,
    `Images URL: ${imagesApiUrl(origin)}`,
    `Target folder: ${folder}`,
    `Authorization: Bearer ${apiKeyPlaceholder}`,
    `X-Api-Key: ${apiKeyPlaceholder}`,
    `X-File-Name: <shared file name>`,
  ].join("\n");
}
