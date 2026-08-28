/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
  useMediaQuery,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import DownloadIcon from "@mui/icons-material/Download";
import EditIcon from "@mui/icons-material/Edit";
import ShareIcon from "@mui/icons-material/Share";

import { authFetch } from "./app/auth";
import { NotifyFn } from "./app/notify";
import {
  isJsonFile,
  isMediaPreviewable,
  isTextPreviewable,
  mimeType,
  prettyJsonOrRaw,
  readResponseTextCapped,
  TEXT_PREVIEW_MAX_BYTES,
} from "./app/preview";
import { FileItem } from "./app/types";
import { downloadFile } from "./app/transfer";
import { encodeKey, humanReadableSize } from "./app/utils";

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
  const isPhone = useMediaQuery("(max-width:600px)");
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [tooLarge, setTooLarge] = useState(false);
  const [largeSize, setLargeSize] = useState(0);
  const [jsonError, setJsonError] = useState(false);

  useEffect(() => {
    if (!file) {
      setUrl(null);
      setText(null);
      setZoomed(false);
      setTooLarge(false);
      setLargeSize(0);
      setJsonError(false);
      return;
    }
    let objectUrl: string | null = null;
    let canceled = false;
    const controller = new AbortController();
    setLoading(true);
    setUrl(null);
    setText(null);
    setTooLarge(false);
    setLargeSize(0);
    setJsonError(false);
    setZoomed(false);

    const media = isMediaPreviewable(file);
    const asText = !media && isTextPreviewable(file);
    const listedSize = file.size || 0;
    const run = async () => {
      try {
        if (asText && listedSize > TEXT_PREVIEW_MAX_BYTES) {
          if (!canceled) { setTooLarge(true); setLargeSize(listedSize); }
          return;
        }
        const response = await authFetch("/webdav/" + encodeKey(file.key), { signal: controller.signal });
        if (!response.ok) throw new Error("打开文件失败");
        if (asText) {
          const result = await readResponseTextCapped(response);
          if (canceled) return;
          if (!result.ok) { setTooLarge(true); setLargeSize(result.size); return; }
          if (isJsonFile(file)) {
            const pretty = prettyJsonOrRaw(result.text);
            setText(pretty.text);
            setJsonError(pretty.parseError);
          } else {
            setText(result.text);
          }
          return;
        }
        const blob = await response.blob();
        if (canceled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch (error) {
        if (canceled || (error as Error).name === "AbortError") return;
        onNotify((error as Error).message, "error");
      } finally {
        if (!canceled) setLoading(false);
      }
    };
    run();
    return () => {
      canceled = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  const download = async () => {
    if (!file) return;
    try {
      if (text != null) {
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const href = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = href;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(href), 60_000);
        return;
      }
      if (url) {
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      }
      await downloadFile(file.key);
    } catch (error) {
      onNotify((error as Error).message, "error");
    }
  };

  const copyAll = async () => {
    if (text == null) return;
    try {
      await navigator.clipboard.writeText(text);
      onNotify("已复制全文", "success");
    } catch {
      onNotify("复制失败", "error");
    }
  };

  const contentType = mimeType(file?.contentType);
  const isImage = contentType.startsWith("image/") && contentType !== "image/svg+xml";
  const isVideo = contentType.startsWith("video/");
  const isAudio = contentType.startsWith("audio/");
  const isPdf = contentType === "application/pdf";
  const showText = Boolean(file) && !isImage && !isVideo && !isAudio && !isPdf && (tooLarge || text != null || (file ? isTextPreviewable(file) : false));

  return (
    <Dialog
      open={Boolean(file)}
      onClose={onClose}
      fullWidth
      fullScreen={isPhone}
      maxWidth="xl"
      PaperProps={{
        sx: {
          display: "flex",
          flexDirection: "column",
          height: isPhone ? "100%" : "92vh",
          maxHeight: isPhone ? "100%" : "92vh",
          width: isPhone ? "100%" : "96vw",
          maxWidth: isPhone ? "100%" : 1280,
        },
      }}
    >
      <DialogTitle sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", pr: 2, fontWeight: 600 }}>
        {file?.name}
      </DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", overflow: "hidden", textAlign: showText ? "left" : "center", px: showText ? 0 : 2, py: showText ? 0 : 2, flex: 1 }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1, padding: 4 }}>
            <CircularProgress />
          </Box>
        ) : tooLarge ? (
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, padding: 4, gap: 1.5 }}>
            <Typography variant="h6">文件过大，无法在线预览</Typography>
            <Typography color="text.secondary">大小 {humanReadableSize(largeSize || file?.size || 0)}，超过 2 MB 限制。</Typography>
            <Button startIcon={<DownloadIcon />} onClick={download} variant="contained">下载</Button>
          </Box>
        ) : text != null ? (
          <Box sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
            {jsonError && (
              <Alert severity="warning" sx={{ borderRadius: 0 }}>无法解析为 JSON，已显示原文</Alert>
            )}
            <Box component="pre" sx={{ flex: 1, m: 0, px: 2, py: 1.5, overflow: "auto", textAlign: "left", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: 13, lineHeight: 1.65, color: "#1f2328", backgroundColor: "#f6f8fa", whiteSpace: "pre-wrap", overflowWrap: "normal", wordBreak: "normal", tabSize: 2 }}>
              {text}
            </Box>
          </Box>
        ) : url ? (
          isImage ? (
            <img src={url} alt={file?.name} onClick={() => setZoomed((prev) => !prev)} style={{ maxWidth: zoomed ? "200%" : "100%", maxHeight: zoomed ? "200%" : "100%", objectFit: "contain", cursor: zoomed ? "zoom-out" : "zoom-in", transition: "max-width 0.2s ease, max-height 0.2s ease" }} />
          ) : isVideo ? (
            <video src={url} controls style={{ maxWidth: "100%", maxHeight: "100%" }} />
          ) : isAudio ? (
            <audio src={url} controls style={{ width: "100%" }} />
          ) : isPdf ? (
            <iframe src={url} title={file?.name} style={{ width: "100%", height: "100%", border: "none" }} />
          ) : (
            <Typography>该文件类型暂不支持预览</Typography>
          )
        ) : null}
      </DialogContent>
      <DialogActions sx={{ flexWrap: "wrap", gap: 0.5, px: 2, py: 1.25 }}>
        {text != null && (
          <Button startIcon={<ContentCopyIcon />} onClick={copyAll}>复制全文</Button>
        )}
        <Button startIcon={<ShareIcon />} onClick={onShare}>分享</Button>
        <Button startIcon={<EditIcon />} onClick={onRename}>重命名</Button>
        <Button color="error" startIcon={<DeleteIcon />} onClick={onDelete}>删除</Button>
        <Button startIcon={<DownloadIcon />} onClick={download}>下载</Button>
        <Button onClick={onClose}>关闭</Button>
      </DialogActions>
    </Dialog>
  );
}

export default PreviewDialog;
