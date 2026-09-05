import { act, renderHook } from "@testing-library/react";

import { processTransferTask } from "../transfer";
import {
  TransferQueueProvider,
  useTransferQueue,
  useTransferQueueActions,
  useUploadEnqueue,
} from "../transferQueue";

jest.mock("../transfer", () => ({
  processTransferTask: jest.fn(),
}));

// jest.mock 已替换模块实现；这里只借用其类型拿到 mock 断言能力
const mockProcess = processTransferTask as unknown as jest.Mock;

function makeFile(name: string, size = 10) {
  return new File([new ArrayBuffer(size)], name, { type: "text/plain" });
}

function useQueue() {
  const tasks = useTransferQueue();
  const actions = useTransferQueueActions();
  return { tasks, actions };
}

// 排空 Promise 微任务队列，让 startTask 的 then/catch/finally 链跑完
async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

// signal-aware 的挂起实现：abort 后 reject（模拟真实上传对取消/暂停的响应）
function hangUntilAborted({ signal }: { signal?: AbortSignal }) {
  return new Promise((_resolve, reject) => {
    const abortError = () => reject(new DOMException("Aborted", "AbortError"));
    if (signal?.aborted) {
      abortError();
      return;
    }
    signal?.addEventListener("abort", abortError);
  });
}

