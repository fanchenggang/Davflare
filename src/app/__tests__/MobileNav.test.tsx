import { vi, type Mock } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import MobileNav from "../../MobileNav";
import { useTransferQueue } from "../transferQueue";
import { setLang, strings } from "../strings";

vi.mock("../transferQueue", () => ({
  useTransferQueue: vi.fn(),
}));

const mockUseTransferQueue = useTransferQueue as unknown as Mock;

beforeEach(() => {
  setLang("zh");
  mockUseTransferQueue.mockReset();
  mockUseTransferQueue.mockReturnValue([]);
});

describe("MobileNav", () => {
  test("不可见时渲染 null", () => {
    const { container } = render(
      <MobileNav
        visible={false}
        onGoFiles={vi.fn()}
        onUploadFile={vi.fn()}
        onUploadFolder={vi.fn()}
        onCreateFolder={vi.fn()}
        onOpenTextPad={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("导航按钮触发 onGoFiles", () => {
    const onGoFiles = vi.fn();
    render(
      <MobileNav
        visible
        onGoFiles={onGoFiles}
        onUploadFile={vi.fn()}
        onUploadFolder={vi.fn()}
        onCreateFolder={vi.fn()}
        onOpenTextPad={vi.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText(strings.files));
    expect(onGoFiles).toHaveBeenCalled();
  });

  test("上传菜单选择文件/文件夹", () => {
    const onUploadFile = vi.fn();
    const onUploadFolder = vi.fn();
    render(
      <MobileNav
        visible
        onGoFiles={vi.fn()}
        onUploadFile={onUploadFile}
        onUploadFolder={onUploadFolder}
        onCreateFolder={vi.fn()}
        onOpenTextPad={vi.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText(strings.upload));
    fireEvent.click(screen.getByText(strings.uploadFile));
    expect(onUploadFile).toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText(strings.upload));
    fireEvent.click(screen.getByText(strings.uploadFolder));
    expect(onUploadFolder).toHaveBeenCalled();
  });

  test("创建菜单选择新建文件夹/记事本", () => {
    const onCreateFolder = vi.fn();
    const onOpenTextPad = vi.fn();
    render(
      <MobileNav
        visible
        onGoFiles={vi.fn()}
        onUploadFile={vi.fn()}
        onUploadFolder={vi.fn()}
        onCreateFolder={onCreateFolder}
        onOpenTextPad={onOpenTextPad}
      />
    );
    fireEvent.click(screen.getByLabelText(strings.create));
    fireEvent.click(screen.getByText(strings.createFolder));
    expect(onCreateFolder).toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText(strings.create));
    fireEvent.click(screen.getByText(strings.openTextPad));
    expect(onOpenTextPad).toHaveBeenCalled();
  });

  test("有上传任务时展示进度环", () => {
    mockUseTransferQueue.mockReturnValue([
      { id: "t1", type: "upload", status: "in-progress", name: "a", basedir: "", remoteKey: "a", loaded: 5, total: 10 },
    ]);
    const { container } = render(
      <MobileNav
        visible
        onGoFiles={vi.fn()}
        onUploadFile={vi.fn()}
        onUploadFolder={vi.fn()}
        onCreateFolder={vi.fn()}
        onOpenTextPad={vi.fn()}
      />
    );
    expect(container.querySelector(".MuiCircularProgress-root")).not.toBeNull();
  });
});
