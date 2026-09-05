/**
 * Main.tsx 集成分支补充：搜索「加载更多」（IO/滚动/防重复/错误）、面包屑 goUp、
 * 上下文菜单动作、删除-撤销/重试闭环、多选工具栏、空目录上传入口、
 * 最近文件入口、拖拽入文件夹（内部移动 / 外部文件）、上传完成刷新列表。
 */
import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import Main from "../../Main";
import { ClipboardProvider } from "../clipboard";
import { DEFAULT_FEATURE_FLAGS, useFeatures } from "../features";
import { useAuth } from "../auth";
import {
  collectFilesFromDataTransfer,
  copyPaste,
  createFolder,
  downloadArchive,
  downloadFile,
  fetchFolderCounts,
  fetchPath,
  openFile,
  searchFiles,
} from "../transfer";
import { moveToTrash, restoreTrash } from "../trash";
import { setLang, strings, translate } from "../strings";
import type { TransferTask } from "../types";

jest.mock("../auth", () => ({
  useAuth: jest.fn(),
  authFetch: jest.fn(),
}));

jest.mock("../features", () => {
  const actual = jest.requireActual("../features");
  return { ...actual, useFeatures: jest.fn() };
});

let mockQueueTasks: TransferTask[] = [];
const mockEnqueue = jest.fn();
jest.mock("../transferQueue", () => ({
  useTransferQueue: () => mockQueueTasks,
  useUploadEnqueue: () => mockEnqueue,
}));

jest.mock("../transfer", () => ({
  collectFilesFromDataTransfer: jest.fn(),
  copyPaste: jest.fn(),
  createFolder: jest.fn(),
  downloadArchive: jest.fn(),
  downloadFile: jest.fn(),
  fetchFolderCounts: jest.fn().mockResolvedValue({}),
  fetchPath: jest.fn(),
  openFile: jest.fn(),
  searchFiles: jest.fn(),
  selectDirectoryFiles: jest.fn(),
}));

jest.mock("../trash", () => ({
  moveToTrash: jest.fn(),
  restoreTrash: jest.fn(),
}));

jest.mock("../../PreviewDialog", () => ({ __esModule: true, default: () => null }));
jest.mock("../../ShareDialog", () => ({ __esModule: true, default: () => null }));
jest.mock("../../SitesView", () => ({ __esModule: true, default: () => <div>sites-stub</div> }));
jest.mock("../../ImagesView", () => ({ __esModule: true, default: () => <div>images-stub</div> }));
jest.mock("../../TrashView", () => ({ __esModule: true, default: () => <div>trash-stub</div> }));
jest.mock("../../SharesView", () => ({ __esModule: true, default: () => <div>shares-stub</div> }));
jest.mock("../../SettingsView", () => ({ __esModule: true, default: () => <div>settings-stub</div> }));
jest.mock("../../WebDavPanel", () => ({ __esModule: true, default: () => null }));
jest.mock("../../TextPadDrawer", () => ({ __esModule: true, default: () => null }));
jest.mock("../../MoveDialog", () => ({ __esModule: true, default: ({ open }: { open: boolean }) => (open ? <div>move-stub</div> : null) }));
jest.mock("../../AuthThumbnail", () => ({ __esModule: true, default: () => <span /> }));
jest.mock("../../MimeIcon", () => ({ __esModule: true, default: () => <span /> }));

const mockUseAuth = useAuth as unknown as jest.Mock;
const mockUseFeatures = useFeatures as unknown as jest.Mock;
const mockFetchPath = fetchPath as unknown as jest.Mock;
const mockSearch = searchFiles as unknown as jest.Mock;
const mockCopyPaste = copyPaste as unknown as jest.Mock;
const mockCreateFolder = createFolder as unknown as jest.Mock;
const mockMoveTrash = moveToTrash as unknown as jest.Mock;
const mockRestore = restoreTrash as unknown as jest.Mock;
const mockCollect = collectFilesFromDataTransfer as unknown as jest.Mock;
const mockDownload = downloadFile as unknown as jest.Mock;
const mockArchive = downloadArchive as unknown as jest.Mock;
const mockOpen = openFile as unknown as jest.Mock;
const mockCounts = fetchFolderCounts as unknown as jest.Mock;

