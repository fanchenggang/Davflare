import { vi, type Mock } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import McpPlaygroundView from "../../McpPlaygroundView";
import * as mcp from "../mcpPlayground";
import { setLang, strings } from "../strings";

vi.mock("../mcpPlayground", async () => {
  const actual = await vi.importActual<typeof import("../mcpPlayground")>(
    "../mcpPlayground"
  );
  return {
    ...actual,
    mcpToolsList: vi.fn(),
    mcpTryListRoot: vi.fn(),
    loadStoredApiKey: vi.fn(() => ""),
    storeApiKey: vi.fn(),
  };
});

const mockList = mcp.mcpToolsList as unknown as Mock;
const mockTry = mcp.mcpTryListRoot as unknown as Mock;

describe("McpPlaygroundView", () => {
  beforeEach(() => {
    setLang("en");
    mockList.mockReset();
    mockTry.mockReset();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  test("lists tools, tries root list, then copies mcp.json", async () => {
    mockList.mockResolvedValue([
      { name: "list", description: "List" },
      { name: "upload" },
    ]);
    mockTry.mockResolvedValue({
      isError: false,
      text: '{"items":[]}',
      raw: { content: [{ type: "text", text: '{"items":[]}' }] },
    });

    const onNotify = vi.fn();
    render(<McpPlaygroundView onNotify={onNotify} />);

    fireEvent.change(screen.getByLabelText(strings.mcpPlayKeyLabel), {
      target: { value: "fd_test_key" },
    });

    fireEvent.click(screen.getByRole("button", { name: strings.mcpPlayListAction }));
    await waitFor(() => expect(mockList).toHaveBeenCalledWith("fd_test_key"));
    expect(await screen.findByText("list")).toBeInTheDocument();
    expect(screen.getByText("upload")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: strings.mcpPlayTryAction }));
    await waitFor(() => expect(mockTry).toHaveBeenCalledWith("fd_test_key"));
    expect(await screen.findByText('{"items":[]}')).toBeInTheDocument();

    const copyBtn = await screen.findByRole("button", {
      name: strings.setupCopyMcp,
    });
    fireEvent.click(copyBtn);
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalled()
    );
    const copied = (navigator.clipboard.writeText as Mock).mock.calls[0][0];
    expect(copied).toContain("fd_test_key");
    expect(copied).toContain("/mcp");
  });

  test("keeps copy locked until both checks are green", async () => {
    mockList.mockResolvedValue([{ name: "list" }]);
    const onNotify = vi.fn();
    render(<McpPlaygroundView onNotify={onNotify} />);

    fireEvent.change(screen.getByLabelText(strings.mcpPlayKeyLabel), {
      target: { value: "fd_x" },
    });
    fireEvent.click(screen.getByRole("button", { name: strings.mcpPlayListAction }));
    await waitFor(() => expect(mockList).toHaveBeenCalled());

    expect(screen.queryByRole("button", { name: strings.setupCopyMcp })).toBeNull();
    expect(screen.getByText(strings.mcpPlayNotReady)).toBeInTheDocument();
  });
});
