/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";

import { authFetch } from "./app/auth";
import { NotifyFn } from "./app/notify";

interface WebDavInfo {
  username: string;
  publicRead: boolean;
}

function WebDavPanel({
  open,
  onClose,
  onNotify,
}: {
  open: boolean;
  onClose: () => void;
  onNotify: NotifyFn;
}) {
  const [info, setInfo] = useState<WebDavInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const webdavUrl = `${window.location.origin}/webdav`;

  useEffect(() => {
    if (!open) return;
    let canceled = false;
    setLoading(true);
    authFetch("/api/config")
      .then(async (response) => {
        if (!response.ok) throw new Error("无法读取 WebDAV 配置");
        const data = (await response.json()) as WebDavInfo;
        if (!canceled) setInfo(data);
      })
      .catch((error) => {
        if (!canceled) onNotify((error as Error).message, "error");
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [open]);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onNotify(`${label}已复制`, "success");
    } catch {
      onNotify("复制失败", "error");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>WebDAV 连接</DialogTitle>
      <DialogContent>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", padding: 3 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Stack spacing={2} sx={{ marginTop: 1 }}>
            <Box>
              <Typography variant="caption" color="text.secondary">
                地址
              </Typography>
              <Typography sx={{ wordBreak: "break-all" }}>{webdavUrl}</Typography>
              <Button
                size="small"
                startIcon={<ContentCopyIcon />}
                onClick={() => copy(webdavUrl, "地址")}
              >
                复制地址
              </Button>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                用户名
              </Typography>
              <Typography>{info?.username || "（未配置）"}</Typography>
              {info?.username && (
                <Button
                  size="small"
                  startIcon={<ContentCopyIcon />}
                  onClick={() => copy(info.username, "用户名")}
                >
                  复制用户名
                </Button>
              )}
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                公开读取
              </Typography>
              <Typography>
                {info?.publicRead
                  ? "已开启（未登录也可读取文件）"
                  : "未开启（需要登录才能读取）"}
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">
              密码与网页登录密码相同，此处不显示。单次 WebDAV
              上传请勿超过 Cloudflare 约 128MB 限制；更大的文件请用网页端分块上传。
            </Typography>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>关闭</Button>
      </DialogActions>
    </Dialog>
  );
}

export default WebDavPanel;
