import { vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import ConfirmDialog from "../../ConfirmDialog";
import CreateFolderDialog from "../../CreateFolderDialog";
import RenameDialog from "../../RenameDialog";
import { setLang, strings, translate } from "../strings";

beforeEach(() => {
  setLang("zh");
});

describe("ConfirmDialog", () => {
  test("渲染标题与内容并触发回调", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        title="删除确认"
        message="确定删除吗？"
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );
    expect(screen.getByText("删除确认")).toBeInTheDocument();
    expect(screen.getByText("确定删除吗？")).toBeInTheDocument();
    fireEvent.click(screen.getByText(strings.cancel));
    expect(onClose).toHaveBeenCalled();
    fireEvent.click(screen.getByText(strings.ok));
    expect(onConfirm).toHaveBeenCalled();
  });
});

describe("CreateFolderDialog", () => {
  test("输入合法名称提交", () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(<CreateFolderDialog open onClose={onClose} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(strings.folderName), {
      target: { value: "  docs  " },
    });
    fireEvent.click(screen.getByText(strings.create));
    expect(onSubmit).toHaveBeenCalledWith("docs");
  });

  test("空名称与斜杠显示错误", () => {
    render(<CreateFolderDialog open onClose={vi.fn()} onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByText(strings.create));
    expect(screen.getByText(translate("folderNameEmpty"))).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(strings.folderName), {
      target: { value: "a/b" },
    });
    fireEvent.click(screen.getByText(strings.create));
    expect(screen.getByText(translate("folderNameNoSlash"))).toBeInTheDocument();
  });
});

describe("RenameDialog", () => {
  test("输入新名称提交", () => {
    const onSubmit = vi.fn();
    render(
      <RenameDialog open currentName="a.txt" onClose={vi.fn()} onSubmit={onSubmit} />
    );
    fireEvent.change(screen.getByLabelText(strings.name), {
      target: { value: "b.txt" },
    });
    fireEvent.click(screen.getByText(strings.ok));
    expect(onSubmit).toHaveBeenCalledWith("b.txt");
  });

  test("名称不变直接关闭", () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(
      <RenameDialog open currentName="a.txt" onClose={onClose} onSubmit={onSubmit} />
    );
    fireEvent.click(screen.getByText(strings.ok));
    expect(onClose).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("空名称显示错误", () => {
    render(
      <RenameDialog open currentName="a.txt" onClose={vi.fn()} onSubmit={vi.fn()} />
    );
    fireEvent.change(screen.getByLabelText(strings.name), { target: { value: "" } });
    fireEvent.click(screen.getByText(strings.ok));
    expect(screen.getByText(translate("nameEmpty"))).toBeInTheDocument();
  });
});