describe("transferQueue 状态机", () => {
  beforeEach(() => {
    mockProcess.mockReset();
    mockProcess.mockImplementation(hangUntilAborted);
    localStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("enqueue 生成任务并携带元数据，effect 立即派发", async () => {
    const { result } = renderHook(useQueue, { wrapper: TransferQueueProvider });
    act(() => {
      result.current.actions.enqueue({
        basedir: "docs/",
        file: makeFile("a.txt", 42),
      });
    });
    await flushMicrotasks();
    expect(result.current.tasks).toHaveLength(1);
    const [task] = result.current.tasks;
    expect(task.status).toBe("in-progress");
    expect(task.name).toBe("a.txt");
    expect(task.remoteKey).toBe("docs/a.txt");
    expect(task.total).toBe(42);
    expect(task.loaded).toBe(0);
    expect(mockProcess).toHaveBeenCalledTimes(1);
  });

  test("并发上限 2：前两个 in-progress，第三个等待；完成一个后补位", async () => {
    let releaseFirst: (value?: unknown) => void = () => {};
    mockProcess
      .mockImplementationOnce(() => new Promise((r) => (releaseFirst = r)))
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockImplementationOnce(() => Promise.resolve());

    const { result } = renderHook(useQueue, { wrapper: TransferQueueProvider });
    act(() => {
      result.current.actions.enqueue(
        { basedir: "f/", file: makeFile("1.txt") },
        { basedir: "f/", file: makeFile("2.txt") },
        { basedir: "f/", file: makeFile("3.txt") }
      );
    });
    await flushMicrotasks();
    expect(mockProcess).toHaveBeenCalledTimes(2);
    expect(
      result.current.tasks.filter((t) => t.status === "in-progress")
    ).toHaveLength(2);
    expect(
      result.current.tasks.filter((t) => t.status === "pending")
    ).toHaveLength(1);

    act(() => {
      releaseFirst();
    });
    await flushMicrotasks();
    expect(mockProcess).toHaveBeenCalledTimes(3);
    const byName = (name: string) =>
      result.current.tasks.find((t) => t.name === name)!.status;
    expect(byName("1.txt")).toBe("completed");
    expect(byName("2.txt")).toBe("in-progress");
    expect(byName("3.txt")).toBe("completed");
  });

  test("失败后 3 秒自动重试一次，重试成功即完成", async () => {
    jest.useFakeTimers();
    mockProcess
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(undefined);

    const { result } = renderHook(useQueue, { wrapper: TransferQueueProvider });
    act(() => {
      result.current.actions.enqueue({ basedir: "f/", file: makeFile("r.txt") });
    });
    await flushMicrotasks();
    expect(result.current.tasks[0].status).toBe("failed");
    expect(result.current.tasks[0].error).toBe("boom");

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    await flushMicrotasks();
    // 自动重试把任务放回队列并跑完
    expect(result.current.tasks[0].status).toBe("completed");
    // 只重试一次：共两次调用（首次 + 重试）
    expect(mockProcess).toHaveBeenCalledTimes(2);
  });

  test("手动 retry 立即重新入队", async () => {
    mockProcess
      .mockRejectedValueOnce(new Error("nope"))
      .mockResolvedValueOnce(undefined);

    const { result } = renderHook(useQueue, { wrapper: TransferQueueProvider });
    act(() => {
      result.current.actions.enqueue({ basedir: "f/", file: makeFile("m.txt") });
    });
    await flushMicrotasks();
    expect(result.current.tasks[0].status).toBe("failed");

    act(() => {
      result.current.actions.retry(result.current.tasks[0].id);
    });
    await flushMicrotasks();
    expect(result.current.tasks[0].status).toBe("completed");
    expect(result.current.tasks[0].error).toBeUndefined();
  });

  test("pauseAll 暂停全部（含进行中），resumeAll 全部重新排队", async () => {
    const { result } = renderHook(useQueue, { wrapper: TransferQueueProvider });
    act(() => {
      result.current.actions.enqueue(
        { basedir: "f/", file: makeFile("1.txt") },
        { basedir: "f/", file: makeFile("2.txt") },
        { basedir: "f/", file: makeFile("3.txt") }
      );
    });
    await flushMicrotasks();
    expect(mockProcess).toHaveBeenCalledTimes(2);

    act(() => {
      result.current.actions.pauseAll();
    });
    await flushMicrotasks();
    expect(
      result.current.tasks.every((t) => t.status === "paused")
    ).toBe(true);

    act(() => {
      result.current.actions.resumeAll();
    });
    await flushMicrotasks();
    // 并发上限内重新派发两个，第三个保持 pending
    const statuses = result.current.tasks.map((t) => t.status).sort();
    expect(statuses).toEqual(["in-progress", "in-progress", "pending"]);
    // 首轮 2 次 + resumeAll 后补发 2 次
    expect(mockProcess).toHaveBeenCalledTimes(4);
  });

  test("cancel 标记取消；remove/clearCompleted 清理任务", async () => {
    const { result } = renderHook(useQueue, { wrapper: TransferQueueProvider });
    act(() => {
      result.current.actions.enqueue(
        { basedir: "f/", file: makeFile("1.txt") },
        { basedir: "f/", file: makeFile("2.txt") }
      );
    });
    await flushMicrotasks();
    const firstId = result.current.tasks[0].id;

    act(() => {
      result.current.actions.cancel(firstId);
    });
    await flushMicrotasks();
    expect(result.current.tasks[0].status).toBe("canceled");

    act(() => {
      result.current.actions.remove(firstId);
    });
    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0].name).toBe("2.txt");

    act(() => {
      result.current.actions.cancel(result.current.tasks[0].id);
    });
    await flushMicrotasks();
    act(() => {
      result.current.actions.clearCompleted();
    });
    // canceled 与 completed 一并清除
    expect(result.current.tasks).toHaveLength(0);
  });

  test("pause/resume/cancel on non-running pending tasks and clearFailed", async () => {
    const { result } = renderHook(useQueue, { wrapper: TransferQueueProvider });
    // 前两个占满并发，第三个保持 pending；pauseAll 会把 pending 标成 paused（无 controller）
    act(() => {
      result.current.actions.enqueue(
        { basedir: "f/", file: makeFile("1.txt") },
        { basedir: "f/", file: makeFile("2.txt") },
        { basedir: "f/", file: makeFile("3.txt") }
      );
    });
    await flushMicrotasks();
    expect(mockProcess).toHaveBeenCalledTimes(2);

    act(() => {
      result.current.actions.pauseAll();
    });
    await flushMicrotasks();
    const pendingId = result.current.tasks[2].id;
    expect(result.current.tasks[2].status).toBe("paused");

    // 对已经 paused、没有 controller 的任务再 pause/cancel，走无 controller 分支
    act(() => {
      result.current.actions.pause(pendingId);
    });
    act(() => {
      result.current.actions.resume(pendingId);
    });
    expect(result.current.tasks[2].status).toBe("pending");

    act(() => {
      result.current.actions.cancel(pendingId);
    });
    expect(result.current.tasks[2].status).toBe("canceled");

    act(() => {
      result.current.actions.clearCompleted();
    });
    expect(result.current.tasks).toHaveLength(2);
  });

  test("clearFailed removes failed tasks", async () => {
    mockProcess.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(useQueue, { wrapper: TransferQueueProvider });
    act(() => {
      result.current.actions.enqueue({ basedir: "f/", file: makeFile("x.txt") });
    });
    await flushMicrotasks();
    expect(result.current.tasks[0].status).toBe("failed");
    act(() => {
      result.current.actions.clearFailed();
    });
    expect(result.current.tasks).toHaveLength(0);
  });

  test("useUploadEnqueue returns enqueue action", async () => {
    const { result } = renderHook(useUploadEnqueue, {
      wrapper: TransferQueueProvider,
    });
    act(() => {
      result.current({ basedir: "f/", file: makeFile("u.txt") });
    });
    await flushMicrotasks();
    expect(result.current).toEqual(expect.any(Function));
    expect(mockProcess).toHaveBeenCalledTimes(1);
  });

  test("pause running task aborts its controller", async () => {
    const { result } = renderHook(useQueue, { wrapper: TransferQueueProvider });
    act(() => {
      result.current.actions.enqueue({ basedir: "f/", file: makeFile("p.txt") });
    });
    await flushMicrotasks();
    const id = result.current.tasks[0].id;
    expect(result.current.tasks[0].status).toBe("in-progress");
    act(() => {
      result.current.actions.pause(id);
    });
    await flushMicrotasks();
    expect(result.current.tasks[0].status).toBe("paused");
  });

  test("progress and state callbacks update task", async () => {
    mockProcess.mockImplementation(({ onTaskProgress, onTaskState }: any) => {
      onTaskProgress?.({ loaded: 5, total: 10 });
      onTaskState?.({ uploadId: "u-callback" });
      return Promise.resolve();
    });
    const { result } = renderHook(useQueue, { wrapper: TransferQueueProvider });
    act(() => {
      result.current.actions.enqueue({ basedir: "f/", file: makeFile("c.txt") });
    });
    await flushMicrotasks();
    expect(result.current.tasks[0].loaded).toBe(5);
    expect(result.current.tasks[0].uploadId).toBe("u-callback");
    expect(result.current.tasks[0].status).toBe("completed");
  });
});
