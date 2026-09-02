import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

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
});
