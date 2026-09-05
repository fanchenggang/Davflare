import { vi, type Mock } from "vitest";
/**
 * hooks 覆盖补充：useKeyboardShortcuts / useMultiSelect / useDragDropUpload /
 * usePasteUpload / useUploadInputs(transferKeys) 的分支缺口。
 */
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";

import { useKeyboardShortcuts, KeyboardShortcutsParams } from "../useKeyboardShortcuts";
import { useMultiSelect } from "../useMultiSelect";
import { useDragDropUpload } from "../useDragDropUpload";
import { usePasteUpload } from "../usePasteUpload";
import { transferKeys, useUploadInputs } from "../useUploadInputs";
import { useTransferQueue, useUploadEnqueue } from "../transferQueue";
import { collectFilesFromDataTransfer, copyPaste, fetchPath } from "../transfer";
import { FileItem } from "../types";

vi.mock("../transferQueue", () => ({
  useTransferQueue: vi.fn(() => []),
  useUploadEnqueue: vi.fn(),
}));

vi.mock("../transfer", () => ({
  collectFilesFromDataTransfer: vi.fn(),
  copyPaste: vi.fn(),
  fetchPath: vi.fn(),
}));

const mockCollect = collectFilesFromDataTransfer as unknown as Mock;
const mockFetchPath = fetchPath as unknown as Mock;
const mockCopyPaste = copyPaste as unknown as Mock;
const mockUploadEnqueueFn = vi.fn();
const mockUseUploadEnqueue = useUploadEnqueue as unknown as Mock;
const mockUseTransferQueue = useTransferQueue as unknown as Mock;

function makeFile(key: string, isDir = false): FileItem {
  return {
    key,
    name: key.split("/").pop() || key,
    isDir,
    size: 1,
    uploaded: "2026-01-01T00:00:00.000Z",
    contentType: isDir ? "application/x-directory" : "text/plain",
  };
}

const files = [
  makeFile("a.txt"),
  makeFile("b.txt"),
  makeFile("c.md"),
  makeFile("docs", true),
];

