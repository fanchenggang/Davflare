import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import EmptyState from "../../EmptyState";
import FileActionSheet from "../../FileActionSheet";
import MultiSelectToolbar from "../../MultiSelectToolbar";
import { setLang, strings, translate } from "../strings";
import { FileItem } from "../types";

beforeEach(() => {
  setLang("zh");
});

describe("EmptyState", () => {
  test("渲染标题与描述", () => {
    render(<EmptyState title="这里没有文件" description="上传一个吧" />);
    expect(screen.getByText("这里没有文件")).toBeInTheDocument();
    expect(screen.getByText("上传一个吧")).toBeInTheDocument();
  });

  test("渲染四种 variant 与 actions", () => {
    for (const variant of ["folder", "search", "trash", "shares"] as const) {
      const { unmount } = render(
        <EmptyState title="t" variant={variant} actions={<button>行动</button>} />
      );
      expect(screen.getByText("行动")).toBeInTheDocument();
      unmount();
    }
  });
});

describe("MultiSelectToolbar", () => {
  const props = {
    selectedKeys: [] as string[],
    onClose: jest.fn(),
    onSelectAll: jest.fn(),
    onDownload: jest.fn(),
    onRename: jest.fn(),
    onDelete: jest.fn(),
    onShare: jest.fn(),
    onCopy: jest.fn(),
    onCut: jest.fn(),
    onMove: jest.fn(),
  };

  test("多选时点击按钮触发回调", () => {
    const p = { ...props, selectedKeys: ["a.txt", "b.txt"] };
    render(<MultiSelectToolbar {...p} />);
    fireEvent.click(screen.getByText(strings.copy));
    fireEvent.click(screen.getByText(strings.cut));
    fireEvent.click(screen.getByText(strings.move));
    fireEvent.click(screen.getByText(strings.download));
    fireEvent.click(screen.getByText(strings.delete));
    fireEvent.click(screen.getByText(strings.close));
    fireEvent.click(screen.getByText(translate("itemsSuffix", { count: 2 })));

    expect(p.onCopy).toHaveBeenCalled();
    expect(p.onCut).toHaveBeenCalled();
    expect(p.onMove).toHaveBeenCalled();
    expect(p.onDownload).toHaveBeenCalled();
    expect(p.onDelete).toHaveBeenCalled();
    expect(p.onClose).toHaveBeenCalled();
    expect(p.onSelectAll).toHaveBeenCalled();
  });

  test("单个选中时重命名与分享可用，未选中时禁用", () => {
    const { rerender } = render(<MultiSelectToolbar {...props} selectedKeys={[]} />);
    expect(screen.getByText(strings.rename).closest("button")).toBeDisabled();
    expect(screen.getByText(strings.share).closest("button")).toBeDisabled();

    rerender(<MultiSelectToolbar {...props} selectedKeys={["a.txt"]} />);
    expect(screen.getByText(strings.rename).closest("button")).not.toBeDisabled();
    expect(screen.getByText(strings.share).closest("button")).not.toBeDisabled();
  });
});

describe("FileActionSheet", () => {
  const file: FileItem = {
    key: "a.txt",
    name: "a.txt",
    isDir: false,
    size: 1,
    uploaded: "",
    contentType: "text/plain",
  };

  test("桌面端点击菜单项触发 onAction", async () => {
    const onAction = jest.fn();
    const onClose = jest.fn();
    render(
      <FileActionSheet
        file={file}
        anchorPosition={{ top: 10, left: 20 }}
        onClose={onClose}
        onAction={onAction}
      />
    );
    fireEvent.click(screen.getByText(strings.download));
    expect(onClose).toHaveBeenCalled();
    await waitFor(() => expect(onAction).toHaveBeenCalledWith("download", file));
  });

  test("目录也渲染全部动作（当前无 filesOnly 动作）", () => {
    render(
      <FileActionSheet
        file={{ ...file, isDir: true, key: "d/", name: "d" }}
        anchorPosition={{ top: 10, left: 20 }}
        onClose={jest.fn()}
        onAction={jest.fn()}
      />
    );
    expect(screen.getByText(strings.download)).toBeInTheDocument();
    expect(screen.getByText(strings.open)).toBeInTheDocument();
  });

  test("file 为 null 时不渲染菜单项", () => {
    render(
      <FileActionSheet file={null} anchorPosition={null} onClose={jest.fn()} onAction={jest.fn()} />
    );
    expect(screen.queryByText(strings.download)).not.toBeInTheDocument();
  });
});
