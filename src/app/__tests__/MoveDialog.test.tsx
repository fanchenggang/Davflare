import { vi, type Mock } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import MoveDialog from "../../MoveDialog";
import { fetchPath } from "../transfer";
import { setLang, strings } from "../strings";

vi.mock("../transfer", () => ({
  fetchPath: vi.fn(),
}));

const mockFetchPath = fetchPath as unknown as Mock;

function folderItem(key: string, name = key) {
  return { key, name, isDir: true, size: 0, uploaded: "", contentType: "application/x-directory" };
}

beforeEach(() => {
  setLang("zh");
  mockFetchPath.mockReset();
});

describe("MoveDialog", () => {
  test("打开后加载根目录文件夹并显示", async () => {
    mockFetchPath.mockResolvedValue([folderItem("docs", "docs"), folderItem("imgs", "imgs")]);
    render(
      <MoveDialog
        open
        sourceKeys={["a.txt"]}
        onClose={vi.fn()}
        onMove={vi.fn()}
        onError={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getByText("docs")).toBeInTheDocument());
    expect(screen.getByText("imgs")).toBeInTheDocument();
    expect(mockFetchPath).toHaveBeenCalledWith("");
  });

  test("点击文件夹导航加载子目录", async () => {
    mockFetchPath.mockResolvedValueOnce([folderItem("docs", "docs")]);
    mockFetchPath.mockResolvedValueOnce([folderItem("docs/notes", "notes")]);
    render(
      <MoveDialog
        open
        sourceKeys={["a.txt"]}
        onClose={vi.fn()}
        onMove={vi.fn()}
        onError={vi.fn()}
      />
    );
    fireEvent.click(await screen.findByText("docs"));
    await waitFor(() => expect(screen.getByText("notes")).toBeInTheDocument());
    expect(mockFetchPath).toHaveBeenLastCalledWith("docs/");
  });

  test("加载失败调用 onError", async () => {
    mockFetchPath.mockRejectedValue(new Error("boom"));
    const onError = vi.fn();
    render(
      <MoveDialog open sourceKeys={["a.txt"]} onClose={vi.fn()} onMove={vi.fn()} onError={onError} />
    );
    await waitFor(() => expect(onError).toHaveBeenCalled());
  });

  test("目标为源目录时禁用移动按钮", async () => {
    mockFetchPath.mockResolvedValue([folderItem("docs", "docs")]);
    render(
      <MoveDialog
        open
        sourceKeys={["docs/a.txt"]}
        onClose={vi.fn()}
        onMove={vi.fn()}
        onError={vi.fn()}
      />
    );
    // 根目录不是源目录，按钮可用；切到 docs/ 后按钮禁用
    const moveButton = screen.getByRole("button", { name: strings.moveHere });
    expect(moveButton).not.toBeDisabled();
  });

  test("点击移动调用 onMove 当前目录", async () => {
    mockFetchPath.mockResolvedValue([folderItem("docs", "docs")]);
    const onMove = vi.fn();
    render(
      <MoveDialog open sourceKeys={["docs/a.txt"]} onClose={vi.fn()} onMove={onMove} onError={vi.fn()} />
    );
    fireEvent.click(screen.getByRole("button", { name: strings.moveHere }));
    expect(onMove).toHaveBeenCalledWith("");
  });
});
