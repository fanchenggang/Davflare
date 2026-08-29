/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useMemo, useState } from "react";
import { alpha, useTheme } from "@mui/material/styles";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
  useMediaQuery,
} from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import DownloadIcon from "@mui/icons-material/Download";
import EditIcon from "@mui/icons-material/Edit";
import ShareIcon from "@mui/icons-material/Share";

import { authFetch } from "./app/auth";
import {
  HighlightLang,
  highlightLangFor,
  LineToken,
  tokenizeForHighlight,
  tokensToLines,
} from "./app/highlight";
import { NotifyFn } from "./app/notify";
import {
  fileExtension,
  fileIconKind,
  isJsonFile,
  isMediaPreviewable,
  isTextPreviewable,
  mimeType,
  prettyJsonOrRaw,
  readResponseTextCapped,
  TEXT_PREVIEW_MAX_BYTES,
} from "./app/preview";
import { strings } from "./app/strings";
import { Z_INDEX } from "./app/theme";
import { FileItem } from "./app/types";
import { downloadFile } from "./app/transfer";
import { encodeKey, humanReadableSize } from "./app/utils";

const LINE_NUMBER_CAP = 2000;
const HIGHLIGHT_MAX_BYTES = 1024 * 1024;

// 亮暗两套 token 配色（对 surface.code 背景均满足可读性）
const TOKEN_COLORS = {
  light: {
    keyword: "#a626a4",
    string: "#50a14f",
    comment: "#9d9d99",
    number: "#986801",
  },
  dark: {
    keyword: "#c678dd",
    string: "#98c379",
    comment: "#7f848e",
    number: "#d19a66",
  },
} as const;

