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
import { strings } from "./app/strings";

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

  const guide = [
    `地址：${webdavUrl}`,
    `用户名：${info?.username || "（未配置）"}`,
    "单次上传限制约 128MB，更大的文件请用网页端分块上传。",
    "macOS Finder：菜单「前往」→「连接服务器」，粘贴上述地址。",
    "密码与网页登录密码相同，此处不显示。",
    info?.publicRead
      ? "公开读取：已开启（未登录也可读取）。"
      : "公开读取：未开启（需要登录才能读取）。",
  ].join("\n");

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
            <Box
              sx={{
                p: 1.5,
                borderRadius: 2,
                backgroundColor: "background.default",
                border: "1px solid",
                borderColor: "divider",
              }}
            >
              <Typography
                variant="body2"
                sx={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}
              >
                {guide}
              </Typography>
              <Button
                size="small"
                startIcon={<ContentCopyIcon />}
                onClick={() => copy(guide, "完整说明")}
                sx={{ mt: 1 }}
              >
                {strings.copyWebDavGuide}
              </Button>
            </Box>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button
          startIcon={<ContentCopyIcon />}
          onClick={() => copy(guide, "完整说明")}
          disabled={loading}
        >
          {strings.copyWebDavGuide}
        </Button>
        <Button onClick={onClose}>关闭</Button>
      </DialogActions>
    </Dialog>
  );
}

export default WebDavPanel;
