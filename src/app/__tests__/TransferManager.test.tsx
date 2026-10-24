import { vi, type Mock } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import TransferManager from "../../TransferManager";
import {
  useTransferQueue,
  useTransferQueueActions,
  useTransferQueueGlobalPaused,
} from "../transferQueue";
import { setLang, strings } from "../strings";
import { TransferTask } from "../types";

vi.mock("../transferQueue", () => ({
  useTransferQueue: vi.fn(),
  useTransferQueueActions: vi.fn(),
  useTransferQueueGlobalPaused: vi.fn(),
}));

const mockQueue = useTransferQueue as unknown as Mock;
const mockActionsHook = useTransferQueueActions as unknown as Mock;
const mockPaused = useTransferQueueGlobalPaused as unknown as Mock;

const failed: TransferTask = {
  id: "t1",
  type: "upload",
  status: "failed",
  name: "a.txt",
  basedir: "",
  remoteKey: "a.txt",
  loaded: 1,
  total: 10,
  error: "boom",
};

beforeEach(() => {
  setLang("zh");
  mockQueue.mockReset();
  mockActionsHook.mockReset();
  mockPaused.mockReset();
  mockPaused.mockReturnValue(false);
  mockActionsHook.mockReturnValue({
    retry: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    cancel: vi.fn(),
    pauseAll: vi.fn(),
    resumeAll: vi.fn(),
    clearFailed: vi.fn(),
    clearCompleted: vi.fn(),
  });
});

