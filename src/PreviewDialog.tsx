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
  Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import DownloadIcon from "@mui/icons-material/Download";
import EditIcon from "@mui/icons-material/Edit";
import ShareIcon from "@mui/icons-material/Share";

import { authFetch } from "./app/auth";
import { NotifyFn } from "./app/notify";
import { FileItem } from "./app/types";
import { encodeKey } from "./app/utils";

function PreviewDialog({
  file,
  onClose,
  onNotify,
  onShare,
  onRename,
  onDelete,
}: {
  file: FileItem | null;
  onClose: () => void;
  onNotify: NotifyFn;
  onShare: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!file) {
      setUrl(null);
      setZoomed(false);
      return;
    }

    let objectUrl: string | null = null;
    let canceled = false;
    setLoading(true);
    setUrl(null);

    authFetch(`/webdav/${encodeKey(file.key)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("打开文件失败");
        const blob = await response.blob();
        if (canceled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((error) => {
        if (!canceled) onNotify((error as Error).message, "error");
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });

    return () => {
      canceled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  const download = () => {
    if (!file) return;
    const a = document.createElement("a");
    a.href = url || `/webdav/${encodeKey(file.key)}`;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const contentType = file?.contentType || "";
  const isImage = contentType.startsWith("image/");
  const isVideo = contentType.startsWith("video/");
  const isAudio = contentType.startsWith("audio/");
  const isPdf = contentType === "application/pdf";

  return (
    <Dialog
      open={Boolean(file)}
      onClose={onClose}
      fullWidth
      maxWidth="lg"
      PaperProps={{ sx: { height: "90vh" } }}
    >
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between" }}>
        {file?.name}
      </DialogTitle>
      <DialogContent sx={{ overflow: "auto", textAlign: "center" }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", padding: 4 }}>
            <CircularProgress />
          </Box>
        ) : url ? (
          isImage ? (
            <img
              src={url}
              alt={file?.name}
              onClick={() => setZoomed((prev) => !prev)}
              style={{
                maxWidth: zoomed ? "200%" : "100%",
                maxHeight: zoomed ? "200%" : "100%",
                objectFit: "contain",
                cursor: zoomed ? "zoom-out" : "zoom-in",
                transition: "max-width 0.2s ease, max-height 0.2s ease",
              }}
            />
          ) : isVideo ? (
            <video src={url} controls style={{ maxWidth: "100%", maxHeight: "100%" }} />
          ) : isAudio ? (
            <audio src={url} controls style={{ width: "100%" }} />
          ) : isPdf ? (
            <iframe
              src={url}
              title={file?.name}
              style={{ width: "100%", height: "100%", border: "none" }}
            />
          ) : (
            <Typography>该文件类型暂不支持预览</Typography>
          )
        ) : null}
      </DialogContent>
      <DialogActions sx={{ flexWrap: "wrap", gap: 0.5 }}>
        <Button startIcon={<ShareIcon />} onClick={onShare}>
          分享
        </Button>
        <Button startIcon={<EditIcon />} onClick={onRename}>
          重命名
        </Button>
        <Button color="error" startIcon={<DeleteIcon />} onClick={onDelete}>
          删除
        </Button>
        <Button startIcon={<DownloadIcon />} onClick={download}>
          下载
        </Button>
        <Button onClick={onClose}>关闭</Button>
      </DialogActions>
    </Dialog>
  );
}

export default PreviewDialog;