function TextPane({
  text,
  highlightLang,
}: {
  text: string;
  highlightLang: HighlightLang | null;
}) {
  const theme = useTheme();
  const mode = theme.palette.mode;
  const enabled =
    highlightLang !== null && text.length <= HIGHLIGHT_MAX_BYTES;

  const lines = useMemo(() => {
    if (!enabled) return null;
    try {
      return tokensToLines(text, tokenizeForHighlight(text, highlightLang));
    } catch {
      return null;
    }
  }, [enabled, highlightLang, text]);

  const plainLines = useMemo(() => text.split("\n"), [text]);
  const showGutter = plainLines.length <= LINE_NUMBER_CAP;
  const tokenColor = (kind: LineToken["kind"]) =>
    kind === "plain" ? undefined : TOKEN_COLORS[mode][kind];

  const renderLine = (line: LineToken[], index: number) =>
    line.length === 0 ? (
      <div key={index}>{"\u00a0"}</div>
    ) : (
      <div key={index}>
        {line.map((token, tokenIndex) =>
          token.kind === "plain" ? (
            <React.Fragment key={tokenIndex}>{token.text}</React.Fragment>
          ) : (
            <span key={tokenIndex} style={{ color: tokenColor(token.kind) }}>
              {token.text}
            </span>
          )
        )}
      </div>
    );

  return (
    <Box
      sx={{
        display: "flex",
        flex: 1,
        minHeight: 0,
        overflow: "auto",
        backgroundColor: "surface.code",
        borderTop: "1px solid",
        borderBottom: "1px solid",
        borderColor: "divider",
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
        fontSize: 13,
        lineHeight: 1.65,
        color: "surface.codeText",
        tabSize: 2,
      }}
    >
      {showGutter && (
        <Box
          aria-hidden
          sx={{
            flexShrink: 0,
            userSelect: "none",
            textAlign: "right",
            px: 1.5,
            py: 1.5,
            color: "text.secondary",
            borderRight: "1px solid",
            borderColor: "divider",
            minWidth: 48,
            backgroundColor: "surface.codeGutter",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {plainLines.map((_, index) => (
            <div key={index}>{index + 1}</div>
          ))}
        </Box>
      )}
      <Box
        component="pre"
        sx={{
          flex: 1,
          m: 0,
          px: 2,
          py: 1.5,
          textAlign: "left",
          whiteSpace: "pre-wrap",
          overflowWrap: "normal",
          wordBreak: "normal",
        }}
      >
        {lines
          ? lines.map(renderLine)
          : plainLines.map((line, index) => (
              <div key={index}>{line || "\u00a0"}</div>
            ))}
      </Box>
    </Box>
  );
}

function PreviewDialog({
  file,
  siblings = [],
  onSibling,
  onClose,
  onNotify,
  onShare,
  onRename,
  onDelete,
}: {
  file: FileItem | null;
  siblings?: FileItem[];
  onSibling?: (file: FileItem) => void;
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

  const index = file
    ? siblings.findIndex((item) => item.key === file.key)
    : -1;
  const hasPrev = Boolean(onSibling) && index > 0;
  const hasNext =
    Boolean(onSibling) && index >= 0 && index < siblings.length - 1;
  const showPager = siblings.length > 1 && Boolean(onSibling);

  const goSibling = (delta: number) => {
    if (!onSibling || index < 0) return;
    const next = index + delta;
    if (next < 0 || next >= siblings.length) return;
    onSibling(siblings[next]);
  };

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
          if (!canceled) {
            setTooLarge(true);
            setLargeSize(listedSize);
          }
          return;
        }
        const response = await authFetch("/webdav/" + encodeKey(file.key), {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("打开文件失败");
        if (asText) {
          const result = await readResponseTextCapped(response);
          if (canceled) return;
          if (!result.ok) {
            setTooLarge(true);
            setLargeSize(result.size);
            return;
          }
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

  useEffect(() => {
    if (!file || !showPager) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      goSibling(event.key === "ArrowLeft" ? -1 : 1);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [file, showPager, index, siblings, onSibling]);

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

  const closePreview = () => {
    onClose();
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  };

  const contentType = mimeType(file?.contentType);
  // 代码类文件启用轻量语法高亮（json/clike/hash 注释族）
  const highlightLang = useMemo<HighlightLang | null>(() => {
    if (!file) return null;
    const kind = fileIconKind(file);
    if (kind === "json") return "json";
    if (kind === "js" || kind === "css" || kind === "code" || kind === "shell") {
      return highlightLangFor(fileExtension(file.name));
    }
    return null;
  }, [file]);
  const isImage =
    contentType.startsWith("image/") && contentType !== "image/svg+xml";
  const isVideo = contentType.startsWith("video/");
  const isAudio = contentType.startsWith("audio/");
  const isPdf = contentType === "application/pdf";
  const showText =
    Boolean(file) &&
    !isImage &&
    !isVideo &&
    !isAudio &&
    !isPdf &&
    (tooLarge || text != null || (file ? isTextPreviewable(file) : false));

  const pagerButton = (side: "left" | "right") => {
    const prev = side === "left";
    const enabled = prev ? hasPrev : hasNext;
    if (!showPager) return null;
    return (
      <IconButton
        aria-label={prev ? strings.prevFile : strings.nextFile}
        disabled={!enabled}
        onClick={() => goSibling(prev ? -1 : 1)}
        sx={{
          position: "absolute",
          top: "50%",
          [side]: 8,
          transform: "translateY(-50%)",
          zIndex: Z_INDEX.previewPager,
          backgroundColor: (theme) => alpha(theme.palette.background.paper, 0.88),
          boxShadow: "0 2px 8px rgba(26,23,20,0.12)",
          "&:hover": { backgroundColor: "background.paper" },
          "&.Mui-disabled": { opacity: 0.3 },
        }}
      >
        {prev ? <ChevronLeftIcon /> : <ChevronRightIcon />}
      </IconButton>
    );
  };

  return (
    <Dialog
      open={Boolean(file)}
      onClose={closePreview}
      fullWidth
      fullScreen={isPhone}
      maxWidth="xl"
      transitionDuration={0}
      disableRestoreFocus
      PaperProps={{
        sx: {
          display: "flex",
          flexDirection: "column",
          height: isPhone ? "100%" : "92vh",
          maxHeight: isPhone ? "100%" : "92vh",
          width: isPhone ? "100%" : "96vw",
          maxWidth: isPhone ? "100%" : 1280,
          opacity: 1,
        },
      }}
      BackdropProps={{ transitionDuration: 0 }}
    >
      <DialogTitle
        sx={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          pr: 2,
          fontWeight: 700,
          pb: 1,
        }}
      >
        {file?.name}
        {file && !file.isDir && (
          <Typography
            component="span"
            variant="caption"
            color="text.secondary"
            sx={{ ml: 1.5, fontWeight: 500 }}
          >
            {humanReadableSize(file.size)}
            {showPager && index >= 0
              ? ` · ${index + 1}/${siblings.length}`
              : ""}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent
        sx={{
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          textAlign: showText ? "left" : "center",
          px: showText ? 0 : 2,
          py: showText ? 0 : 2,
          flex: 1,
          position: "relative",
        }}
      >
        {pagerButton("left")}
        {pagerButton("right")}
        {loading ? (
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              flex: 1,
              padding: 4,
            }}
          >
            <CircularProgress />
          </Box>
        ) : tooLarge ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              padding: 4,
              gap: 1.5,
            }}
          >
            <Typography variant="h6">文件过大，无法在线预览</Typography>
            <Typography color="text.secondary">
              大小 {humanReadableSize(largeSize || file?.size || 0)}，超过 2 MB
              限制。
            </Typography>
            <Button
              startIcon={<DownloadIcon />}
              onClick={download}
              variant="contained"
            >
              下载
            </Button>
          </Box>
        ) : text != null ? (
          <Box sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
            {jsonError && (
              <Alert severity="warning" sx={{ borderRadius: 0 }}>
                无法解析为 JSON，已显示原文
              </Alert>
            )}
            <TextPane text={text} highlightLang={highlightLang} />
          </Box>
        ) : url ? (
          isImage ? (
            <img
              src={url}
              alt={file?.name}
              onClick={() => setZoomed((prev) => !prev)}
              style={{
                maxWidth: zoomed ? "200%" : "100%",
                maxHeight: zoomed ? "200%" : "none",
                objectFit: "contain",
                cursor: zoomed ? "zoom-out" : "zoom-in",
                transition: "max-width 0.2s ease, max-height 0.2s ease",
                margin: "0 auto",
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
      <DialogActions sx={{ flexWrap: "wrap", gap: 0.5, px: 2, py: 1.25 }}>
        {showPager && (
          <>
            <Button disabled={!hasPrev} onClick={() => goSibling(-1)}>
              {strings.prevFile}
            </Button>
            <Button disabled={!hasNext} onClick={() => goSibling(1)}>
              {strings.nextFile}
            </Button>
          </>
        )}
        {text != null && (
          <Button startIcon={<ContentCopyIcon />} onClick={copyAll}>
            复制全文
          </Button>
        )}
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
        <Button onClick={closePreview}>关闭</Button>
      </DialogActions>
    </Dialog>
  );
}

export default PreviewDialog;
