import React from "react";
import { Button, Slide, Toolbar, Typography } from "@mui/material";

import { strings, translate } from "./app/strings";
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
        <ActionButton icon={<CloseIcon />} label={strings.close} onClick={onClose} />
        <ActionButton
          icon={<SelectAllIcon />}
          label={translate("itemsSuffix", { count })}
          onClick={onSelectAll}
        />
        <ActionButton
          icon={<CopyIcon />}
          label={strings.copy}
          disabled={count === 0}
          onClick={onCopy}
        />
        <ActionButton
          icon={<CutIcon />}
          label={strings.cut}
          disabled={count === 0}
          onClick={onCut}
        />
        <ActionButton
          icon={<MoveIcon />}
          label={strings.move}
          disabled={count === 0}
          onClick={onMove}
        />
        <ActionButton
          icon={<DownloadIcon />}
          label={strings.download}
          disabled={count === 0}
          onClick={onDownload}
        />
        <ActionButton
          icon={<RenameIcon />}
          label={strings.rename}
          disabled={count !== 1}
          onClick={onRename}
        />
        <ActionButton
          icon={<ShareIcon />}
          label={strings.share}
          disabled={count !== 1}
          onClick={onShare}
        />
        <ActionButton
          icon={<DeleteIcon />}
          label={strings.delete}
          disabled={count === 0}
          onClick={onDelete}
        />
      </Toolbar>
    </Slide>
  );
}

export default MultiSelectToolbar;
