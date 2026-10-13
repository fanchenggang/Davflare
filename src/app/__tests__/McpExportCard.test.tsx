import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import McpExportCard from "../../McpExportCard";
import { MCP_API_KEY_ENV } from "../mcpExport";
import { setLang, strings } from "../strings";

describe("McpExportCard", () => {
  beforeEach(() => {
    setLang("en");
    vi.restoreAllMocks();
  });

  test("renders Cursor and Claude previews with env placeholders", () => {
    render(
      <McpExportCard origin="https://drive.example.com" onNotify={vi.fn()} />
    );
    expect(screen.getByTestId("mcp-export-card")).toBeInTheDocument();
    expect(screen.getByText(strings.mcpExportTitle)).toBeInTheDocument();

    const cursor = screen.getByTestId("mcp-export-cursor-preview").textContent || "";
    expect(cursor).toContain("https://drive.example.com/mcp");
    expect(cursor).toContain(`\${env:${MCP_API_KEY_ENV}}`);
    expect(cursor).not.toMatch(/\bfd_/);

    const claude = screen.getByTestId("mcp-export-claude-preview").textContent || "";
    expect(claude).toContain("mcp-remote");
    expect(claude).toContain(`\${${MCP_API_KEY_ENV}}`);
    expect(claude).not.toMatch(/\bfd_/);
  });

  test("copy Cursor config writes clipboard and notifies", async () => {
    const onNotify = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <McpExportCard origin="https://drive.example.com" onNotify={onNotify} />
    );
    fireEvent.click(screen.getByRole("button", { name: strings.mcpExportCopyCursor }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalled();
    });
    const pasted = writeText.mock.calls[0][0] as string;
    expect(pasted).toContain(`\${env:${MCP_API_KEY_ENV}}`);
    expect(onNotify).toHaveBeenCalledWith(strings.mcpExportCursorCopied, "success");
  });
});
