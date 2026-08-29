import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

import FileGrid from "../../FileGrid";
import { translate } from "../strings";
import { FileItem } from "../types";

jest.mock("../../AuthThumbnail", () => ({
  __esModule: true,
  default: () => <span data-testid="auth-thumb" />,
}));

jest.mock("../../MimeIcon", () => ({
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
    onToggleSelect: jest.fn(),
    onNavigate: jest.fn(),
    onOpen: jest.fn(),
    onOpenMenu: jest.fn(),
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
