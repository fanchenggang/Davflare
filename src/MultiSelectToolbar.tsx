import React from "react";
import { Button, Slide, Toolbar, Typography } from "@mui/material";
import {
  Close as CloseIcon,
  ContentCopy as CopyIcon,
  ContentCut as CutIcon,
  ContentPaste as PasteIcon,
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
  multiSelected,
  onClose,
  onSelectAll,
  onDownload,
  onRename,
  onDelete,
  onShare,
  onCopy,
  onCut,
  onPaste,
  onMove,
  canPaste,
}: {
  multiSelected: string[] | null;
  onClose: () => void;
  onSelectAll: () => void;
  onDownload: () => void;
  onRename: () => void;
  onDelete: () => void;
  onShare: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onMove: () => void;
  canPaste: boolean;
}) {
  const count = multiSelected?.length ?? 0;

  return (
    <Slide direction="up" in={multiSelected !== null}>
      <Toolbar
        sx={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          backgroundColor: (theme) => theme.palette.background.paper,
          borderTop: "1px solid lightgray",
          justifyContent: "space-evenly",
          overflowX: "auto",
          gap: 0.5,
        }}
      >
        <ActionButton
          icon={<CloseIcon />}
          label="关闭"
          onClick={onClose}
        />
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
          icon={<PasteIcon />}
          label="粘贴"
          disabled={!canPaste}
          onClick={onPaste}
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
