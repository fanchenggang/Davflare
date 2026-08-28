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
  PlayArrow as PlayArrowIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";

import { useTransferQueue, useTransferQueueActions } from "./app/transferQueue";
import { TransferStatus } from "./app/types";
import { humanReadableSize } from "./app/utils";

function statusLabel(status: TransferStatus, resumable: boolean) {
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

function TransferManager({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const transferQueue = useTransferQueue();
  const actions = useTransferQueueActions();
  const uploads = transferQueue.filter((task) => task.type === "upload");

  const total = uploads.reduce((sum, task) => sum + task.total, 0);
  const loaded = uploads.reduce((sum, task) => sum + task.loaded, 0);

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
            </Typography>
            <Stack spacing={2}>
              {uploads.map((task) => {
                const resumable = Boolean(task.uploadId);
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
        <Button onClick={actions.clearFailed}>清除失败</Button>
        <Button onClick={actions.clearCompleted}>清除已完成</Button>
        <Button onClick={onClose}>关闭</Button>
      </DialogActions>
    </Dialog>
  );
}

export default TransferManager;
