import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

import TransferManager from "../../TransferManager";
import {
  useTransferQueue,
  useTransferQueueActions,
  useTransferQueueGlobalPaused,
} from "../transferQueue";
import { setLang, strings } from "../strings";
import { TransferTask } from "../types";

jest.mock("../transferQueue", () => ({
  useTransferQueue: jest.fn(),
  useTransferQueueActions: jest.fn(),
  useTransferQueueGlobalPaused: jest.fn(),
}));

const mockQueue = useTransferQueue as unknown as jest.Mock;
const mockActionsHook = useTransferQueueActions as unknown as jest.Mock;
const mockPaused = useTransferQueueGlobalPaused as unknown as jest.Mock;

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
    retry: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    cancel: jest.fn(),
    pauseAll: jest.fn(),
    resumeAll: jest.fn(),
    clearFailed: jest.fn(),
    clearCompleted: jest.fn(),
  });
});

describe("TransferManager", () => {
  test("empty queue copy", () => {
    mockQueue.mockReturnValue([]);
    render(<TransferManager open onClose={jest.fn()} />);
    expect(screen.getByText(strings.noUploadTasks)).toBeInTheDocument();
  });

  test("failed task retry and cancel", () => {
    const actions = {
      retry: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      cancel: jest.fn(),
      pauseAll: jest.fn(),
      resumeAll: jest.fn(),
      clearFailed: jest.fn(),
      clearCompleted: jest.fn(),
    };
    mockActionsHook.mockReturnValue(actions);
    mockQueue.mockReturnValue([failed]);
    render(<TransferManager open onClose={jest.fn()} />);
    expect(screen.getByText("a.txt")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
    fireEvent.click(screen.getByText(strings.retry));
    expect(actions.retry).toHaveBeenCalledWith("t1");
    fireEvent.click(screen.getByText(strings.delete));
    expect(actions.cancel).toHaveBeenCalledWith("t1");
  });

  test("pending task can pause or cancel", () => {
    const actions = {
      retry: jest.fn(), pause: jest.fn(), resume: jest.fn(), cancel: jest.fn(),
      pauseAll: jest.fn(), resumeAll: jest.fn(), clearFailed: jest.fn(), clearCompleted: jest.fn(),
    };
    mockActionsHook.mockReturnValue(actions);
    mockQueue.mockReturnValue([{ ...failed, id: "t2", status: "pending", error: undefined }]);
    render(<TransferManager open onClose={jest.fn()} />);
    expect(screen.getByText(/等待中/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(strings.pause));
    expect(actions.pause).toHaveBeenCalledWith("t2");
    fireEvent.click(screen.getByText(strings.delete));
    expect(actions.cancel).toHaveBeenCalledWith("t2");
  });

  test("in-progress resumable task renders pause and cancel", () => {
    const actions = {
      retry: jest.fn(), pause: jest.fn(), resume: jest.fn(), cancel: jest.fn(),
      pauseAll: jest.fn(), resumeAll: jest.fn(), clearFailed: jest.fn(), clearCompleted: jest.fn(),
    };
    mockActionsHook.mockReturnValue(actions);
    mockQueue.mockReturnValue([
      { ...failed, id: "t3", status: "in-progress", error: undefined, uploadId: "u1", total: 100, loaded: 30 },
    ]);
    render(<TransferManager open onClose={jest.fn()} />);
    expect(screen.getByText(/分块上传中/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(strings.pause));
    expect(actions.pause).toHaveBeenCalledWith("t3");
  });

  test("paused task can resume", () => {
    const actions = {
      retry: jest.fn(), pause: jest.fn(), resume: jest.fn(), cancel: jest.fn(),
      pauseAll: jest.fn(), resumeAll: jest.fn(), clearFailed: jest.fn(), clearCompleted: jest.fn(),
    };
    mockActionsHook.mockReturnValue(actions);
    mockQueue.mockReturnValue([
      { ...failed, id: "t4", status: "paused", error: undefined, uploadId: "u2", total: 100, loaded: 40 },
    ]);
    render(<TransferManager open onClose={jest.fn()} />);
    fireEvent.click(screen.getByText(strings.resume));
    expect(actions.resume).toHaveBeenCalledWith("t4");
    fireEvent.click(screen.getByText(strings.delete));
    expect(actions.cancel).toHaveBeenCalledWith("t4");
  });

  test("completed and canceled task states", () => {
    const actions = {
      retry: jest.fn(), pause: jest.fn(), resume: jest.fn(), cancel: jest.fn(),
      pauseAll: jest.fn(), resumeAll: jest.fn(), clearFailed: jest.fn(), clearCompleted: jest.fn(),
    };
    mockActionsHook.mockReturnValue(actions);
    mockQueue.mockReturnValue([
      { ...failed, id: "t5", status: "completed", error: undefined, total: 100, loaded: 100 },
      { ...failed, id: "t6", status: "canceled", error: undefined },
    ]);
    render(<TransferManager open onClose={jest.fn()} />);
    expect(screen.getAllByText(/已完成/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/已取消/).length).toBeGreaterThan(0);
    expect(screen.queryByText(strings.pause)).not.toBeInTheDocument();
    expect(screen.queryByText(strings.retry)).not.toBeInTheDocument();
  });

  test("global pause/resume and clear actions", () => {
    const actions = {
      retry: jest.fn(), pause: jest.fn(), resume: jest.fn(), cancel: jest.fn(),
      pauseAll: jest.fn(), resumeAll: jest.fn(), clearFailed: jest.fn(), clearCompleted: jest.fn(),
    };
    mockActionsHook.mockReturnValue(actions);
    mockPaused.mockReturnValue(true);
    mockQueue.mockReturnValue([
      { ...failed, id: "t7", status: "paused", error: undefined, total: 10, loaded: 5 },
    ]);
    render(<TransferManager open onClose={jest.fn()} />);
    fireEvent.click(screen.getByText(strings.resumedAll));
    expect(actions.resumeAll).toHaveBeenCalled();
    fireEvent.click(screen.getByText(strings.clearFailed));
    expect(actions.clearFailed).toHaveBeenCalled();
    fireEvent.click(screen.getByText(strings.clearCompleted));
    expect(actions.clearCompleted).toHaveBeenCalled();
  });

  test("speed sampling shows ETA for active upload", () => {
    jest.useFakeTimers();
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
    render(<TransferManager open onClose={jest.fn()} />);
    // 第一拍建立速度样本（prev 为空）
    act(() => { jest.advanceTimersByTime(700); });
    // 第二拍产生速度差并触发重绘
    task.loaded = 60;
    act(() => { jest.advanceTimersByTime(700); });
    expect(screen.getAllByText(/剩余/).length).toBeGreaterThan(0);
    // 任务离开 in-progress 后，第三拍清理速度样本
    task.status = "paused";
    act(() => { jest.advanceTimersByTime(700); });
    jest.useRealTimers();
  });

  test("unknown status falls back to raw status text", () => {
    const actions = {
      retry: jest.fn(), pause: jest.fn(), resume: jest.fn(), cancel: jest.fn(),
      pauseAll: jest.fn(), resumeAll: jest.fn(), clearFailed: jest.fn(), clearCompleted: jest.fn(),
    };
    mockActionsHook.mockReturnValue(actions);
    mockQueue.mockReturnValue([
      { ...failed, id: "t9", status: "unknown" as never, error: undefined },
    ]);
    render(<TransferManager open onClose={jest.fn()} />);
    expect(screen.getAllByText(/unknown/).length).toBeGreaterThan(0);
  });
});
