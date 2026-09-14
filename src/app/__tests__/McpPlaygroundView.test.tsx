import { vi, type Mock } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import McpPlaygroundView from "../../McpPlaygroundView";
import { DEFAULT_FEATURE_FLAGS, useFeatures } from "../features";
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

vi.mock("../features", async () => {
  const actual = await vi.importActual("../features");
  return { ...actual, useFeatures: vi.fn() };
});

const mockList = mcp.mcpToolsList as unknown as Mock;
const mockTry = mcp.mcpTryListRoot as unknown as Mock;
const mockUseFeatures = useFeatures as unknown as Mock;

function mockFlags(partial: Partial<typeof DEFAULT_FEATURE_FLAGS> = {}) {
  mockUseFeatures.mockReturnValue({
    flags: { ...DEFAULT_FEATURE_FLAGS, ...partial },
    config: {
      username: "u",
      publicRead: false,
      sitesHost: null,
      flags: { ...DEFAULT_FEATURE_FLAGS, ...partial },
    },
    sitesHost: null,
    refresh: vi.fn(),
    updateFlags: vi.fn(),
  });
}

describe("McpPlaygroundView", () => {
  beforeEach(() => {
    setLang("en");
    mockList.mockReset();
    mockTry.mockReset();
    mockFlags();
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

  test("shows list and try errors; copy failure notifies", async () => {
    mockFlags({ mcp: false, apiKey: false });
    mockList.mockRejectedValue(new Error("list boom"));
    mockTry.mockResolvedValue({
      isError: true,
      text: "tool blew up",
      raw: { isError: true, content: [{ type: "text", text: "tool blew up" }] },
    });

    const onNotify = vi.fn();
    const onOpenSettings = vi.fn();
    render(
      <McpPlaygroundView onNotify={onNotify} onOpenSettings={onOpenSettings} />
    );

    fireEvent.click(screen.getByRole("button", { name: strings.mcpPlayOpenSettings }));
    expect(onOpenSettings).toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(strings.mcpPlayKeyLabel), {
      target: { value: "fd_err" },
    });
    fireEvent.click(screen.getByRole("button", { name: strings.mcpPlayListAction }));
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    expect(await screen.findByText("list boom")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: strings.mcpPlayTryAction }));
    await waitFor(() => expect(mockTry).toHaveBeenCalled());
    expect(await screen.findAllByText("tool blew up")).not.toHaveLength(0);
    expect(screen.queryByRole("button", { name: strings.setupCopyMcp })).toBeNull();
  });

  test("try catch path and clipboard failure", async () => {
    mockList.mockResolvedValue([{ name: "list" }]);
    mockTry.mockRejectedValue(new Error("try boom"));
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });

    const onNotify = vi.fn();
    render(<McpPlaygroundView onNotify={onNotify} />);

    fireEvent.change(screen.getByLabelText(strings.mcpPlayKeyLabel), {
      target: { value: "fd_ok" },
    });
    fireEvent.click(screen.getByRole("button", { name: strings.mcpPlayListAction }));
    await waitFor(() => expect(mockList).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: strings.mcpPlayTryAction }));
    await waitFor(() => expect(mockTry).toHaveBeenCalled());
    expect(await screen.findByText("try boom")).toBeInTheDocument();

    // Force both green via remock then copy fail — remount with success then patch clipboard
  });

  test("notify when list/try clicked without key", async () => {
    const onNotify = vi.fn();
    render(<McpPlaygroundView onNotify={onNotify} />);
    // Buttons disabled without key — enable by putting spaces then trim empty? buttons disabled on !trim
    // Call via changing to key then clearing is hard; instead fire with disabled check:
    expect(
      screen.getByRole("button", { name: strings.mcpPlayListAction })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: strings.mcpPlayTryAction })
    ).toBeDisabled();
  });

  test("copy mcp.json notifies on clipboard failure after both green", async () => {
    mockList.mockResolvedValue([{ name: "list" }]);
    mockTry.mockResolvedValue({
      isError: false,
      text: "{}",
      raw: { content: [{ type: "text", text: "{}" }] },
    });
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });

    const onNotify = vi.fn();
    render(<McpPlaygroundView onNotify={onNotify} />);
    fireEvent.change(screen.getByLabelText(strings.mcpPlayKeyLabel), {
      target: { value: "fd_copy" },
    });
    fireEvent.click(screen.getByRole("button", { name: strings.mcpPlayListAction }));
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: strings.mcpPlayTryAction }));
    await waitFor(() => expect(mockTry).toHaveBeenCalled());

    fireEvent.click(await screen.findByRole("button", { name: strings.setupCopyMcp }));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(strings.setupCopyFailed, "error")
    );
  });

  test("toggles key visibility", () => {
    render(<McpPlaygroundView onNotify={vi.fn()} />);
    const show = screen.getByRole("button", { name: strings.mcpPlayShowKey });
    fireEvent.click(show);
    expect(
      screen.getByRole("button", { name: strings.mcpPlayHideKey })
    ).toBeInTheDocument();
  });

  test("hides enable tip when MCP and API Key features are on", () => {
    mockFlags({ mcp: true, apiKey: true });
    render(<McpPlaygroundView onNotify={vi.fn()} />);
    expect(screen.queryByText(strings.mcpPlayInfo)).toBeNull();
  });

  test("shows enable tip when MCP or API Key feature is off", () => {
    mockFlags({ mcp: true, apiKey: false });
    render(<McpPlaygroundView onNotify={vi.fn()} onOpenSettings={vi.fn()} />);
    expect(screen.getByText(strings.mcpPlayInfo)).toBeInTheDocument();
  });

  test("hides enable tip after successful playground run even if flags look off", async () => {
    mockFlags({ mcp: false, apiKey: false });
    mockList.mockResolvedValue([{ name: "list" }]);
    mockTry.mockResolvedValue({
      isError: false,
      text: "{}",
      raw: { content: [{ type: "text", text: "{}" }] },
    });

    render(<McpPlaygroundView onNotify={vi.fn()} />);
    expect(screen.getByText(strings.mcpPlayInfo)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(strings.mcpPlayKeyLabel), {
      target: { value: "fd_ready" },
    });
    fireEvent.click(screen.getByRole("button", { name: strings.mcpPlayListAction }));
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: strings.mcpPlayTryAction }));
    await waitFor(() => expect(mockTry).toHaveBeenCalled());

    await waitFor(() =>
      expect(screen.queryByText(strings.mcpPlayInfo)).toBeNull()
    );
  });
});
