/**
 * Build ShareX / Typora client configs for Davflare image host.
 * Always uses YOUR_API_KEY placeholder — never embeds a live fd_ key.
 */

import { downloadTextFile } from "./mcpExport";

/** Placeholder users replace with their real API key (fd_…). */
export const IMAGE_HOST_API_KEY_PLACEHOLDER = "YOUR_API_KEY";

/** Strip trailing slashes; require an absolute http(s) origin. */
export function normalizeDriveOrigin(origin: string): string {
  const raw = (origin || "").trim();
  if (!raw) return "";
  try {
    const withScheme = raw.includes("://") ? raw : `https://${raw}`;
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return `${u.protocol}//${u.host}`;
  } catch {
    return "";
  }
}

export function imagesApiUrl(origin: string): string {
  const base = normalizeDriveOrigin(origin);
  return base ? `${base}/api/images` : "/api/images";
}

export type ShareXSxcu = {
  Version: string;
  Name: string;
  DestinationType: string;
  RequestMethod: string;
  RequestURL: string;
  Headers: Record<string, string>;
  Body: string;
  URL: string;
  ErrorMessage: string;
};

/**
 * ShareX custom uploader (.sxcu). Binary body + X-File-Name; URL from JSON `url`.
 * Replace YOUR_API_KEY before importing into ShareX.
 */
export function buildShareXSxcu(
  origin: string,
  apiKeyPlaceholder = IMAGE_HOST_API_KEY_PLACEHOLDER
): ShareXSxcu {
  return {
    Version: "15.0.0",
    Name: "Davflare",
    DestinationType: "ImageUploader",
    RequestMethod: "POST",
    RequestURL: imagesApiUrl(origin),
    Headers: {
      Authorization: `Bearer ${apiKeyPlaceholder}`,
      "X-Api-Key": apiKeyPlaceholder,
      "X-File-Name": "{filename}",
    },
    Body: "Binary",
    URL: "{json:url}",
    ErrorMessage: "{response}",
  };
}

export function buildShareXSxcuJson(
  origin: string,
  apiKeyPlaceholder = IMAGE_HOST_API_KEY_PLACEHOLDER
): string {
  return `${JSON.stringify(buildShareXSxcu(origin, apiKeyPlaceholder), null, 2)}\n`;
}

export function shareXFilename(): string {
  return "davflare.sxcu";
}

/**
 * One-line Typora / shell custom upload command.
 * Typora Custom Command: paste this as a shell one-liner, or wrap in a .sh.
 * `$1` is the local file path; stdout must be the public image URL.
 */
export function buildTyporaCurl(
  origin: string,
  apiKeyPlaceholder = IMAGE_HOST_API_KEY_PLACEHOLDER
): string {
  const endpoint = imagesApiUrl(origin);
  // sed extracts "url" without requiring jq; works on macOS/Linux.
  return [
    `curl -sS -X POST '${endpoint}'`,
    `-H 'Authorization: Bearer ${apiKeyPlaceholder}'`,
    `-H 'X-Api-Key: ${apiKeyPlaceholder}'`,
    `-H "X-File-Name: $(basename "$1")"`,
    `--data-binary @"$1"`,
    `| sed -n 's/.*"url"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p'`,
  ].join(" ");
}

/** True if exported text embeds a live-looking API key instead of the placeholder. */
export function imageHostExportContainsRawKey(text: string): boolean {
  if (/\bfd_[A-Za-z0-9_-]{8,}\b/.test(text)) return true;
  if (
    /Bearer\s+(?!YOUR_API_KEY)(?!\$\{)[A-Za-z0-9._-]{12,}/i.test(text)
  ) {
    return true;
  }
  return false;
}

export { downloadTextFile };
