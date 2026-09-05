import React, { useRef } from "react";
import {
  Box,
  Divider,
  Drawer,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import {
  ContentCopy as CopyIcon,
  Delete as DeleteIcon,
  Download as DownloadIcon,
  DriveFileMove as MoveIcon,
  Edit as RenameIcon,
  Close as CloseIcon,
  Link as LinkIcon,
  Share as ShareIcon,
} from "@mui/icons-material";

import AuthThumbnail from "./AuthThumbnail";
import MimeIcon from "./MimeIcon";
import { NotifyFn } from "./app/notify";
import { FileIconKind, fileIconKind } from "./app/preview";
import { strings, translate } from "./app/strings";
import { MOTION, warmShadow } from "./app/theme";
import { downloadArchive, downloadFile } from "./app/transfer";
import { FileItem } from "./app/types";
import {
  encodeKey,
  errorMessage,
  formatDateTime,
  formatRelativeDateTime,
  humanReadableSize,
  isDirectory,
} from "./app/utils";

interface FileInfoSidebarProps {
  open: boolean;
  file: FileItem | null;
  onClose: () => void;
  onShare: (file: FileItem) => void;
  onRename: (file: FileItem) => void;
  onMove: (file: FileItem) => void;
  onDelete: (file: FileItem) => void;
  onNotify: NotifyFn;
}

// preview.ts 的 kind → strings 键：侧栏用中文名展示类型
const KIND_LABEL_KEY: Record<FileIconKind, string> = {
  folder: "kindFolder",
  image: "kindImage",
  video: "kindVideo",
  audio: "kindAudio",
  pdf: "kindPdf",
  zip: "kindZip",
  json: "kindJson",
  html: "kindHtml",
  css: "kindCss",
  js: "kindJs",
  code: "kindCode",
  text: "kindText",
  csv: "kindCsv",
  shell: "kindShell",
  slides: "kindSlides",
  ebook: "kindEbook",
  font: "kindFont",
  other: "kindOther",
};

function FileInfoSidebar({
  open,
  file,
  onClose,
  onShare,
  onRename,
  onMove,
  onDelete,
  onNotify,
}: FileInfoSidebarProps) {
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";

  // 关闭动效期间 file 已被置空：留住最后一次的 file，避免滑出时内容闪没
  const lastFileRef = useRef<FileItem | null>(null);
  if (file) lastFileRef.current = file;
  const shown = file ?? lastFileRef.current;

  if (!shown) return null;

  const kind = fileIconKind({
    name: shown.name,
    contentType: shown.contentType,
    isDir: shown.isDir,
  });
  // AuthThumbnail 需要 thumbnail digest；图片没有 digest 时退回类型图标
  const preview = shown.thumbnail && kind === "image" ? (
    <AuthThumbnail
      digest={shown.thumbnail}
      name={shown.name}
      contentType={shown.contentType}
      size={160}
    />
  ) : (
    <MimeIcon
      contentType={shown.contentType}
      name={shown.name}
      fontSize="large"
    />
  );

  const copyText = async (text: string, toast: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onNotify(toast, "success");
    } catch {
      onNotify(translate("copyFailed"), "error");
    }
  };

  const handleDownload = () => {
    (isDirectory(shown)
      ? downloadArchive([shown.key])
      : downloadFile(shown.key)
    ).catch((error) => onNotify(errorMessage(error), "error"));
  };

  // 与 transfer.ts 的 `${WEBDAV_ENDPOINT}${encodeKey(key)}` 同一拼法；
  // 根地址与 WebDavPanel 展示的一致（`${origin}/webdav`）
  const webdavLink = `${window.location.origin}/webdav/${encodeKey(shown.key)}`;

  const actions: Array<{
    key: string;
    label: string;
    icon: React.ReactNode;
    color?: "error";
    onClick: () => void;
  }> = [
    {
      key: "download",
      label: strings.download,
      icon: <DownloadIcon />,
      onClick: handleDownload,
    },
    {
      key: "share",
      label: strings.share,
      icon: <ShareIcon />,
      onClick: () => onShare(shown),
    },
    {
      key: "rename",
      label: strings.rename,
      icon: <RenameIcon />,
      onClick: () => onRename(shown),
    },
    {
      key: "move",
      label: strings.move,
      icon: <MoveIcon />,
      onClick: () => onMove(shown),
    },
    {
      key: "delete",
      label: strings.delete,
      icon: <DeleteIcon />,
      color: "error" as const,
      onClick: () => onDelete(shown),
    },
    {
      key: "copy-path",
      label: strings.detailsCopyPath,
      icon: <CopyIcon />,
      onClick: () => copyText(shown.key, translate("pathCopied")),
    },
    {
      key: "copy-link",
      label: strings.detailsCopyLink,
      icon: <LinkIcon />,
      onClick: () => copyText(webdavLink, translate("linkCopied")),
    },
  ];

  const metaRows: Array<{ label: string; value: React.ReactNode; mono?: boolean }> = [
    { label: strings.name, value: shown.name },
    { label: strings.detailsKind, value: strings[KIND_LABEL_KEY[kind]] },
    {
      label: strings.detailsSize,
      value: isDirectory(shown) ? "—" : humanReadableSize(shown.size),
    },
    {
      label: strings.detailsUploaded,
      value: (
        <Tooltip title={formatDateTime(shown.uploaded)} enterDelay={400}>
          <span>{formatRelativeDateTime(shown.uploaded)}</span>
        </Tooltip>
      ),
    },
    {
      label: strings.detailsPath,
      value: shown.key,
      mono: true,
    },
  ];

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: "100vw", sm: 345 },
          maxWidth: "100vw",
          display: "flex",
          flexDirection: "column",
          padding: 2.5,
          gap: 2,
          borderTopLeftRadius: 16,
          borderBottomLeftRadius: 16,
          boxShadow: `${warmShadow(dark, "0 12px 32px", 0.22)}, ${warmShadow(
            dark,
            "0 2px 8px",
            0.14
          )}`,
        },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Typography variant="h6">{strings.detailsTitle}</Typography>
        <IconButton aria-label={strings.close} onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 2,
          borderRadius: 2,
          backgroundColor: "background.default",
          border: "1px solid",
          borderColor: "divider",
        }}
      >
        {preview}
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.5 }}>
        {actions.map((action) => (
          <Tooltip key={action.key} title={action.label}>
            <IconButton
              aria-label={action.label}
              size="small"
              color={action.color}
              onClick={action.onClick}
              sx={{
                transition: `background-color ${MOTION.fast}ms ease`,
              }}
            >
              {action.icon}
            </IconButton>
          </Tooltip>
        ))}
      </Box>

      <Divider />

      <Stack spacing={1.25} sx={{ overflowY: "auto", minHeight: 0 }}>
        {metaRows.map((row) => (
          <Box key={row.label}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              {row.label}
            </Typography>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
                wordBreak: "break-all",
                ...(row.mono
                  ? { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }
                  : {}),
              }}
            >
              {row.value}
            </Typography>
          </Box>
        ))}
      </Stack>
    </Drawer>
  );
}

export default FileInfoSidebar;
