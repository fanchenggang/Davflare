import React from "react";
import {
  Box,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Typography,
  useMediaQuery,
} from "@mui/material";
import {
  ContentCopy as CopyIcon,
  ContentCut as CutIcon,
  Delete as DeleteIcon,
  Download as DownloadIcon,
  DriveFileMove as MoveIcon,
  Edit as RenameIcon,
  FolderOpen as OpenIcon,
  Share as ShareIcon,
} from "@mui/icons-material";

import { FileItem } from "./app/types";
import { strings } from "./app/strings";

export type FileAction =
  | "open"
  | "download"
  | "rename"
  | "move"
  | "share"
  | "copy"
  | "cut"
  | "delete";

const ACTIONS: Array<{
  id: FileAction;
  label: string;
  icon: React.ReactNode;
  filesOnly?: boolean;
}> = [
  { id: "open", label: strings.open, icon: <OpenIcon /> },
  { id: "download", label: strings.download, icon: <DownloadIcon /> },
  { id: "rename", label: strings.rename, icon: <RenameIcon /> },
  { id: "move", label: strings.move, icon: <MoveIcon /> },
  { id: "share", label: strings.share, icon: <ShareIcon /> },
  { id: "copy", label: strings.copy, icon: <CopyIcon /> },
  { id: "cut", label: strings.cut, icon: <CutIcon /> },
  { id: "delete", label: strings.delete, icon: <DeleteIcon /> },
];

function FileActionSheet({
  file,
  anchorPosition,
  onClose,
  onAction,
}: {
  file: FileItem | null;
  anchorPosition: { top: number; left: number } | null;
  onClose: () => void;
  onAction: (action: FileAction, file: FileItem) => void;
}) {
  const isPhone = useMediaQuery("(max-width:600px)");
  const open = Boolean(file);
  const actions = ACTIONS.filter(
    (action) => !action.filesOnly || (file && !file.isDir)
  );

  const run = (action: FileAction) => {
    if (!file) return;
    onAction(action, file);
  };

  if (isPhone) {
    return (
      <Drawer
        anchor="bottom"
        open={open}
        onClose={onClose}
        PaperProps={{
          sx: {
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            paddingBottom: "env(safe-area-inset-bottom)",
          },
        }}
      >
        <Box sx={{ padding: 1, paddingBottom: 2 }}>
          <Typography
            variant="subtitle1"
            sx={{
              paddingX: 2,
              paddingY: 1,
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {file?.name}
          </Typography>
          <List>
            {actions.map((action) => (
              <ListItemButton
                key={action.id}
                onClick={() => run(action.id)}
                sx={{ minHeight: 56, borderRadius: 1 }}
              >
                <ListItemIcon>{action.icon}</ListItemIcon>
                <ListItemText primary={action.label} />
              </ListItemButton>
            ))}
          </List>
        </Box>
      </Drawer>
    );
  }

  return (
    <Menu
      open={open}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={anchorPosition ?? { top: 0, left: 0 }}
      disableAutoFocusItem
      onClick={(event) => event.stopPropagation()}
      MenuListProps={{ dense: false, sx: { minWidth: 180 } }}
    >
      {file &&
        actions.map((action) => (
          <MenuItem key={action.id} onClick={() => run(action.id)}>
            <ListItemIcon sx={{ minWidth: 36 }}>{action.icon}</ListItemIcon>
            {action.label}
          </MenuItem>
        ))}
    </Menu>
  );
}

export default FileActionSheet;
