import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  Stack,
  Tooltip,
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
import { humanReadableSize } from "./app/utils";

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
            <List disablePadding>
              {uploads.map((task) => (
                <ListItem
                  key={task.id}
                  secondaryAction={
                    <Stack direction="row" spacing={0.5}>
                      {task.status === "failed" && (
                        <Tooltip title="重试">
                          <span>
                            <Button
                              size="small"
                              startIcon={<RefreshIcon />}
                              onClick={() => actions.retry(task.id)}
                            />
                          </span>
                        </Tooltip>
                      )}
                      {(task.status === "pending" ||
                        task.status === "in-progress") && (
                        <Tooltip title="暂停">
                          <span>
                            <Button
                              size="small"
                              startIcon={<PauseIcon />}
                              onClick={() => actions.pause(task.id)}
                            />
                          </span>
                        </Tooltip>
                      )}
                      {task.status === "paused" && (
                        <Tooltip title="继续">
                          <span>
                            <Button
                              size="small"
                              startIcon={<PlayArrowIcon />}
                              onClick={() => actions.resume(task.id)}
                            />
                          </span>
                        </Tooltip>
                      )}
                      {task.status !== "completed" &&
                        task.status !== "canceled" && (
                          <Tooltip title="取消">
                            <span>
                              <Button
                                size="small"
                                color="error"
                                startIcon={<CancelIcon />}
                                onClick={() => actions.cancel(task.id)}
                              />
                            </span>
                          </Tooltip>
                        )}
                    </Stack>
                  }
                >
                  <ListItemText
                    primary={task.name}
                    secondary={
                      <Stack spacing={0.5} sx={{ marginTop: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">
                          {humanReadableSize(task.loaded)} /{" "}
                          {humanReadableSize(task.total)}
                        </Typography>
                        <LinearProgress
                          variant="determinate"
                          value={
                            task.total > 0
                              ? (task.loaded / task.total) * 100
                              : 0
                          }
                        />
                        {task.error && (
                          <Typography variant="caption" color="error">
                            {task.error}
                          </Typography>
                        )}
                      </Stack>
                    }
                  />
                  {task.status === "failed" && (
                    <Tooltip title={task.error || "上传失败"}>
                      <ErrorOutlineIcon color="error" />
                    </Tooltip>
                  )}
                  {task.status === "completed" && (
                    <CheckCircleOutlineIcon color="success" />
                  )}
                  {task.status === "in-progress" && (
                    <CircularProgress size={20} />
                  )}
                </ListItem>
              ))}
            </List>
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
