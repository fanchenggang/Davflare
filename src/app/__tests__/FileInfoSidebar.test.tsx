import { vi, type Mock } from "vitest";
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

import FileInfoSidebar from "../../FileInfoSidebar";
import { downloadArchive, downloadFile } from "../transfer";
import { setLang, strings, translate } from "../strings";
import { FileItem } from "../types";

vi.mock("../transfer", () => ({
  downloadFile: vi.fn(),
  downloadArchive: vi.fn(),
}));

vi.mock("../../AuthThumbnail", () => ({
  __esModule: true,
  default: () => <span data-testid="auth-thumb" />,
}));

const mockDownload = downloadFile as unknown as Mock;
const mockArchive = downloadArchive as unknown as Mock;

const file: FileItem = {
  key: "docs/pic file.png",
  name: "pic file.png",
  isDir: false,
  size: 2048,
  uploaded: "2026-01-01T00:00:00.000Z",
  contentType: "image/png",
};

const folder: FileItem = {
  key: "docs",
  name: "docs",
  isDir: true,
  size: 0,
  uploaded: "2026-01-02T00:00:00.000Z",
  contentType: "application/x-directory",
};

function renderSidebar(
  fileArg: FileItem | null = file,
  overrides: Partial<React.ComponentProps<typeof FileInfoSidebar>> = {}
) {
  const props = {
    open: true,
    file: fileArg,
    onClose: vi.fn(),
    onShare: vi.fn(),
    onRename: vi.fn(),
    onMove: vi.fn(),
    onDelete: vi.fn(),
    onNotify: vi.fn(),
    ...overrides,
  };
  const result = render(
    <ThemeProvider theme={createTheme()}>
      <FileInfoSidebar {...props} />
    </ThemeProvider>
  );
  return { ...result, props };
}

beforeAll(() => {
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

beforeEach(() => {
  setLang("zh");
  mockDownload.mockReset();
  mockDownload.mockResolvedValue(undefined);
  mockArchive.mockReset();
  mockArchive.mockResolvedValue(undefined);
  (navigator.clipboard.writeText as Mock).mockClear();
});

describe("FileInfoSidebar", () => {
  test("file 为 null 时不渲染内容", () => {
    const { container } = renderSidebar(null);
    expect(container).toBeEmptyDOMElement();
  });

  test("渲染名称/类型/大小/路径等元数据", () => {
    renderSidebar();
    expect(screen.getByText(strings.detailsTitle)).toBeInTheDocument();
    expect(screen.getByText(file.name)).toBeInTheDocument();
    expect(screen.getByText(strings.kindImage)).toBeInTheDocument();
    expect(screen.getByText("2.0 KB")).toBeInTheDocument();
    // 完整路径等宽展示
    expect(screen.getByText(file.key)).toBeInTheDocument();
    expect(screen.getByText(strings.detailsUploaded)).toBeInTheDocument();
  });

  test("图片文件带 digest 时用 AuthThumbnail 大图", () => {
    renderSidebar({ ...file, thumbnail: "digest" });
    expect(screen.getByTestId("auth-thumb")).toBeInTheDocument();
  });

  test("目录大小显示为 —，下载走打包下载", async () => {
    const { props } = renderSidebar(folder);
    expect(screen.getByText("—")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(strings.download));
    await waitFor(() => expect(mockArchive).toHaveBeenCalledWith([folder.key]));
    expect(mockDownload).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  test("复制路径写入剪贴板并通知", async () => {
    const { props } = renderSidebar();
    fireEvent.click(screen.getByLabelText(strings.detailsCopyPath));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(file.key)
    );
    await waitFor(() =>
      expect(props.onNotify).toHaveBeenCalledWith(translate("pathCopied"), "success")
    );
  });

  test("复制 WebDAV 直链按 encodeKey 转义路径", async () => {
    const { props } = renderSidebar();
    fireEvent.click(screen.getByLabelText(strings.detailsCopyLink));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "http://localhost/webdav/docs/pic%20file.png"
      )
    );
    await waitFor(() =>
      expect(props.onNotify).toHaveBeenCalledWith(translate("linkCopied"), "success")
    );
  });

  test("分享/重命名/移动/删除回调携带文件", () => {
    const { props } = renderSidebar();
    fireEvent.click(screen.getByLabelText(strings.share));
    fireEvent.click(screen.getByLabelText(strings.rename));
    fireEvent.click(screen.getByLabelText(strings.move));
    fireEvent.click(screen.getByLabelText(strings.delete));
    expect(props.onShare).toHaveBeenCalledWith(file);
    expect(props.onRename).toHaveBeenCalledWith(file);
    expect(props.onMove).toHaveBeenCalledWith(file);
    expect(props.onDelete).toHaveBeenCalledWith(file);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  test("文件下载走 downloadFile", () => {
    renderSidebar();
    fireEvent.click(screen.getByLabelText(strings.download));
    expect(mockDownload).toHaveBeenCalledWith(file.key);
  });
});
