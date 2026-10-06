import { vi } from "vitest";
import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

import FileGrid from "../../FileGrid";
import { translate } from "../strings";
import { FileItem } from "../types";

vi.mock("../../AuthThumbnail", () => ({
  __esModule: true,
  default: () => <span data-testid="auth-thumb" />,
  LazyThumbnail: () => <span data-testid="lazy-thumb" />,
}));

vi.mock("../../MimeIcon", () => ({
  __esModule: true,
  default: () => <span data-testid="mime-icon" />,
}));

const file: FileItem = {
  key: "notes.txt",
  name: "notes.txt",
  isDir: false,
  size: 128,
  uploaded: "2026-01-01T00:00:00.000Z",
  contentType: "text/plain",
};

const folder: FileItem = {
  key: "docs/",
  name: "docs",
  isDir: true,
  size: 0,
  uploaded: "2026-01-02T00:00:00.000Z",
  contentType: "application/octet-stream",
};

function renderList(
  overrides: Partial<React.ComponentProps<typeof FileGrid>> = {}
) {
  const props = {
    files: [file, folder],
    view: "list" as const,
    selectedKeys: [] as string[],
    onToggleSelect: vi.fn(),
    onNavigate: vi.fn(),
    onOpen: vi.fn(),
    onOpenMenu: vi.fn(),
    ...overrides,
  };
  const result = render(
    <ThemeProvider theme={createTheme()}>
      <FileGrid {...props} />
    </ThemeProvider>
  );
  return { ...result, props };
}

describe("FileGrid list row", () => {
  test("⋯ 菜单点击只打开操作菜单，不触发预览或进入目录", () => {
    const { props } = renderList();
    const more = screen.getByRole("button", {
      name: translate("fileActionsLabel", { name: file.name }),
    });
    fireEvent.click(more);
    expect(props.onOpenMenu).toHaveBeenCalledTimes(1);
    expect(props.onOpenMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        clientX: expect.any(Number),
        clientY: expect.any(Number),
      }),
      file
    );
    expect(props.onOpen).not.toHaveBeenCalled();
    expect(props.onNavigate).not.toHaveBeenCalled();
  });

  test("点击文件夹名称进入目录", () => {
    const { props } = renderList();
    fireEvent.click(screen.getByText(folder.name));
    expect(props.onNavigate).toHaveBeenCalledWith(folder.key);
    expect(props.onOpen).not.toHaveBeenCalled();
  });

  test("点击文件名称打开预览", () => {
    const { props } = renderList();
    fireEvent.click(screen.getByText(file.name));
    expect(props.onOpen).toHaveBeenCalledWith(file.key);
    expect(props.onNavigate).not.toHaveBeenCalled();
  });

  test("⋯ 菜单按 Enter 不触发预览或进入目录", () => {
    const { props } = renderList();
    const more = screen.getByRole("button", {
      name: translate("fileActionsLabel", { name: file.name }),
    });
    more.focus();
    fireEvent.keyDown(more, { key: "Enter" });
    expect(props.onOpen).not.toHaveBeenCalled();
    expect(props.onNavigate).not.toHaveBeenCalled();
  });
});

describe("FileGrid ARIA", () => {
  test("grid: role=grid > row > gridcell，卡片带 aria-selected 与 roving tabindex", () => {
    renderList({ view: "grid", selectedKeys: [file.key], focusedKey: folder.key });
    expect(screen.getByRole("grid")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(2);

    const cells = screen.getAllByRole("gridcell");
    expect(cells).toHaveLength(2);
    expect(cells[0]).toHaveAttribute("aria-selected", "true");
    expect(cells[1]).toHaveAttribute("aria-selected", "false");
    // 焦点在 folder（活动项）上：它 tabIndex=0，其余 -1
    expect(cells[1]).toHaveAttribute("tabindex", "0");
    expect(cells[0]).toHaveAttribute("tabindex", "-1");
  });

  test("grid: 无焦点项时首卡片持有 tabIndex=0", () => {
    renderList({ view: "grid" });
    const cells = screen.getAllByRole("gridcell");
    expect(cells[0]).toHaveAttribute("tabindex", "0");
    expect(cells[1]).toHaveAttribute("tabindex", "-1");
  });

  test("list: role=listbox > option，行带 aria-selected", () => {
    renderList({ view: "list", selectedKeys: [file.key] });
    const listbox = screen.getByRole("listbox");
    const options = within(listbox).getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[1]).toHaveAttribute("aria-selected", "false");
    // 无焦点项时首行持有 tabIndex=0（roving）
    expect(options[0]).toHaveAttribute("tabindex", "0");
    expect(options[1]).toHaveAttribute("tabindex", "-1");
  });
});

describe("FileGrid thumbnails (#149)", () => {
  const image = (patch: Partial<FileItem>): FileItem => ({
    key: "vault/附件/a.png",
    name: "a.png",
    isDir: false,
    size: 200 * 1024,
    uploaded: "2026-10-06T00:00:00.000Z",
    contentType: "image/png",
    ...patch,
  });

  test.each(["grid", "list"] as const)("%s: pre-generated → AuthThumbnail, small image → lazy, others → icon", (view) => {
    renderList({
      view,
      files: [
        image({ key: "a.png", thumbnail: "digest" }),
        image({ key: "b.png", name: "b.png" }),
        image({ key: "c.png", name: "c.png", size: 50 * 1024 * 1024 }),
        image({ key: "d.svg", name: "d.svg", contentType: "image/svg+xml" }),
        file,
      ],
    });
    expect(screen.getAllByTestId("auth-thumb")).toHaveLength(1);
    expect(screen.getAllByTestId("lazy-thumb")).toHaveLength(1);
    // 大图、svg、文本 + 列表里的其它图标
    expect(screen.getAllByTestId("mime-icon").length).toBeGreaterThanOrEqual(3);
  });
});
