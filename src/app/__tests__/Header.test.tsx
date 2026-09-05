import { vi, type Mock } from "vitest";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import Header from "../../Header";
import { useTransferQueue } from "../transferQueue";
import { getLang, setLang, strings } from "../strings";

vi.mock("../transferQueue", () => ({
  useTransferQueue: vi.fn(),
}));

const mockUseTransferQueue = useTransferQueue as unknown as Mock;

function renderHeader(props: Partial<React.ComponentProps<typeof Header>> = {}) {
  const defaults = {
    search: "",
    onSearchChange: vi.fn(),
    username: null as string | null,
    onLogout: vi.fn(),
    onOpenTransfers: vi.fn(),
    onOpenApi: vi.fn(),
    onOpenSettings: vi.fn(),
    themeMode: "system" as const,
    onThemeModeChange: vi.fn(),
  };
  return render(<Header {...defaults} {...props} />);
}

beforeEach(() => {
  setLang("zh");
  mockUseTransferQueue.mockReset();
  mockUseTransferQueue.mockReturnValue([]);
});

describe("Header", () => {
  test("搜索输入与清除按钮", () => {
    const onSearchChange = vi.fn();
    renderHeader({ search: "abc", onSearchChange });

    fireEvent.change(screen.getByLabelText(strings.searchShortcutHint), {
      target: { value: "xyz" },
    });
    expect(onSearchChange).toHaveBeenCalledWith("xyz");

    fireEvent.click(screen.getByLabelText(strings.clearSearch));
    expect(onSearchChange).toHaveBeenCalledWith("");
  });

  test("Escape 清空搜索", () => {
    const onSearchChange = vi.fn();
    renderHeader({ search: "abc", onSearchChange });
    fireEvent.keyDown(screen.getByLabelText(strings.searchShortcutHint), {
      key: "Escape",
    });
    expect(onSearchChange).toHaveBeenCalledWith("");
  });

  test("点击传输按钮", () => {
    const onOpenTransfers = vi.fn();
    mockUseTransferQueue.mockReturnValue([
      { id: "t1", type: "upload", status: "in-progress", name: "a", basedir: "", remoteKey: "a", loaded: 1, total: 2 },
    ]);
    renderHeader({ onOpenTransfers });
    fireEvent.click(screen.getByLabelText(strings.transfers));
    expect(onOpenTransfers).toHaveBeenCalled();
  });

  test("语言菜单切换为英文", () => {
    renderHeader();
    fireEvent.click(screen.getByLabelText(strings.language));
    fireEvent.click(screen.getByText(strings.langEn));
    expect(getLang()).toBe("en");
  });

  test("主题菜单切换为暗色", () => {
    const onThemeModeChange = vi.fn();
    renderHeader({ onThemeModeChange });
    fireEvent.click(screen.getByLabelText(strings.theme));
    fireEvent.click(screen.getByText(strings.themeDark));
    expect(onThemeModeChange).toHaveBeenCalledWith("dark");
  });

  test("账号菜单：打开 API 与退出登录", () => {
    const onOpenApi = vi.fn();
    const onLogout = vi.fn();
    renderHeader({ username: "alice", onOpenApi, onLogout });
    fireEvent.click(screen.getByLabelText(strings.account));
    fireEvent.click(screen.getByText(strings.apiKeys));
    expect(onOpenApi).toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText(strings.account));
    fireEvent.click(screen.getByText(strings.logout));
    expect(onLogout).toHaveBeenCalled();
  });

  test("账号菜单：打开设置", () => {
    const onOpenSettings = vi.fn();
    renderHeader({ username: "alice", onOpenSettings });
    fireEvent.click(screen.getByLabelText(strings.account));
    fireEvent.click(screen.getByText(strings.settings));
    expect(onOpenSettings).toHaveBeenCalled();
  });

  test("elevated header applies blurred background style", () => {
    renderHeader({ elevated: true });
    expect(screen.getByLabelText(strings.searchShortcutHint)).toBeInTheDocument();
  });
});
