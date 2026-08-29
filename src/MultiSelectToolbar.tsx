import React from "react";
import { Button, Slide, Toolbar, Typography } from "@mui/material";

import { Z_INDEX } from "./app/theme";
import {
  Close as CloseIcon,
  ContentCopy as CopyIcon,
  ContentCut as CutIcon,
  Delete as DeleteIcon,
  Download as DownloadIcon,
  DriveFileMove as MoveIcon,
  Edit as RenameIcon,
  SelectAll as SelectAllIcon,
  Share as ShareIcon,
} from "@mui/icons-material";

function ActionButton({
  icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      color="inherit"
      size="small"
      disabled={disabled}
      onClick={onClick}
      sx={{ minWidth: 0, flexDirection: "column", gap: 0.25 }}
    >
      {icon}
      <Typography variant="caption" sx={{ textTransform: "none" }}>
        {label}
      </Typography>
    </Button>
  );
}

function MultiSelectToolbar({
  selectedKeys,
  onClose,
  onSelectAll,
  onDownload,
  onRename,
  onDelete,
  onShare,
  onCopy,
  onCut,
  onMove,
}: {
  selectedKeys: string[];
  onClose: () => void;
  onSelectAll: () => void;
  onDownload: () => void;
  onRename: () => void;
  onDelete: () => void;
  onShare: () => void;
  onCopy: () => void;
  onCut: () => void;
  onMove: () => void;
}) {
  const count = selectedKeys.length;

  return (
    <Slide direction="up" in={count > 0}>
      <Toolbar
        sx={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: Z_INDEX.multiSelectToolbar,
          backgroundColor: (theme) => theme.palette.background.paper,
          borderTop: "1px solid",
          borderColor: "divider",
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
          boxShadow: "0 -8px 24px rgba(26, 23, 20, 0.08)",
          justifyContent: "space-evenly",
          overflowX: "auto",
          gap: 0.5,
        }}
      >
        <ActionButton icon={<CloseIcon />} label="关闭" onClick={onClose} />
        <ActionButton
          icon={<SelectAllIcon />}
          label={`${count} 项`}
          onClick={onSelectAll}
        />
        <ActionButton
          icon={<CopyIcon />}
          label="复制"
          disabled={count === 0}
          onClick={onCopy}
        />
        <ActionButton
          icon={<CutIcon />}
          label="剪切"
          disabled={count === 0}
          onClick={onCut}
        />
        <ActionButton
          icon={<MoveIcon />}
          label="移动"
          disabled={count === 0}
          onClick={onMove}
        />
        <ActionButton
          icon={<DownloadIcon />}
          label="下载"
          disabled={count === 0}
          onClick={onDownload}
        />
        <ActionButton
          icon={<RenameIcon />}
          label="重命名"
          disabled={count !== 1}
          onClick={onRename}
        />
        <ActionButton
          icon={<ShareIcon />}
          label="分享"
          disabled={count !== 1}
          onClick={onShare}
        />
        <ActionButton
          icon={<DeleteIcon />}
          label="删除"
          disabled={count === 0}
          onClick={onDelete}
        />
      </Toolbar>
    </Slide>
  );
}

export default MultiSelectToolbar;