describe("TransferManager", () => {
  test("empty queue copy", () => {
    mockQueue.mockReturnValue([]);
    render(<TransferManager open onClose={vi.fn()} />);
    expect(screen.getByText(strings.noTransferTasks)).toBeInTheDocument();
  });

  test("failed task retry and cancel", () => {
    const actions = {
      retry: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      cancel: vi.fn(),
      pauseAll: vi.fn(),
      resumeAll: vi.fn(),
      clearFailed: vi.fn(),
      clearCompleted: vi.fn(),
    };
    mockActionsHook.mockReturnValue(actions);
    mockQueue.mockReturnValue([failed]);
    render(<TransferManager open onClose={vi.fn()} />);
    expect(screen.getByText("a.txt")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
    fireEvent.click(screen.getByText(strings.retry));
    expect(actions.retry).toHaveBeenCalledWith("t1");
    fireEvent.click(screen.getByText(strings.cancelTransfer));
    expect(actions.cancel).toHaveBeenCalledWith("t1");
  });

  test("download task shows downloading state without pause", () => {
    const download: TransferTask = {
      id: "d1",
      type: "download",
      status: "in-progress",
      name: "docs.zip",
      basedir: "",
      remoteKey: "/api/archive",
      downloadUrl: "/api/archive",
      saveAs: "docs.zip",
      loaded: 30,
      total: 0,
    };
    mockQueue.mockReturnValue([download]);
    render(<TransferManager open onClose={vi.fn()} />);
    expect(screen.getByText("docs.zip")).toBeInTheDocument();
    expect(screen.getByText(/下载中/)).toBeInTheDocument();
    // 下载不支持暂停；未知总量只展示已下载字节数
    expect(screen.queryByText(strings.pause)).not.toBeInTheDocument();
    expect(screen.getByText(/已下载/)).toBeInTheDocument();
  });

  test("pending task can pause or cancel", () => {
    const actions = {
      retry: vi.fn(), pause: vi.fn(), resume: vi.fn(), cancel: vi.fn(),
      pauseAll: vi.fn(), resumeAll: vi.fn(), clearFailed: vi.fn(), clearCompleted: vi.fn(),
    };
    mockActionsHook.mockReturnValue(actions);
    mockQueue.mockReturnValue([{ ...failed, id: "t2", status: "pending", error: undefined }]);
    render(<TransferManager open onClose={vi.fn()} />);
    expect(screen.getByText(/等待中/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(strings.pause));
    expect(actions.pause).toHaveBeenCalledWith("t2");
    fireEvent.click(screen.getByText(strings.cancelTransfer));
    expect(actions.cancel).toHaveBeenCalledWith("t2");
  });

  test("in-progress resumable task renders pause and cancel", () => {
    const actions = {
      retry: vi.fn(), pause: vi.fn(), resume: vi.fn(), cancel: vi.fn(),
      pauseAll: vi.fn(), resumeAll: vi.fn(), clearFailed: vi.fn(), clearCompleted: vi.fn(),
    };
    mockActionsHook.mockReturnValue(actions);
    mockQueue.mockReturnValue([
      { ...failed, id: "t3", status: "in-progress", error: undefined, uploadId: "u1", total: 100, loaded: 30 },
    ]);
    render(<TransferManager open onClose={vi.fn()} />);
    expect(screen.getByText(/分块上传中/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(strings.pause));
    expect(actions.pause).toHaveBeenCalledWith("t3");
  });

  test("paused task can resume", () => {
    const actions = {
      retry: vi.fn(), pause: vi.fn(), resume: vi.fn(), cancel: vi.fn(),
      pauseAll: vi.fn(), resumeAll: vi.fn(), clearFailed: vi.fn(), clearCompleted: vi.fn(),
    };
    mockActionsHook.mockReturnValue(actions);
    mockQueue.mockReturnValue([
      { ...failed, id: "t4", status: "paused", error: undefined, uploadId: "u2", total: 100, loaded: 40 },
    ]);
    render(<TransferManager open onClose={vi.fn()} />);
    fireEvent.click(screen.getByText(strings.resume));
    expect(actions.resume).toHaveBeenCalledWith("t4");
    fireEvent.click(screen.getByText(strings.cancelTransfer));
    expect(actions.cancel).toHaveBeenCalledWith("t4");
  });

  test("completed and canceled task states", () => {
    const actions = {
      retry: vi.fn(), pause: vi.fn(), resume: vi.fn(), cancel: vi.fn(),
      pauseAll: vi.fn(), resumeAll: vi.fn(), clearFailed: vi.fn(), clearCompleted: vi.fn(),
    };
    mockActionsHook.mockReturnValue(actions);
    mockQueue.mockReturnValue([
      { ...failed, id: "t5", status: "completed", error: undefined, total: 100, loaded: 100 },
      { ...failed, id: "t6", status: "canceled", error: undefined },
    ]);
    render(<TransferManager open onClose={vi.fn()} />);
    expect(screen.getAllByText(/已完成/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/已取消/).length).toBeGreaterThan(0);
    expect(screen.queryByText(strings.pause)).not.toBeInTheDocument();
    expect(screen.queryByText(strings.retry)).not.toBeInTheDocument();
  });

  test("global pause/resume and clear actions", () => {
    const actions = {
      retry: vi.fn(), pause: vi.fn(), resume: vi.fn(), cancel: vi.fn(),
      pauseAll: vi.fn(), resumeAll: vi.fn(), clearFailed: vi.fn(), clearCompleted: vi.fn(),
    };
    mockActionsHook.mockReturnValue(actions);
    mockPaused.mockReturnValue(true);
    mockQueue.mockReturnValue([
      { ...failed, id: "t7", status: "paused", error: undefined, total: 10, loaded: 5 },
    ]);
    render(<TransferManager open onClose={vi.fn()} />);
    fireEvent.click(screen.getByText(strings.resumedAll));
    expect(actions.resumeAll).toHaveBeenCalled();
    fireEvent.click(screen.getByText(strings.clearFailed));
    expect(actions.clearFailed).toHaveBeenCalled();
    fireEvent.click(screen.getByText(strings.clearCompleted));
    expect(actions.clearCompleted).toHaveBeenCalled();
  });

  test("speed sampling shows ETA for active upload", () => {
    vi.useFakeTimers();
    const task: TransferTask = {
      ...failed,
      id: "t8",
      status: "in-progress",
      error: undefined,
      uploadId: "u4",
      total: 100,
      loaded: 30,
    };
    mockQueue.mockReturnValue([task]);
    render(<TransferManager open onClose={vi.fn()} />);
    // 第一拍建立速度样本（prev 为空）
    act(() => { vi.advanceTimersByTime(700); });
    // 第二拍产生速度差并触发重绘
    task.loaded = 60;
    act(() => { vi.advanceTimersByTime(700); });
    expect(screen.getAllByText(/剩余/).length).toBeGreaterThan(0);
    // 任务离开 in-progress 后，第三拍清理速度样本
    task.status = "paused";
    act(() => { vi.advanceTimersByTime(700); });
    vi.useRealTimers();
  });

  test("unknown status falls back to raw status text", () => {
    const actions = {
      retry: vi.fn(), pause: vi.fn(), resume: vi.fn(), cancel: vi.fn(),
      pauseAll: vi.fn(), resumeAll: vi.fn(), clearFailed: vi.fn(), clearCompleted: vi.fn(),
    };
    mockActionsHook.mockReturnValue(actions);
    mockQueue.mockReturnValue([
      { ...failed, id: "t9", status: "unknown" as never, error: undefined },
    ]);
    render(<TransferManager open onClose={vi.fn()} />);
    expect(screen.getAllByText(/unknown/).length).toBeGreaterThan(0);
  });
});

test("status tabs filter tasks while totals still include the whole queue", () => {
  mockQueue.mockReturnValue([failed, {...failed,id:"p",name:"pending.txt",status:"pending",loaded:0}, {...failed,id:"done",name:"done.txt",status:"completed",loaded:10}, {...failed,id:"c",name:"canceled.txt",status:"canceled"}]);
  render(<TransferManager open onClose={vi.fn()} />);
  expect(screen.getByRole("tab", {name:"全部 (4)"})).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", {name:"失败 (1)"})); expect(screen.getByText("a.txt")).toBeInTheDocument(); expect(screen.queryByText("pending.txt")).not.toBeInTheDocument();
  expect(screen.getByText(/40.0 B/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", {name:"进行中 (1)"})); expect(screen.getByText("pending.txt")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", {name:"已完成 (1)"})); expect(screen.getByText("done.txt")).toBeInTheDocument(); expect(screen.queryByText("canceled.txt")).not.toBeInTheDocument();
});
test("bulk retry only retries failed snapshots once and allows a later failure to be retried", () => {
  const retry = vi.fn(); mockActionsHook.mockReturnValue({...mockActionsHook(),retry});
  const tasks = [failed,{...failed,id:"f2",name:"b.txt"},{...failed,id:"done",status:"completed"}];
  mockQueue.mockReturnValue(tasks);
  const view = render(<TransferManager open onClose={vi.fn()} />);
  fireEvent.click(screen.getByText(strings.retryAllFailed)); fireEvent.click(screen.getByText(strings.retryAllFailed));
  expect(retry.mock.calls).toEqual([["t1"],["f2"]]);
  mockQueue.mockReturnValue([{...failed}]); view.rerender(<TransferManager open onClose={vi.fn()} />);
  fireEvent.click(screen.getByText(strings.retryAllFailed)); expect(retry).toHaveBeenCalledTimes(3);
  fireEvent.click(screen.getByRole("tab", {name:"已完成 (0)"})); expect(screen.getByText(strings.noMatchingTransfers)).toBeInTheDocument();
});
