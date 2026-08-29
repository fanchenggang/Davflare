/* eslint-disable react-hooks/exhaustive-deps */
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { processTransferTask } from "./transfer";
import { TransferTask } from "./types";

const CONCURRENCY = 2;
const AUTO_RETRY_MAX = 1;
const AUTO_RETRY_DELAY_MS = 3000;

interface EnqueueRequest {
  basedir: string;
  file: File;
}

interface TransferQueueActions {
  enqueue: (...requests: EnqueueRequest[]) => void;
  pause: (id: string) => void;
  resume: (id: string) => void;
  retry: (id: string) => void;
  cancel: (id: string) => void;
  remove: (id: string) => void;
  clearCompleted: () => void;
  clearFailed: () => void;
  pauseAll: () => void;
  resumeAll: () => void;
}

const TransferQueueContext = createContext<TransferTask[]>([]);
const TransferQueueGlobalPausedContext = createContext(false);
const TransferQueueActionsContext = createContext<TransferQueueActions>({
  enqueue: () => {},
  pause: () => {},
  resume: () => {},
  retry: () => {},
  cancel: () => {},
  remove: () => {},
  clearCompleted: () => {},
  clearFailed: () => {},
  pauseAll: () => {},
  resumeAll: () => {},
});

export function useTransferQueue() {
  return useContext(TransferQueueContext);
}

export function useTransferQueueGlobalPaused() {
  return useContext(TransferQueueGlobalPausedContext);
}

export function useTransferQueueActions() {
  return useContext(TransferQueueActionsContext);
}