function setupShortcuts(overrides: Partial<KeyboardShortcutsParams> = {}) {
  const params: KeyboardShortcutsParams = {
    route: { kind: "folder", path: "docs/" },
    visibleFiles: files,
    selectedKeys: [],
    focusedKey: null,
    setSelectedKeys: vi.fn(),
    setFocusedKey: vi.fn(),
    moveFocused: vi.fn(),
    jumpFocused: vi.fn(),
    toggleSelect: vi.fn(),
    selectAll: vi.fn(),
    navigateFolder: vi.fn(),
    onOpen: vi.fn(),
    onRename: vi.fn(),
    onDetails: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  const utils = renderHook(() => useKeyboardShortcuts(params));
  // 同一测试内多次改参数时复用同一实例（旧实例若不卸载会残留 window 监听）
  const update = (patch: Partial<KeyboardShortcutsParams>) => {
    Object.assign(params, patch);
    utils.rerender();
  };
  return { ...utils, params, update };
}

function withOverlay(body: () => void) {
  const node = document.createElement("div");
  node.className = "MuiModal-root";
  document.body.appendChild(node);
  try {
    body();
  } finally {
    node.remove();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCollect.mockResolvedValue([]);
  Element.prototype.scrollIntoView = vi.fn();
  mockUseUploadEnqueue.mockReturnValue(mockUploadEnqueueFn);
  mockUseTransferQueue.mockReturnValue([]);
});

describe("useKeyboardShortcuts", () => {
  test("方向键/Home/End/Space/Ctrl+A 基础派发", () => {
    const moveFocused = vi.fn();
    const jumpFocused = vi.fn();
    const toggleSelect = vi.fn();
    const selectAll = vi.fn();
    const { update } = setupShortcuts({ moveFocused, jumpFocused, toggleSelect, selectAll });

    fireEvent.keyDown(window, { key: "ArrowDown", shiftKey: true });
    fireEvent.keyDown(window, { key: "ArrowUp" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowLeft", shiftKey: true });
    expect(moveFocused).toHaveBeenNthCalledWith(1, 1, true);
    expect(moveFocused).toHaveBeenNthCalledWith(2, -1, false);
    expect(moveFocused).toHaveBeenNthCalledWith(3, 1, false);
    expect(moveFocused).toHaveBeenNthCalledWith(4, -1, true);

    fireEvent.keyDown(window, { key: "Home", shiftKey: true });
    fireEvent.keyDown(window, { key: "End" });
    expect(jumpFocused).toHaveBeenNthCalledWith(1, 0, true);
    expect(jumpFocused).toHaveBeenNthCalledWith(2, files.length - 1, false);

    update({ focusedKey: "a.txt" });
    fireEvent.keyDown(window, { key: " " });
    expect(toggleSelect).toHaveBeenCalledWith("a.txt");

    fireEvent.keyDown(window, { key: "a", metaKey: true });
    expect(selectAll).toHaveBeenCalled();
  });

  test("F2：焦点优先，其次唯一选中；无目标/文件缺失不动作", () => {
    const onRename = vi.fn();
    const { update } = setupShortcuts({ onRename });
    fireEvent.keyDown(window, { key: "F2" });
    expect(onRename).not.toHaveBeenCalled();

    update({ focusedKey: "missing.txt" });
    fireEvent.keyDown(window, { key: "F2" });
    expect(onRename).not.toHaveBeenCalled();

    update({ focusedKey: null, selectedKeys: ["b.txt"] });
    fireEvent.keyDown(window, { key: "F2" });
    expect(onRename).toHaveBeenCalledWith(files[1]);

    update({ focusedKey: "c.md" });
    fireEvent.keyDown(window, { key: "F2" });
    expect(onRename).toHaveBeenCalledWith(files[2]);
  });

  test("I 键打开详情（与 F2 同型分支）", () => {
    const onDetails = vi.fn();
    setupShortcuts({ onDetails, selectedKeys: ["c.md"] });
    fireEvent.keyDown(window, { key: "I" });
    expect(onDetails).toHaveBeenCalledWith(files[2]);
  });

  test("Delete：选中组优先，其次焦点，无目标不动作", () => {
    const onDelete = vi.fn();
    const { update } = setupShortcuts({ onDelete });
    fireEvent.keyDown(window, { key: "Delete" });
    expect(onDelete).not.toHaveBeenCalled();

    update({ focusedKey: "a.txt" });
    fireEvent.keyDown(window, { key: "Delete" });
    expect(onDelete).toHaveBeenCalledWith(["a.txt"]);

    update({ selectedKeys: ["a.txt", "b.txt"], focusedKey: "c.md" });
    fireEvent.keyDown(window, { key: "Delete" });
    expect(onDelete).toHaveBeenCalledWith(["a.txt", "b.txt"]);
  });

  test("Enter：目录导航、文件打开、未命中不动作", () => {
    const onOpen = vi.fn();
    const navigateFolder = vi.fn();
    const { update } = setupShortcuts({ onOpen, navigateFolder, selectedKeys: ["docs"] });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(navigateFolder).toHaveBeenCalledWith("docs");
    expect(onOpen).not.toHaveBeenCalled();

    update({ selectedKeys: ["a.txt"] });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledWith("a.txt");

    update({ selectedKeys: ["ghost.txt"] });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  test("Backspace 仅在文件夹路由返回上级", () => {
    const navigateFolder = vi.fn();
    const { update } = setupShortcuts({ navigateFolder, route: { kind: "shares" } });
    fireEvent.keyDown(window, { key: "Backspace" });
    expect(navigateFolder).not.toHaveBeenCalled();

    update({ route: { kind: "folder", path: "docs/sub/" } });
    fireEvent.keyDown(window, { key: "Backspace" });
    expect(navigateFolder).toHaveBeenCalledWith("docs/");
  });

  test("Escape 清空选择与焦点；无选中时不动作", () => {
    const setSelectedKeys = vi.fn();
    const setFocusedKey = vi.fn();
    const { update } = setupShortcuts({
      setSelectedKeys,
      setFocusedKey,
      selectedKeys: ["a.txt"],
    });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(setSelectedKeys).toHaveBeenCalledWith([]);
    expect(setFocusedKey).toHaveBeenCalledWith(null);

    update({ selectedKeys: [], focusedKey: null });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(setSelectedKeys).toHaveBeenCalledTimes(1);
  });

  test("输入框聚焦与输入法组合时忽略所有快捷键", () => {
    const moveFocused = vi.fn();
    setupShortcuts({ moveFocused });
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(moveFocused).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape", isComposing: true });
    fireEvent.keyDown(window, { key: "Process" });
    expect(moveFocused).not.toHaveBeenCalled();
    input.blur();
    input.remove();
  });

  test("存在打开的浮层时忽略快捷键", () => {
    const moveFocused = vi.fn();
    const setSelectedKeys = vi.fn();
    setupShortcuts({ moveFocused, setSelectedKeys, selectedKeys: ["a.txt"] });
    withOverlay(() => {
      fireEvent.keyDown(window, { key: "ArrowDown" });
      fireEvent.keyDown(window, { key: "Escape" });
      fireEvent.keyDown(window, { key: "Delete" });
    });
    expect(moveFocused).not.toHaveBeenCalled();
    expect(setSelectedKeys).not.toHaveBeenCalled();
  });
});

describe("useMultiSelect", () => {
  function SelectionProbe() {
    const s = useMultiSelect(files);
    return (
      <div>
        {files.map((file) => (
          <button
            key={file.key}
            data-file-key={file.key}
            data-selected={s.selectedKeys.includes(file.key) ? "1" : "0"}
            data-focused={s.focusedKey === file.key ? "1" : "0"}
            onClick={(event) => s.toggleSelect(file.key, event)}
          >
            {file.key}
          </button>
        ))}
        <button onClick={() => s.jumpFocused(99, true)}>jump-end</button>
        <button onClick={() => s.moveFocused(-5, false)}>move-before</button>
        <button onClick={() => s.moveFocused(1, true)}>move-next-extend</button>
        <button onClick={() => s.selectAll()}>select-all</button>
      </div>
    );
  }

  const selectedOf = (container: HTMLElement) =>
    Array.from(container.querySelectorAll("[data-selected='1']")).map(
      (n) => n.getAttribute("data-file-key")
    );

  test("toggle 增减与 shift 点击", () => {
    const utils = render(<SelectionProbe />);
    fireEvent.click(screen.getByText("a.txt"));
    expect(selectedOf(utils.container)).toEqual(["a.txt"]);
    // 再点一次取消
    fireEvent.click(screen.getByText("a.txt"));
    expect(selectedOf(utils.container)).toEqual([]);

    // shift 范围选择：anchor 与点击目标之间的所有项都并入选中
    fireEvent.click(screen.getByText("a.txt"));
    fireEvent.click(screen.getByText("c.md"), { shiftKey: true });
    expect(selectedOf(utils.container)).toEqual(["a.txt", "b.txt", "c.md"]);
  });

  test("shift 反向点击同样覆盖 anchor 到目标的范围", () => {
    const utils = render(<SelectionProbe />);
    fireEvent.click(screen.getByText("c.md"));
    fireEvent.click(screen.getByText("a.txt"), { shiftKey: true });
    expect(selectedOf(utils.container)).toEqual(["a.txt", "b.txt", "c.md"]);
  });

  test("shift 但 anchor 已失效时退化为普通 toggle", () => {
    const utils = render(<SelectionProbe />);
    // anchor 是 a.txt，但点一个不在 visibleFiles 的 key 没有入口；
    // 用未选过 anchor 的 shift 点击（selectionAnchor 为 null）
    fireEvent.click(screen.getByText("b.txt"), { shiftKey: true });
    expect(selectedOf(utils.container)).toEqual(["b.txt"]);
  });

  test("moveFocused / jumpFocused 越界收敛并滚动定位", () => {
    const focusSpy = vi.spyOn(HTMLElement.prototype, "focus");
    render(<SelectionProbe />);
    fireEvent.click(screen.getByText("move-before"));
    // 焦点收敛到第一项
    expect(document.querySelector("[data-focused='1']")?.getAttribute("data-file-key")).toBe("a.txt");
    fireEvent.click(screen.getByText("move-next-extend"));
    expect(selectedOf(document.body)).toEqual(["b.txt"]);
    fireEvent.click(screen.getByText("jump-end"));
    // index 越界收敛到最后一项（files 含目录 docs）
    expect(
      document.querySelector("[data-focused='1']")?.getAttribute("data-file-key")
    ).toBe("docs");
    expect(focusSpy).toHaveBeenCalled();
    focusSpy.mockRestore();
  });

  test("空列表时移动/跳转不崩", () => {
    function Empty() {
      const s = useMultiSelect([]);
      return <button onClick={() => s.moveFocused(1, false)}>mv</button>;
    }
    render(<Empty />);
    expect(() => fireEvent.click(screen.getByText("mv"))).not.toThrow();
  });

  test("selectAll 全选/再按清空", () => {
    const utils = render(<SelectionProbe />);
    fireEvent.click(screen.getByText("select-all"));
    expect(selectedOf(utils.container)).toHaveLength(4);
    fireEvent.click(screen.getByText("select-all"));
    expect(selectedOf(utils.container)).toHaveLength(0);
  });
});

describe("useDragDropUpload", () => {
  type DropProps = { active: boolean; enqueueToCwd: (files: File[]) => void };
  function setup(active = true, enqueue = vi.fn()) {
    const utils = renderHook(
      (props: DropProps) => useDragDropUpload(props),
      { initialProps: { active, enqueueToCwd: enqueue } }
    );
    return { ...utils, enqueue };
  }

  function dragEvent(
    type: "dragenter" | "dragleave" | "dragover" | "drop",
    types?: string[],
    filesArr?: File[]
  ) {
    const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(event, "dataTransfer", {
      value: { types: types ?? ["Files"], files: filesArr ?? [] },
    });
    return event;
  }

  test("dragenter 显示遮罩，dragover 阻止默认，dragleave 计数归零隐藏", () => {
    const utils = setup();
    act(() => window.dispatchEvent(dragEvent("dragenter")));
    expect(utils.result.current).toBe(true);
    const over = dragEvent("dragover");
    expect(() => act(() => window.dispatchEvent(over))).not.toThrow();
    expect(over.defaultPrevented).toBe(true);
    act(() => window.dispatchEvent(dragEvent("dragleave")));
    expect(utils.result.current).toBe(false);
  });

  test("非文件拖拽不触发遮罩也不 preventDefault", () => {
    const utils = setup();
    act(() => window.dispatchEvent(dragEvent("dragenter", ["text/plain"])));
    expect(utils.result.current).toBe(false);
    const over = dragEvent("dragover", ["text/plain"]);
    act(() => window.dispatchEvent(over));
    expect(over.defaultPrevented).toBe(false);
  });

  test("drop 收集文件并入队", async () => {
    const enqueue = vi.fn();
    mockCollect.mockResolvedValueOnce([new File(["x"], "drop.txt")]);
    const utils = setup(true, enqueue);
    act(() => window.dispatchEvent(dragEvent("dragenter")));
    await act(async () => {
      window.dispatchEvent(dragEvent("drop", ["Files"]));
    });
    expect(utils.result.current).toBe(false);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0][0][0].name).toBe("drop.txt");
  });

  test("drop 无文件不入队", async () => {
    const enqueue = vi.fn();
    setup(true, enqueue);
    await act(async () => {
      window.dispatchEvent(dragEvent("drop"));
    });
    expect(enqueue).not.toHaveBeenCalled();
  });

  test("active 关闭时重置遮罩与深度", () => {
    const utils = setup(true);
    act(() => window.dispatchEvent(dragEvent("dragenter")));
    expect(utils.result.current).toBe(true);
    act(() => utils.rerender({ active: false, enqueueToCwd: vi.fn() }));
    expect(utils.result.current).toBe(false);
    // 重新激活后计数从 0 开始
    act(() => utils.rerender({ active: true, enqueueToCwd: vi.fn() }));
    act(() => window.dispatchEvent(dragEvent("dragenter")));
    act(() => window.dispatchEvent(dragEvent("dragleave")));
    expect(utils.result.current).toBe(false);
  });

  test("多余 dragleave 不会把计数打成负数", () => {
    const utils = setup();
    act(() => window.dispatchEvent(dragEvent("dragleave")));
    expect(utils.result.current).toBe(false);
    act(() => window.dispatchEvent(dragEvent("dragenter")));
    act(() => window.dispatchEvent(dragEvent("dragleave")));
    expect(utils.result.current).toBe(false);
  });
});

describe("usePasteUpload", () => {
  function setup(enqueue = vi.fn(), onNotify = vi.fn()) {
    renderHook(() =>
      usePasteUpload({ active: true, enqueueToCwd: enqueue, onNotify })
    );
    return { enqueue, onNotify };
  }

  function pasteEvent(items: unknown[], target?: EventTarget) {
    const event = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", { value: { items } });
    Object.defineProperty(event, "target", { value: target ?? document.body });
    return event;
  }

  test("剪贴板文件入队；普通命名保留、无名图片盖时间戳", () => {
    const { enqueue, onNotify } = setup();
    const named = new File(["a"], "photo.jpg", { type: "image/jpeg" });
    const generic = new File(["b"], "image.png", { type: "image/png" });
    const items = [
      { kind: "string" },
      { kind: "file", getAsFile: () => null },
      { kind: "file", getAsFile: () => named },
      { kind: "file", getAsFile: () => generic },
    ];
    act(() => {
      window.dispatchEvent(pasteEvent(items));
    });
    expect(enqueue).toHaveBeenCalledTimes(1);
    const queued = enqueue.mock.calls[0][0] as File[];
    expect(queued[0].name).toBe("photo.jpg");
    expect(queued[1].name).not.toBe("image.png");
    expect(queued[1].type).toBe("image/png");
    expect(onNotify).toHaveBeenCalled();
  });

  test("无剪贴板数据 / 无文件 / 输入框聚焦时不动作", () => {
    const { enqueue } = setup();
    const noData = new Event("paste") as ClipboardEvent;
    act(() => window.dispatchEvent(noData));
    expect(enqueue).not.toHaveBeenCalled();

    act(() => window.dispatchEvent(pasteEvent([])));
    expect(enqueue).not.toHaveBeenCalled();

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    const file = new File(["a"], "a.png", { type: "image/png" });
    act(() => {
      window.dispatchEvent(
        pasteEvent([{ kind: "file", getAsFile: () => file }], input)
      );
    });
    expect(enqueue).not.toHaveBeenCalled();
    input.remove();
  });
});

describe("useUploadInputs / transferKeys", () => {
  test("cut 模式跳过同目录子项", async () => {
    mockFetchPath.mockResolvedValue([]);
    mockCopyPaste.mockResolvedValue(undefined);
    // "docs/x" 的 parent 是 "docs/"，与目标相同 → 跳过
    await transferKeys(["docs/x", "docs/y"], "docs/", "cut");
    expect(mockCopyPaste).not.toHaveBeenCalled();

    // 不同父目录则正常 MOVE
    await transferKeys(["other/a.txt"], "docs/", "cut");
    expect(mockCopyPaste).toHaveBeenCalledWith("other/a.txt", "docs/a.txt", true);
  });

  test("目标目录同名自动追加序号", async () => {
    mockFetchPath.mockResolvedValue([makeFile("a.txt")]);
    mockCopyPaste.mockResolvedValue(undefined);
    await transferKeys(["src/a.txt"], "", "copy");
    // 产品 uniqueName 首个重名编号跳过 (1) 直接用 (2)（见汇报观察）
    expect(mockCopyPaste).toHaveBeenCalledWith("src/a.txt", "a (2).txt", false);
  });

  test("fetchPath 失败按空目录处理", async () => {
    mockFetchPath.mockRejectedValue(new Error("boom"));
    mockCopyPaste.mockResolvedValue(undefined);
    await transferKeys(["a.txt"], "", "copy");
    expect(mockCopyPaste).toHaveBeenCalledWith("a.txt", "a.txt", false);
  });
});

describe("useUploadInputs takenForCwd", () => {
  function Probe({ cwd, list }: { cwd: string; list: FileItem[] }) {
    const { takenForCwd, enqueueToDir } = useUploadInputs({ cwd, files: list });
    return (
      <button onClick={() => enqueueToDir([new File(["x"], "dup.txt")], cwd, takenForCwd)}>
        enq
      </button>
    );
  }

  test("进行中任务占位名参与重名规避（renamed 入队）", () => {
    mockUploadEnqueueFn.mockReset();
    const task = {
      id: "t1",
      type: "upload",
      status: "in-progress",
      name: "dup.txt",
      basedir: "docs/",
      remoteKey: "docs/dup.txt",
      loaded: 0,
      total: 1,
    };
    mockUseTransferQueue.mockReturnValue([task]);
    render(<Probe cwd="docs/" list={[]} />);
    fireEvent.click(screen.getByText("enq"));
    const queued = mockUploadEnqueueFn.mock.calls[0] as Array<{
      file: File;
      basedir: string;
    }>;
    expect(queued[0].file.name).toBe("dup (2).txt");
    expect(queued[0].basedir).toBe("docs/");
  });

  test("canceled/completed 与非本目录任务不占名，非 upload 任务跳过", () => {
    mockUploadEnqueueFn.mockReset();
    mockUseTransferQueue.mockReturnValue([
      { id: "1", type: "download", status: "in-progress", name: "x", basedir: "docs/", remoteKey: "docs/x" },
      { id: "2", type: "upload", status: "canceled", name: "dup.txt", basedir: "docs/", remoteKey: "docs/dup.txt" },
      { id: "3", type: "upload", status: "completed", name: "dup.txt", basedir: "docs/", remoteKey: "docs/dup.txt" },
      { id: "4", type: "upload", status: "in-progress", name: "dup.txt", basedir: "other/", remoteKey: "other/dup.txt" },
    ]);
    render(<Probe cwd="docs/" list={[]} />);
    fireEvent.click(screen.getByText("enq"));
    const queued = mockUploadEnqueueFn.mock.calls[0] as Array<{
      file: File;
    }>;
    expect(queued[0].file.name).toBe("dup.txt");
  });

  test("remoteKey 不以 cwd 开头时回退 task.name 占位", () => {
    mockUploadEnqueueFn.mockReset();
    mockUseTransferQueue.mockReturnValue([
      { id: "5", type: "upload", status: "in-progress", name: "dup.txt", basedir: "docs/", remoteKey: "elsewhere/dup.txt" },
    ]);
    render(<Probe cwd="docs/" list={[]} />);
    fireEvent.click(screen.getByText("enq"));
    const queued = mockUploadEnqueueFn.mock.calls[0] as Array<{ file: File }>;
    expect(queued[0].file.name).toBe("dup (2).txt");
  });

  test("空入队列表不触发 uploadEnqueue", () => {
    mockUploadEnqueueFn.mockReset();
    mockUseTransferQueue.mockReturnValue([]);
    function EmptyProbe() {
      const { enqueueToDir } = useUploadInputs({ cwd: "", files: [] });
      return <button onClick={() => enqueueToDir([], "", [])}>empty</button>;
    }
    render(<EmptyProbe />);
    fireEvent.click(screen.getByText("empty"));
    expect(mockUploadEnqueueFn).not.toHaveBeenCalled();
  });
});
