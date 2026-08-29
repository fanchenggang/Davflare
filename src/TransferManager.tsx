import { useEffect, useRef, useState } from "react";
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/material";
import {
  Cancel as CancelIcon,
  CheckCircleOutline as CheckCircleOutlineIcon,
  ErrorOutline as ErrorOutlineIcon,
  Pause as PauseIcon,
  PauseCircle as PauseAllIcon,
  PlayArrow as PlayArrowIcon,
  PlayCircle as ResumeAllIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";

import { useTransferQueue, useTransferQueueActions, useTransferQueueGlobalPaused } from "./app/transferQueue";
import { TransferTask } from "./app/types";
import { formatEta, humanReadableSize, humanReadableSpeed } from "./app/utils";

function statusLabel(status: TransferTask["status"], resumable: boolean) {
  switch (status) {
    case "pending":
      return "等待中";
    case "in-progress":
      return resumable ? "分块上传中" : "上传中";
    case "paused":
      return resumable ? "已暂停，点「继续」从已上传分块续传" : "已暂停";
    case "failed":
      return resumable ? "失败，点「重试」可从断点续传" : "失败，可重试";
    case "completed":
      return "已完成";
    case "canceled":
      return "已取消";
    default:
      return status;
  }
}

interface SpeedSample {
  loaded: number;
  time: number;
  speed: number;
}

function TransferManager({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const transferQueue = useTransferQueue();
  const globalPaused = useTransferQueueGlobalPaused();
  const actions = useTransferQueueActions();
  const uploads = transferQueue.filter((task) => task.type === "upload");
  const [, setTick] = useState(0);
  const uploadsRef = useRef(uploads);
  uploadsRef.current = uploads;
  const speedRef = useRef<Map<string, SpeedSample>>(new Map());

  const total = uploads.reduce((sum, task) => sum + task.total, 0);
  const loaded = uploads.reduce((sum, task) => sum + task.loaded, 0);

  const activeCount = uploads.filter(
    (task) => task.status === "pending" || task.status === "in-progress"
  ).length;
  const pausedCount = uploads.filter((task) => task.status === "paused").length;

  // 每 700ms 采样一次进度差估算速度（EMA 平滑），供单任务与整体 ETA 展示
  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      let changed = false;
      const seen = new Set<string>();
      for (const task of uploadsRef.current) {
        if (task.status !== "in-progress") continue;
        seen.add(task.id);
        const prev = speedRef.current.get(task.id);
        if (!prev) {
          speedRef.current.set(task.id, {
            loaded: task.loaded,
            time: now,
            speed: 0,
          });
          continue;
        }
        const dt = (now - prev.time) / 1000;
        if (dt <= 0) continue;
        const instant = Math.max(0, task.loaded - prev.loaded) / dt;
        const smoothed = prev.speed > 0 ? prev.speed * 0.6 + instant * 0.4 : instant;
        speedRef.current.set(task.id, {
          loaded: task.loaded,
          time: now,
          speed: smoothed,
        });
        changed = true;
      }
      for (const id of Array.from(speedRef.current.keys())) {
        if (!seen.has(id)) {
          speedRef.current.delete(id);
          changed = true;
        }
      }
      if (changed) setTick((n) => n + 1);
    }, 700);
    return () => window.clearInterval(timer);
  }, [open]);

  const speedOf = (task: TransferTask) =>
    speedRef.current.get(task.id)?.speed ?? 0;

  const overallSpeed = uploads
    .filter((task) => task.status === "in-progress")
    .reduce((sum, task) => sum + speedOf(task), 0);
  const overallEta =
    overallSpeed > 0 ? formatEta((total - loaded) / overallSpeed) : "";

  const taskEtaText = (task: TransferTask) => {
    const speed = speedOf(task);
    if (task.status !== "in-progress" || speed <= 0) return "";
    const eta = formatEta((task.total - task.loaded) / speed);
    return eta ? ` · 剩余 ${eta}` : "";
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>上传任务</DialogTitle>
      <DialogContent sx={{ padding: 0 }}>
        {uploads.length === 0 ? (
          <Typography
            textAlign="center"
            color="text.secondary"
            sx={{ padding: 3 }}
          >
            暂无上传任务
          </Typography>
        ) : (
          <Stack spacing={2} sx={{ padding: 2 }}>
            <LinearProgress
              variant="determinate"
              value={total > 0 ? (loaded / total) * 100 : 0}
            />
            <Typography variant="body2" color="text.secondary">
              总进度：{humanReadableSize(loaded)} / {humanReadableSize(total)}
              {overallSpeed > 0 && taskStatusText(uploads, overallSpeed, overallEta)}
            </Typography>
            <Stack spacing={2}>
              {uploads.map((task) => {
                const resumable = Boolean(task.uploadId);
                const speed = humanReadableSpeed(speedOf(task));
                return (
                  <Stack
                    key={task.id}
                    spacing={0.75}
                    sx={{
                      padding: 1.5,
                      border: "1px solid",
                      borderColor: "divider",
                      borderRadius: 1,
                    }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center">
                      {task.status === "failed" && (
                        <ErrorOutlineIcon color="error" fontSize="small" />
                      )}
                      {task.status === "completed" && (
                        <CheckCircleOutlineIcon color="success" fontSize="small" />
                      )}
                      {task.status === "in-progress" && (
                        <CircularProgress size={16} />
                      )}
                      <Typography sx={{ flexGrow: 1 }} noWrap title={task.name}>
                        {task.name}
                      </Typography>
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      {humanReadableSize(task.loaded)} / {humanReadableSize(task.total)}
                      {speed ? ` · ${speed}` : ""}
                      {taskEtaText(task)}
                      {" · "}
                      {statusLabel(task.status, resumable)}
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={
                        task.total > 0 ? (task.loaded / task.total) * 100 : 0
                      }
                    />
                    {task.error && (
                      <Typography variant="caption" color="error">
                        {task.error}
                      </Typography>
                    )}
                    <Stack direction="row" spacing={1} flexWrap="wrap">
                      {task.status === "failed" && (
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<RefreshIcon />}
                          onClick={() => actions.retry(task.id)}
                        >
                          重试
                        </Button>
                      )}
                      {(task.status === "pending" ||
                        task.status === "in-progress") && (
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<PauseIcon />}
                          onClick={() => actions.pause(task.id)}
                        >
                          暂停
                        </Button>
                      )}
                      {task.status === "paused" && (
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<PlayArrowIcon />}
                          onClick={() => actions.resume(task.id)}
                        >
                          继续
                        </Button>
                      )}
                      {task.status !== "completed" &&
                        task.status !== "canceled" && (
                          <Button
                            size="small"
                            color="error"
                            startIcon={<CancelIcon />}
                            onClick={() => actions.cancel(task.id)}
                          >
                            取消
                          </Button>
                        )}
                    </Stack>
                  </Stack>
                );
              })}
            </Stack>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {uploads.length > 0 && (
          <Button
            startIcon={globalPaused ? <ResumeAllIcon /> : <PauseAllIcon />}
            onClick={globalPaused ? actions.resumeAll : actions.pauseAll}
            disabled={!globalPaused && activeCount === 0 && pausedCount === 0}
          >
            {globalPaused ? "全部继续" : "全部暂停"}
          </Button>
        )}
        <Button onClick={actions.clearFailed}>清除失败</Button>
        <Button onClick={actions.clearCompleted}>清除已完成</Button>
        <Button onClick={onClose}>关闭</Button>
      </DialogActions>
    </Dialog>
  );
}

function taskStatusText(
  uploads: TransferTask[],
  overallSpeed: number,
  overallEta: string
) {
  const speed = humanReadableSpeed(overallSpeed);
  const parts = [speed, overallEta ? `剩余 ${overallEta}` : ""].filter(Boolean);
  return parts.length ? ` · ${parts.join(" · ")}` : "";
}

export default TransferManager;
