/** Build Cursor / Claude Desktop MCP client configs. Never embeds a live API key. */

import { mcpEndpoint } from "./mcpPlayground";

/** Env var name clients should set to the Davflare API key (fd_…). */
export const MCP_API_KEY_ENV = "DAVFLARE_API_KEY";

/** Cursor `mcp.json` placeholder: `${env:DAVFLARE_API_KEY}`. */
export function cursorEnvPlaceholder(envName = MCP_API_KEY_ENV): string {
  return `\${env:${envName}}`;
}

/** Claude Desktop / mcp-remote header placeholder: `${DAVFLARE_API_KEY}`. */
export function claudeEnvPlaceholder(envName = MCP_API_KEY_ENV): string {
  return `\${${envName}}`;
}

export type McpExportTarget = "cursor" | "claudeDesktop";

export function buildCursorMcpConfig(
  origin: string,
  envName = MCP_API_KEY_ENV
): Record<string, unknown> {
  return {
    mcpServers: {
      davflare: {
        url: mcpEndpoint(origin),
        headers: {
          Authorization: `Bearer ${cursorEnvPlaceholder(envName)}`,
        },
      },
    },
  };
}

/**
 * Claude Desktop `claude_desktop_config.json` is stdio-only.
 * Bridge the remote Streamable HTTP `/mcp` with `mcp-remote` and a Bearer header.
 * Set `DAVFLARE_API_KEY` in the process environment before launching Claude Desktop
 * (do not paste the key into this file).
 */
export function buildClaudeDesktopMcpConfig(
  origin: string,
  envName = MCP_API_KEY_ENV
): Record<string, unknown> {
  return {
    mcpServers: {
      davflare: {
        command: "npx",
        args: [
          "-y",
          "mcp-remote",
          mcpEndpoint(origin),
          "--header",
          `Authorization:Bearer ${claudeEnvPlaceholder(envName)}`,
        ],
      },
    },
  };
}

export function stringifyMcpConfig(config: Record<string, unknown>): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

export function buildCursorMcpJson(origin: string, envName = MCP_API_KEY_ENV): string {
  return stringifyMcpConfig(buildCursorMcpConfig(origin, envName));
}

export function buildClaudeDesktopMcpJson(
  origin: string,
  envName = MCP_API_KEY_ENV
): string {
  return stringifyMcpConfig(buildClaudeDesktopMcpConfig(origin, envName));
}

export function mcpExportFilename(target: McpExportTarget): string {
  return target === "cursor" ? "mcp.json" : "claude_desktop_config.json";
}

/** True if the JSON text embeds a live-looking API key instead of an env placeholder. */
export function mcpConfigContainsRawKey(text: string): boolean {
  // fd_… raw keys, or Bearer followed by a non-placeholder token
  if (/\bfd_[A-Za-z0-9_-]{8,}\b/.test(text)) return true;
  if (/Bearer\s+(?!\$\{)[A-Za-z0-9._-]{12,}/i.test(text)) return true;
  return false;
}

/** Trigger a browser download of a UTF-8 text file. */
export function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
