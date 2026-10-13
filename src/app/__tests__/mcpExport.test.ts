import { afterEach, describe, expect, test, vi } from "vitest";

import {
  buildClaudeDesktopMcpConfig,
  buildClaudeDesktopMcpJson,
  buildCursorMcpConfig,
  buildCursorMcpJson,
  downloadTextFile,
  MCP_API_KEY_ENV,
  mcpConfigContainsRawKey,
  mcpExportFilename,
} from "../mcpExport";

describe("mcpExport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("Cursor config uses url + ${env:DAVFLARE_API_KEY}, never a live key", () => {
    const config = buildCursorMcpConfig("https://drive.example.com/");
    expect(config).toEqual({
      mcpServers: {
        davflare: {
          url: "https://drive.example.com/mcp",
          headers: {
            Authorization: `Bearer \${env:${MCP_API_KEY_ENV}}`,
          },
        },
      },
    });
    const json = buildCursorMcpJson("https://drive.example.com");
    expect(json).toContain(`\${env:${MCP_API_KEY_ENV}}`);
    expect(mcpConfigContainsRawKey(json)).toBe(false);
    expect(json).not.toMatch(/\bfd_/);
  });

  test("Claude Desktop config bridges via mcp-remote with env placeholder", () => {
    const config = buildClaudeDesktopMcpConfig("https://drive.example.com");
    expect(config).toEqual({
      mcpServers: {
        davflare: {
          command: "npx",
          args: [
            "-y",
            "mcp-remote",
            "https://drive.example.com/mcp",
            "--header",
            `Authorization:Bearer \${${MCP_API_KEY_ENV}}`,
          ],
        },
      },
    });
    const json = buildClaudeDesktopMcpJson("https://drive.example.com/");
    expect(json).toContain("mcp-remote");
    expect(json).toContain(`\${${MCP_API_KEY_ENV}}`);
    expect(mcpConfigContainsRawKey(json)).toBe(false);
  });

  test("export filenames", () => {
    expect(mcpExportFilename("cursor")).toBe("mcp.json");
    expect(mcpExportFilename("claudeDesktop")).toBe("claude_desktop_config.json");
  });

  test("mcpConfigContainsRawKey detects fd_ and bare Bearer tokens", () => {
    expect(mcpConfigContainsRawKey("Bearer ${env:DAVFLARE_API_KEY}")).toBe(false);
    expect(mcpConfigContainsRawKey("Bearer fd_abcdefghijklmnop")).toBe(true);
    expect(
      mcpConfigContainsRawKey(
        JSON.stringify({ Authorization: "Bearer sk_live_abcdefghijk" })
      )
    ).toBe(true);
  });

  test("downloadTextFile creates an object URL and clicks a download anchor", () => {
    const createObjectURL = vi.fn(() => "blob:mcp");
    const revokeObjectURL = vi.fn();
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = createObjectURL as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as typeof URL.revokeObjectURL;

    const click = vi.fn();
    const createElement = vi
      .spyOn(document, "createElement")
      .mockImplementation((tag: string) => {
        if (tag === "a") {
          return {
            href: "",
            download: "",
            rel: "",
            click,
          } as unknown as HTMLAnchorElement;
        }
        return document.createElementNS("http://www.w3.org/1999/xhtml", tag);
      });

    try {
      downloadTextFile("mcp.json", '{"ok":true}\n');
      expect(createObjectURL).toHaveBeenCalled();
      expect(click).toHaveBeenCalled();
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:mcp");
      const anchor = createElement.mock.results[0].value as HTMLAnchorElement;
      expect(anchor.download).toBe("mcp.json");
      expect(anchor.href).toBe("blob:mcp");
    } finally {
      createElement.mockRestore();
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });
});