const file = {
  key: "a.txt",
  name: "a.txt",
  isDir: false,
  size: 1,
  uploaded: "2026-01-01T00:00:00.000Z",
  contentType: "text/plain",
};
const file2 = { ...file, key: "b.txt", name: "b.txt" };
const folder = {
  key: "docs",
  name: "docs",
  isDir: true,
  size: 0,
  uploaded: "2026-01-02T00:00:00.000Z",
  contentType: "application/x-directory",
};

function renderMain(route: any = { kind: "folder", path: "" }, extra: Partial<React.ComponentProps<typeof Main>> = {}) {
  const props = {
    search: "",
    onSearchChange: jest.fn(),
    onNotify: jest.fn(),
    view: "list" as const,
    onViewChange: jest.fn(),
    sort: { field: "name" as const, order: "asc" as const },
    onSortChange: jest.fn(),
    route,
    navigate: jest.fn(),
    onOpenApi: jest.fn(),
    onContentScroll: jest.fn(),
    ...extra,
  };
  const result = render(
    <ClipboardProvider>
      <Main {...props} />
    </ClipboardProvider>
  );
  return { ...result, props };
}

beforeAll(() => {
  (global as any).IntersectionObserver = class {
    constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) {
      void cb;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = jest.fn();
  Object.assign(navigator, {
    clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
  });
});

beforeEach(() => {
  setLang("zh");
  mockQueueTasks = [];
  mockEnqueue.mockReset();
  mockUseAuth.mockReturnValue({ username: "alice", login: jest.fn(), logout: jest.fn() });
  mockUseFeatures.mockReturnValue({
    flags: DEFAULT_FEATURE_FLAGS,
    sitesHost: null,
    updateFlags: jest.fn(),
    refresh: jest.fn(),
    config: { username: "alice", publicRead: false, sitesHost: null, flags: DEFAULT_FEATURE_FLAGS },
  });
  mockFetchPath.mockReset();
  mockFetchPath.mockResolvedValue([file, folder]);
  mockSearch.mockReset();
  mockSearch.mockResolvedValue({ items: [file], hasMore: false });
  mockCopyPaste.mockReset();
  mockCopyPaste.mockResolvedValue(undefined);
  mockCreateFolder.mockReset();
  mockCreateFolder.mockResolvedValue(undefined);
  mockMoveTrash.mockReset();
  mockMoveTrash.mockResolvedValue({ results: [{ id: "t1" }] });
  mockRestore.mockReset();
  mockRestore.mockResolvedValue(undefined);
  mockCollect.mockReset();
  mockCollect.mockResolvedValue([]);
  mockDownload.mockReset();
  mockDownload.mockResolvedValue(undefined);
  mockArchive.mockReset();
  mockArchive.mockResolvedValue(undefined);
  mockOpen.mockReset();
  mockOpen.mockResolvedValue(undefined);
  mockCounts.mockResolvedValue({});
  sessionStorage.clear();
  localStorage.clear();
});

function delay(ms = 80) {
  return act(() => new Promise((resolve) => setTimeout(resolve, ms)));
}

describe("Main 全盘搜索加载更多", () => {
  test("触底自动加载下一页并去重，加载完显示 allLoaded", async () => {
    jest.useFakeTimers();
    try {
      mockSearch
        .mockResolvedValueOnce({ items: [file], hasMore: true, nextCursor: "c1" })
        .mockResolvedValueOnce({ items: [file2], hasMore: false });
      renderMain({ kind: "folder", path: "" }, { search: "hello" });
      await act(async () => {
        jest.advanceTimersByTime(400);
      });
      await act(async () => {
        jest.runOnlyPendingTimers();
      });
      expect(mockSearch).toHaveBeenCalledTimes(2);
      // 第二页带 cursor
      const secondCall = mockSearch.mock.calls[1];
      expect(secondCall[1]).toBe("c1");
      await waitFor(() => expect(screen.getByText("b.txt")).toBeInTheDocument());
      expect(screen.getByText(strings.allLoaded)).toBeInTheDocument();
      // 已加载完：滚动不再触发新的请求
      await act(async () => {
        window.dispatchEvent(new Event("scroll"));
      });
      await act(async () => {
        window.dispatchEvent(new Event("scroll"));
      });
      expect(mockSearch).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  test("加载更多失败时错误提示", async () => {
    jest.useFakeTimers();
    try {
      mockSearch
        .mockResolvedValueOnce({ items: [file], hasMore: true, nextCursor: "c1" })
        .mockRejectedValueOnce(new Error("page-2-fail"));
      const onNotify = jest.fn();
      renderMain({ kind: "folder", path: "" }, { search: "hello", onNotify });
      await act(async () => {
        jest.advanceTimersByTime(400);
      });
      await act(async () => {
        jest.runOnlyPendingTimers();
      });
      await waitFor(() =>
        expect(onNotify).toHaveBeenCalledWith("page-2-fail", "error")
      );
    } finally {
      jest.useRealTimers();
    }
  });

  test("列表加载失败的重试 action 可再次触发 loadListing", async () => {
    mockFetchPath.mockRejectedValue(new Error("list-fail"));
    const onNotify = jest.fn();
    renderMain({ kind: "folder", path: "" }, { onNotify });
    await waitFor(() => expect(onNotify).toHaveBeenCalled());
    const retry = onNotify.mock.calls[0][2]?.action?.onClick;
    expect(retry).toBeTruthy();
    mockFetchPath.mockResolvedValue([file]);
    await act(async () => {
      retry();
    });
    await waitFor(() => expect(screen.getByText("a.txt")).toBeInTheDocument());
  });
});

describe("Main 面包屑导航", () => {
  test("goUp 返回上级；子目录场景", async () => {
    const { props } = renderMain({ kind: "folder", path: "docs/sub/" });
    await waitFor(() => expect(screen.getByText("a.txt")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(strings.goUp));
    expect(props.navigate).toHaveBeenCalledWith({ kind: "folder", path: "docs/" });
  });

  test("中间面包屑点击导航到对应层", async () => {
    const { props } = renderMain({ kind: "folder", path: "a/b/" });
    await waitFor(() => expect(screen.getByText("a.txt")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "a" }));
    expect(props.navigate).toHaveBeenCalledWith({ kind: "folder", path: "a/" });
  });
});

describe("Main 上下文菜单动作", () => {
  test("下载文件夹走压缩包、打开目录导航、details 打开侧栏", async () => {
    const { props } = renderMain();
    await waitFor(() => expect(screen.getByText("docs")).toBeInTheDocument());
    // 下载目录 → archive
    fireEvent.click(screen.getByLabelText(translate("fileActionsLabel", { name: "docs" })));
    fireEvent.click(screen.getByRole("menuitem", { name: strings.download }));
    await waitFor(() => expect(mockArchive).toHaveBeenCalledWith(["docs"]));
    // open 目录 → navigate
    fireEvent.click(screen.getByLabelText(translate("fileActionsLabel", { name: "docs" })));
    fireEvent.click(screen.getByRole("menuitem", { name: strings.open }));
    expect(props.navigate).toHaveBeenCalledWith({ kind: "folder", path: "docs/" });
    // details
    fireEvent.click(screen.getByLabelText(translate("fileActionsLabel", { name: "a.txt" })));
    fireEvent.click(screen.getByRole("menuitem", { name: translate("detailsOpen") }));
    await waitFor(() => expect(screen.getByLabelText(strings.close)).toBeInTheDocument());
  });

  test("菜单 rename/share/move/delete 经延时后打开对应对话框", async () => {
    renderMain();
    await waitFor(() => expect(screen.getByText("a.txt")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(translate("fileActionsLabel", { name: "a.txt" })));
    fireEvent.click(screen.getByRole("menuitem", { name: strings.rename }));
    await delay();
    await waitFor(() => expect(screen.getByLabelText(strings.name)).toBeInTheDocument());
    fireEvent.click(screen.getByText(strings.cancel));

    fireEvent.click(screen.getByLabelText(translate("fileActionsLabel", { name: "a.txt" })));
    fireEvent.click(screen.getByRole("menuitem", { name: strings.move }));
    await delay();
    await waitFor(() => expect(screen.getByText("move-stub")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText(translate("fileActionsLabel", { name: "a.txt" })));
    fireEvent.click(screen.getByRole("menuitem", { name: strings.share }));
    fireEvent.click(screen.getByLabelText(translate("fileActionsLabel", { name: "a.txt" })));
    fireEvent.click(screen.getByRole("menuitem", { name: strings.delete }));
    await waitFor(() =>
      expect(screen.getByText(translate("confirmDeleteMsg", { count: 1 }))).toBeInTheDocument()
    );
    fireEvent.click(screen.getByText(strings.cancel));
  });
});

describe("Main 删除-撤销/重试闭环", () => {
  function openConfirmAndConfirm(onNotify: jest.Mock) {
    renderMain({ kind: "folder", path: "" }, { onNotify });
    return waitFor(() => screen.getByText("a.txt")).then(() => {
      fireEvent.click(screen.getByLabelText(translate("fileActionsLabel", { name: "a.txt" })));
      fireEvent.click(screen.getByRole("menuitem", { name: strings.delete }));
      // 菜单动作经 50ms setTimeout 打开确认框，用 waitFor 消化时序抖动
      return waitFor(() =>
        expect(screen.getByRole("button", { name: strings.confirmAction })).toBeInTheDocument()
      ).then(() => {
        fireEvent.click(screen.getByRole("button", { name: strings.confirmAction }));
      });
    });
  }

  test("删除成功 → undo 恢复成功并再次刷新", async () => {
    const onNotify = jest.fn();
    await openConfirmAndConfirm(onNotify);
    await waitFor(() => expect(mockMoveTrash).toHaveBeenCalled());
    await waitFor(() => expect(onNotify).toHaveBeenCalledTimes(1));
    const undo = onNotify.mock.calls[0][2]?.action?.onClick;
    expect(undo).toBeTruthy();
    await act(async () => {
      undo();
    });
    await waitFor(() => expect(mockRestore).toHaveBeenCalledWith(["t1"]));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(translate("undoDeleteDone"), "success")
    );
  });

  test("删除成功 → undo 恢复失败 → 错误提示", async () => {
    const onNotify = jest.fn();
    mockRestore.mockRejectedValue(new Error("restore-fail"));
    await openConfirmAndConfirm(onNotify);
    await waitFor(() => expect(mockMoveTrash).toHaveBeenCalled());
    await waitFor(() => expect(onNotify).toHaveBeenCalledTimes(1));
    const undo = onNotify.mock.calls[0][2]?.action?.onClick;
    expect(undo).toBeTruthy();
    await act(async () => {
      undo();
    });
    await waitFor(() => expect(mockRestore).toHaveBeenCalledWith(["t1"]));
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith("restore-fail", "error"));
  });

  test("删除失败 → retry 重试成功", async () => {
    const onNotify = jest.fn();
    mockMoveTrash.mockRejectedValueOnce(new Error("trash-fail"));
    await openConfirmAndConfirm(onNotify);
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith("trash-fail", "error", expect.anything()));
    const retry = onNotify.mock.calls.find((c) => c[0] === "trash-fail")[2].action.onClick;
    await act(async () => {
      retry();
    });
    await waitFor(() => expect(mockMoveTrash).toHaveBeenCalledTimes(2));
  });
});

describe("Main 重命名失败重试", () => {
  test("rename 失败 → 错误提示带 retry，重试后成功", async () => {
    const onNotify = jest.fn();
    mockCopyPaste.mockRejectedValueOnce(new Error("rename-fail"));
    renderMain({ kind: "folder", path: "" }, { onNotify });
    await waitFor(() => expect(screen.getByText("a.txt")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(translate("selectFileLabel", { name: "a.txt" })));
    fireEvent.keyDown(window, { key: "F2" });
    fireEvent.change(screen.getByLabelText(strings.name), { target: { value: "renamed.txt" } });
    fireEvent.click(screen.getByText(strings.ok));
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith("rename-fail", "error", expect.anything()));
    const retry = onNotify.mock.calls.find((c) => c[0] === "rename-fail")[2].action.onClick;
    await act(async () => {
      retry();
    });
    await waitFor(() => expect(mockCopyPaste).toHaveBeenCalledTimes(2));
  });
});

describe("Main 多选工具栏", () => {
  test("单选文件 → 下载走单文件；copy/cut/move/share 入口；rename 最后", async () => {
    renderMain();
    await waitFor(() => expect(screen.getByText("a.txt")).toBeInTheDocument());
    const toolbarBtn = (name: string) => {
      const toolbar = document.querySelector(".MuiToolbar-root")!;
      return within(toolbar as HTMLElement).getByRole("button", { name });
    };
    fireEvent.click(screen.getByLabelText(translate("selectFileLabel", { name: "a.txt" })));
    fireEvent.click(toolbarBtn(strings.download));
    await waitFor(() => expect(mockDownload).toHaveBeenCalledWith("a.txt"));

    fireEvent.click(toolbarBtn(strings.copy));
    fireEvent.click(toolbarBtn(strings.cut));
    fireEvent.click(toolbarBtn(strings.move));
    await waitFor(() => expect(screen.getByText("move-stub")).toBeInTheDocument());
    // move-stub（mock 组件）不关闭，但其中没有 Dialog aria-hidden，后续查询不受影响
    fireEvent.click(toolbarBtn(strings.share));

    // rename 放最后：对话框关闭动画期间 aria-hidden 会屏蔽其他元素
    fireEvent.click(toolbarBtn(strings.rename));
    await waitFor(() => expect(screen.getByLabelText(strings.name)).toBeInTheDocument());
    fireEvent.click(screen.getByText(strings.cancel));
  });

  test("多选 → 下载走压缩包；关闭清空选择", async () => {
    mockFetchPath.mockResolvedValue([file, file2, folder]);
    renderMain();
    await waitFor(() => expect(screen.getByText("b.txt")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(translate("selectFileLabel", { name: "a.txt" })));
    fireEvent.click(screen.getByLabelText(translate("selectFileLabel", { name: "b.txt" })));
    const toolbar = document.querySelector(".MuiToolbar-root")!;
    fireEvent.click(within(toolbar as HTMLElement).getByRole("button", { name: strings.download }));
    await waitFor(() => expect(mockArchive).toHaveBeenCalledWith(["a.txt", "b.txt"]));
    fireEvent.click(within(toolbar as HTMLElement).getByRole("button", { name: strings.close }));
  });

  test("多选下载失败时错误提示", async () => {
    const onNotify = jest.fn();
    mockArchive.mockRejectedValue(new Error("zip-fail"));
    mockFetchPath.mockResolvedValue([file, file2, folder]);
    renderMain({ kind: "folder", path: "" }, { onNotify });
    await waitFor(() => expect(screen.getByText("b.txt")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(translate("selectFileLabel", { name: "a.txt" })));
    fireEvent.click(screen.getByLabelText(translate("selectFileLabel", { name: "b.txt" })));
    const toolbar = document.querySelector(".MuiToolbar-root")!;
    fireEvent.click(within(toolbar as HTMLElement).getByRole("button", { name: strings.download }));
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith("zip-fail", "error"));
  });
});

describe("Main 空目录入口", () => {
  test("空目录展示上传/新建入口，上传按钮触发文件选择并入队", async () => {
    mockFetchPath.mockResolvedValue([]);
    const orig = document.createElement.bind(document);
    let picked: HTMLInputElement | null = null;
    const spy = jest.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = orig(tag) as HTMLInputElement;
      if (tag === "input") picked = el;
      return el;
    });
    try {
      renderMain();
      // 空目录 EmptyState 的上传按钮（ExplorerBar 的按钮 aria-label 是「上传文件」）
      const emptyBox = await waitFor(() => {
        const hint = screen.getByText(strings.noFilesHint);
        return hint.closest("div")!.parentElement as HTMLElement;
      });
      picked = null; // 只捕获点击后创建的文件 input（渲染期的 input 也会被拦截）
      fireEvent.click(within(emptyBox).getByRole("button", { name: strings.upload }));
      expect(picked).toBeTruthy();
      const dropped = new File(["x"], "picked.txt");
      Object.defineProperty(picked!, "files", { value: [dropped], configurable: true });
      picked!.onchange?.(new Event("change") as any);
      await waitFor(() =>
        expect(mockEnqueue).toHaveBeenCalledWith({ file: dropped, basedir: "" })
      );
    } finally {
      spy.mockRestore();
    }
  });

  test("搜索无结果时展示清除搜索按钮", async () => {
    jest.useFakeTimers();
    try {
      mockSearch.mockResolvedValue({ items: [], hasMore: false });
      const onSearchChange = jest.fn();
      renderMain({ kind: "folder", path: "" }, { search: "nomatch", onSearchChange });
      await act(async () => {
        jest.advanceTimersByTime(400);
      });
      await waitFor(() => expect(screen.getByText(strings.clearSearch)).toBeInTheDocument());
      fireEvent.click(screen.getByText(strings.clearSearch));
      expect(onSearchChange).toHaveBeenCalledWith("");
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("Main 最近文件入口", () => {
  test("打开最近的文件：导航到父目录并触发打开", async () => {
    localStorage.setItem(
      "flaredrive.recent",
      JSON.stringify([{ key: "x.bin", name: "x.bin", isDir: false, at: 1 }])
    );
    mockFetchPath.mockResolvedValue([
      file,
      folder,
      { key: "x.bin", name: "x.bin", isDir: false, size: 1, uploaded: "2026", contentType: "application/octet-stream" },
    ]);
    renderMain();
    await waitFor(() => expect(screen.getByText(strings.recent)).toBeInTheDocument());
    fireEvent.click(screen.getByText(strings.recent));
    const items = await screen.findAllByRole("menuitem");
    const target = items.find((i) => i.textContent === "x.bin");
    expect(target).toBeTruthy();
    fireEvent.click(target!);
    await waitFor(() => expect(mockOpen).toHaveBeenCalledWith("x.bin"));
  });

  test("最近条目缺失时提示", async () => {
    const onNotify = jest.fn();
    localStorage.setItem(
      "flaredrive.recent",
      JSON.stringify([{ key: "gone.txt", name: "gone.txt", isDir: false, at: 1 }])
    );
    renderMain({ kind: "folder", path: "" }, { onNotify });
    await waitFor(() => expect(screen.getByText(strings.recent)).toBeInTheDocument());
    fireEvent.click(screen.getByText(strings.recent));
    const item = await screen.findByText("gone.txt");
    fireEvent.click(item);
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith(translate("recentMissing"), "error"));
  });

  test("最近的目录直接导航", async () => {
    localStorage.setItem(
      "flaredrive.recent",
      JSON.stringify([{ key: "docs", name: "docs", isDir: true, at: 1 }])
    );
    const { props } = renderMain();
    await waitFor(() => expect(screen.getByText(strings.recent)).toBeInTheDocument());
    fireEvent.click(screen.getByText(strings.recent));
    const items = await screen.findAllByRole("menuitem");
    const target = items.find((i) => (i.textContent || "").startsWith("docs"));
    expect(target).toBeTruthy();
    fireEvent.click(target!);
    expect(props.navigate).toHaveBeenCalledWith({ kind: "folder", path: "docs/" });
  });
});

describe("Main 拖拽入文件夹", () => {
  test("内部拖拽（JSON 数组格式）→ MOVE 到目标目录，过滤自身", async () => {
    const { props } = renderMain();
    await waitFor(() => expect(screen.getByText("docs")).toBeInTheDocument());
    const dt = { getData: () => '["x/a.txt","docs","docs/inner"]' } as unknown as DataTransfer;
    fireEvent.drop(screen.getByText("docs"), { dataTransfer: dt });
    await waitFor(() => expect(mockCopyPaste).toHaveBeenCalled());
    expect(props.navigate).not.toHaveBeenCalled();
  });

  test("外部文件拖入文件夹 → 查询目标目录占用并入队", async () => {
    renderMain();
    await waitFor(() => expect(screen.getByText("docs")).toBeInTheDocument());
    const dropped = new File(["x"], "drop.txt");
    mockCollect.mockResolvedValue([dropped]);
    const dt = { getData: () => "" } as unknown as DataTransfer;
    fireEvent.drop(screen.getByText("docs"), { dataTransfer: dt });
    await waitFor(() =>
      expect(mockEnqueue).toHaveBeenCalledWith({ file: dropped, basedir: "docs/" })
    );
  });

  test("内部拖拽仅自身时不动作", async () => {
    renderMain();
    await waitFor(() => expect(screen.getByText("docs")).toBeInTheDocument());
    const dt = { getData: () => '["docs"]' } as unknown as DataTransfer;
    fireEvent.drop(screen.getByText("docs"), { dataTransfer: dt });
    await delay();
    expect(mockCopyPaste).not.toHaveBeenCalled();
  });
});

describe("Main 上传完成刷新列表", () => {
  test("活动上传数归零时重新拉取列表", async () => {
    mockQueueTasks = [
      {
        id: "t1",
        type: "upload",
        status: "in-progress",
        name: "x.txt",
        basedir: "",
        remoteKey: "x.txt",
        loaded: 0,
        total: 1,
      } as TransferTask,
    ];
    const { props, rerender } = renderMain();
    await waitFor(() => expect(mockFetchPath).toHaveBeenCalledTimes(1));
    mockQueueTasks = [];
    await act(async () => {
      rerender(
        <ClipboardProvider>
          <Main {...props} />
        </ClipboardProvider>
      );
    });
    await waitFor(() => expect(mockFetchPath.mock.calls.length).toBeGreaterThanOrEqual(2));
  });
});
