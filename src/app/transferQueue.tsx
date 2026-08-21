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
}

const TransferQueueContext = createContext<TransferTask[]>([]);
const TransferQueueActionsContext = createContext<TransferQueueActions>({
  enqueue: () => {},
  pause: () => {},
  resume: () => {},
  retry: () => {},
  cancel: () => {},
  remove: () => {},
  clearCompleted: () => {},
  clearFailed: () => {},
});

export function useTransferQueue() {
  return useContext(TransferQueueContext);
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
  const tasksRef = useRef<TransferTask[]>([]);
  const runningRef = useRef<Set<string>>(new Set());
  const controllersRef = useRef<Map<string, AbortController>>(new Map());
  const pausedIdsRef = useRef<Set<string>>(new Set());
  const canceledIdsRef = useRef<Set<string>>(new Set());

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    tasksRef.current = transferTasks;
  }, [transferTasks]);

  const updateTask = (id: string, patch: Partial<TransferTask>) => {
    setTransferTasks((tasks) =>
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
    setTransferTasks((tasks) => [...tasks, ...newTasks]);
  };

  const startTask = (task: TransferTask) => {
    if (runningRef.current.has(task.id)) return;

    const controller = new AbortController();
    runningRef.current.add(task.id);
    controllersRef.current.set(task.id, controller);
    updateTask(task.id, { status: "in-progress", error: undefined });

    processTransferTask({
      task,
      signal: controller.signal,
      onTaskProgress: ({ loaded, total }) => {
        updateTask(task.id, { loaded, total });
      },
    })
      .then(() => {
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
          updateTask(task.id, {
            status: "failed",
            error: error?.message || "上传失败",
          });
        }
      })
      .finally(() => {
        runningRef.current.delete(task.id);
        controllersRef.current.delete(task.id);
      });
  };

  useEffect(() => {
    const startAvailable = () => {
      if (runningRef.current.size >= CONCURRENCY) return;
      const next = tasksRef.current.find(
        (task) => task.status === "pending"
      );
      if (!next) return;
      startTask(next);
      startAvailable();
    };
    startAvailable();
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
        updateTask(id, {
          status: "pending",
          error: undefined,
          loaded: 0,
        });
      },
      retry: (id) => {
        pausedIdsRef.current.delete(id);
        canceledIdsRef.current.delete(id);
        updateTask(id, {
          status: "pending",
          error: undefined,
          loaded: 0,
        });
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
        setTransferTasks((tasks) => tasks.filter((task) => task.id !== id));
      },
      clearCompleted: () => {
        setTransferTasks((tasks) =>
          tasks.filter(
            (task) => task.status !== "completed" && task.status !== "canceled"
          )
        );
      },
      clearFailed: () => {
        setTransferTasks((tasks) =>
          tasks.filter((task) => task.status !== "failed")
        );
      },
    }),
    []
  );

  return (
    <TransferQueueContext.Provider value={transferTasks}>
      <TransferQueueActionsContext.Provider value={actions}>
        {children}
      </TransferQueueActionsContext.Provider>
    </TransferQueueContext.Provider>
  );
}
