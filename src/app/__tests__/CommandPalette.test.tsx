import { vi, type Mock } from "vitest";
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

import CommandPalette from "../../CommandPalette";
import { openFile, searchFiles } from "../transfer";
import { setLang, strings } from "../strings";
import { FileItem } from "../types";

vi.mock("../transfer", () => ({
  searchFiles: vi.fn(),
  openFile: vi.fn(),
}));

const mockSearch = searchFiles as unknown as Mock;
const mockOpen = openFile as unknown as Mock;

const file: FileItem = {
  key: "docs/readme.md",
  name: "readme.md",
  isDir: false,
  size: 12,
  uploaded: "2026-01-01T00:00:00.000Z",
  contentType: "text/markdown",
};

const folder: FileItem = {
  key: "docs",
  name: "docs",
  isDir: true,
  size: 0,
  uploaded: "2026-01-02T00:00:00.000Z",
  contentType: "application/x-directory",
};

function renderPalette(overrides: Partial<React.ComponentProps<typeof CommandPalette>> = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    onNavigate: vi.fn(),
    onNotify: vi.fn(),
    onOpenTransfers: vi.fn(),
    onThemeToggle: vi.fn(),
    ...overrides,
  };
  const result = render(
    <ThemeProvider theme={createTheme()}>
      <CommandPalette {...props} />
    </ThemeProvider>
  );
  return { ...result, props };
}

// Dialog 内容经 portal 挂在 document.body，查询要避开 RTL 的 container
function queryIndex(index: number) {
  return document.body.querySelector(`[data-index="${index}"]`) as HTMLElement | null;
}

beforeEach(() => {
  setLang("zh");
  mockSearch.mockReset();
  // 组件会对 openFile 结果 .catch，mock 必须返回 promise
  mockOpen.mockReset();
  mockOpen.mockResolvedValue(undefined);
});

beforeAll(() => {
  // jsdom 未实现 scrollIntoView（选中项滚动跟随会调用）
  Element.prototype.scrollIntoView = vi.fn();
});

describe("CommandPalette", () => {
  test("打开后渲染输入框与命令列表", () => {
    const { props } = renderPalette();
    expect(
      screen.getByLabelText(strings.commandPalettePlaceholder)
    ).toBeInTheDocument();
    expect(screen.getByText(strings.commandToggleTheme)).toBeInTheDocument();
    expect(screen.getByText(strings.commandGotoShares)).toBeInTheDocument();
    expect(props.onNavigate).not.toHaveBeenCalled();
  });

  test("输入关键词 300ms 防抖后调用 searchFiles 并渲染文件结果", async () => {
    vi.useFakeTimers();
    mockSearch.mockResolvedValue({ items: [file], hasMore: false });
    renderPalette();
    const input = screen.getByLabelText(
      strings.commandPalettePlaceholder
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "read" } });
    expect(mockSearch).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(320);
    });
    expect(mockSearch).toHaveBeenCalledWith("read");
    await act(async () => {});
    expect(screen.getByText("readme.md")).toBeInTheDocument();
    expect(queryIndex(0)).toHaveClass("Mui-selected");
    vi.useRealTimers();
  });

  test("Enter 打开文件结果：openFile 被调且面板关闭", async () => {
    vi.useFakeTimers();
    mockSearch.mockResolvedValue({ items: [file], hasMore: false });
    const { props } = renderPalette();
    const input = screen.getByLabelText(strings.commandPalettePlaceholder);
    fireEvent.change(input, { target: { value: "read" } });
    await act(async () => {
      vi.advanceTimersByTime(320);
    });
    await act(async () => {});
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockOpen).toHaveBeenCalledWith(file.key);
    expect(props.onClose).toHaveBeenCalled();
    vi.useRealTimers();
  });

  test("Enter 打开目录结果：onNavigate 被调", async () => {
    vi.useFakeTimers();
    mockSearch.mockResolvedValue({ items: [folder], hasMore: false });
    const { props } = renderPalette();
    const input = screen.getByLabelText(strings.commandPalettePlaceholder);
    fireEvent.change(input, { target: { value: "docs" } });
    await act(async () => {
      vi.advanceTimersByTime(320);
    });
    await act(async () => {});
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockOpen).not.toHaveBeenCalled();
    expect(props.onNavigate).toHaveBeenCalledWith({ kind: "folder", path: folder.key });
    vi.useRealTimers();
  });

  test("ArrowDown/ArrowUp 在结果与命令间移动选中项", async () => {
    vi.useFakeTimers();
    mockSearch.mockResolvedValue({ items: [file], hasMore: false });
    renderPalette();
    const input = screen.getByLabelText(strings.commandPalettePlaceholder);
    // 关键词同时命中文件结果与「切换亮/暗主题」命令，两类条目才会在列表里共存
    fireEvent.change(input, { target: { value: "切换" } });
    await act(async () => {
      vi.advanceTimersByTime(320);
    });
    await act(async () => {});

    // 初始选中第 0 项（文件），ArrowDown 移到第 1 项（命令区）
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(queryIndex(0)).not.toHaveClass("Mui-selected");
    expect(queryIndex(1)).toHaveClass("Mui-selected");

    // ArrowUp 回到第 0 项
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(queryIndex(0)).toHaveClass("Mui-selected");
    expect(queryIndex(1)).not.toHaveClass("Mui-selected");
    vi.useRealTimers();
  });

  test("点击命令执行对应回调", () => {
    const { props } = renderPalette();
    fireEvent.click(screen.getByText(strings.commandToggleTheme));
    expect(props.onThemeToggle).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalled();

    fireEvent.click(screen.getByText(strings.commandGotoShares));
    expect(props.onNavigate).toHaveBeenCalledWith({ kind: "shares" });
  });

  test("Esc 关闭面板", () => {
    const { props } = renderPalette();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(props.onClose).toHaveBeenCalled();
  });

  test("空结果显示占位文案", async () => {
    mockSearch.mockResolvedValue({ items: [], hasMore: false });
    renderPalette();
    const input = screen.getByLabelText(strings.commandPalettePlaceholder);
    fireEvent.change(input, { target: { value: "zzz" } });
    await waitFor(() => expect(mockSearch).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByText(strings.commandNoResults)).toBeInTheDocument()
    );
  });
});