export function useUploadEnqueue() {
  const { enqueue } = useTransferQueueActions();
  return enqueue;
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function TransferQueueProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [transferTasks, setTransferTasks] = useState<TransferTask[]>([]);
  const [globalPaused, setGlobalPaused] = useState(false);
  const tasksRef = useRef<TransferTask[]>([]);
  const runningRef = useRef<Set<string>>(new Set());
  const controllersRef = useRef<Map<string, AbortController>>(new Map());
  const pausedIdsRef = useRef<Set<string>>(new Set());
  const canceledIdsRef = useRef<Set<string>>(new Set());
  const globalPausedRef = useRef(false);
  const autoRetryRef = useRef<Map<string, number>>(new Map());

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    tasksRef.current = transferTasks;
  }, [transferTasks]);

  const commitTasks = (updater: (tasks: TransferTask[]) => TransferTask[]) => {
    setTransferTasks((tasks) => {
      const next = updater(tasks);
      tasksRef.current = next;
      return next;
    });
  };

  const updateTask = (id: string, patch: Partial<TransferTask>) => {
    commitTasks((tasks) =>
      tasks.map((task) => (task.id === id ? { ...task, ...patch } : task))
    );
  };

  const enqueue = (...requests: EnqueueRequest[]) => {
    const newTasks: TransferTask[] = requests.map(({ basedir, file }) => ({
      id: createId(),
      type: "upload",
      status: "pending",
      file,
      name: file.name,
      basedir,
      remoteKey: basedir + (file.webkitRelativePath || file.name),
      loaded: 0,
      total: file.size,
    }));
    commitTasks((tasks) => [...tasks, ...newTasks]);
  };

  const startTask = (task: TransferTask) => {
    if (runningRef.current.has(task.id)) return;

    const controller = new AbortController();
    runningRef.current.add(task.id);
    controllersRef.current.set(task.id, controller);
    tasksRef.current = tasksRef.current.map((item) =>
      item.id === task.id ? { ...item, status: "in-progress" } : item
    );
    updateTask(task.id, { status: "in-progress", error: undefined });

    const latest = tasksRef.current.find((item) => item.id === task.id) ?? task;
    processTransferTask({
      task: latest,
      signal: controller.signal,
      onTaskProgress: ({ loaded, total }) => {
        updateTask(task.id, { loaded, total });
      },
      onTaskState: (patch) => {
        updateTask(task.id, patch);
      },
    })
      .then(() => {
        autoRetryRef.current.delete(task.id);
        updateTask(task.id, { status: "completed" });
      })
      .catch((error: any) => {
        if (pausedIdsRef.current.has(task.id)) {
          updateTask(task.id, { status: "paused" });
          pausedIdsRef.current.delete(task.id);
        } else if (canceledIdsRef.current.has(task.id)) {
          updateTask(task.id, { status: "canceled" });
          canceledIdsRef.current.delete(task.id);
        } else {
          const message = error?.message || "上传失败";
          const staleUpload =
            Boolean(latest.uploadId) &&
            /nosuchupload|not found|no such upload|invalid/i.test(message);
          updateTask(task.id, {
            status: "failed",
            error: message,
            ...(staleUpload
              ? { uploadId: undefined, uploadedParts: undefined, loaded: 0 }
              : {}),
          });
          // 失败自动重试一次（3 秒后），期间用户手动重试会重置计数
          const attempts = autoRetryRef.current.get(task.id) || 0;
          if (attempts < AUTO_RETRY_MAX) {
            window.setTimeout(() => {
              const current = tasksRef.current.find(
                (item) => item.id === task.id
              );
              if (!current || current.status !== "failed") return;
              autoRetryRef.current.set(task.id, attempts + 1);
              updateTask(task.id, {
                status: "pending",
                error: undefined,
                loaded: current.uploadId ? current.loaded : 0,
              });
            }, AUTO_RETRY_DELAY_MS);
          }
        }
      })
      .finally(() => {
        runningRef.current.delete(task.id);
        controllersRef.current.delete(task.id);
      });
  };

  useEffect(() => {
    // 全局暂停时不派发新任务；已在传的任务由 pauseAll 显式暂停
    if (globalPausedRef.current) return;
    // Never recurse on the same pending task: startTask leaves status
    // "pending" in tasksRef until React commits updateTask. The old
    // recursive finder re-picked that task forever and overflowed the
    // stack, unmounting the whole tree (blank page) while XHR may or
    // may not have already left the browser (the two save failure modes).
    while (runningRef.current.size < CONCURRENCY) {
      const next = tasksRef.current.find(
        (task) =>
          task.status === "pending" && !runningRef.current.has(task.id)
      );
      if (!next) break;
      startTask(next);
    }
  }, [transferTasks]);

  const actions = useMemo<TransferQueueActions>(
    () => ({
      enqueue,
      pause: (id) => {
        pausedIdsRef.current.add(id);
        const controller = controllersRef.current.get(id);
        if (controller) {
          controller.abort();
        } else {
          updateTask(id, { status: "paused" });
          pausedIdsRef.current.delete(id);
        }
      },
      resume: (id) => {
        pausedIdsRef.current.delete(id);
        canceledIdsRef.current.delete(id);
        const current = tasksRef.current.find((item) => item.id === id);
        updateTask(id, {
          status: "pending",
          error: undefined,
          loaded: current?.uploadId ? current.loaded : 0,
        });
      },
      retry: (id) => {
        pausedIdsRef.current.delete(id);
        canceledIdsRef.current.delete(id);
        autoRetryRef.current.delete(id);
        const current = tasksRef.current.find((item) => item.id === id);
        updateTask(id, {
          status: "pending",
          error: undefined,
          loaded: current?.uploadId ? current.loaded : 0,
        });
      },
      pauseAll: () => {
        globalPausedRef.current = true;
        setGlobalPaused(true);
        for (const task of tasksRef.current) {
          if (task.type !== "upload") continue;
          if (task.status === "in-progress") {
            pausedIdsRef.current.add(task.id);
            controllersRef.current.get(task.id)?.abort();
          } else if (task.status === "pending") {
            updateTask(task.id, { status: "paused" });
          }
        }
      },
      resumeAll: () => {
        globalPausedRef.current = false;
        setGlobalPaused(false);
        for (const task of tasksRef.current) {
          if (task.type !== "upload" || task.status !== "paused") continue;
          pausedIdsRef.current.delete(task.id);
          canceledIdsRef.current.delete(task.id);
          updateTask(task.id, {
            status: "pending",
            error: undefined,
            loaded: task.uploadId ? task.loaded : 0,
          });
        }
      },
      cancel: (id) => {
        canceledIdsRef.current.add(id);
        const controller = controllersRef.current.get(id);
        if (controller) {
          controller.abort();
        } else {
          updateTask(id, { status: "canceled" });
          canceledIdsRef.current.delete(id);
        }
      },
      remove: (id) => {
        commitTasks((tasks) => tasks.filter((task) => task.id !== id));
      },
      clearCompleted: () => {
        commitTasks((tasks) =>
          tasks.filter(
            (task) => task.status !== "completed" && task.status !== "canceled"
          )
        );
      },
      clearFailed: () => {
        commitTasks((tasks) =>
          tasks.filter((task) => task.status !== "failed")
        );
      },
    }),
    []
  );

  return (
    <TransferQueueContext.Provider value={transferTasks}>
      <TransferQueueGlobalPausedContext.Provider value={globalPaused}>
        <TransferQueueActionsContext.Provider value={actions}>
          {children}
        </TransferQueueActionsContext.Provider>
      </TransferQueueGlobalPausedContext.Provider>
    </TransferQueueContext.Provider>
  );
}
