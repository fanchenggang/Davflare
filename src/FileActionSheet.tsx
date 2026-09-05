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
  InfoOutlined as DetailsIcon,
  Share as ShareIcon,
} from "@mui/icons-material";

import { FileItem } from "./app/types";
import { strings } from "./app/strings";

export type FileAction =
  | "open"
  | "download"
  | "details"
  | "rename"
  | "move"
  | "share"
  | "copy"
  | "cut"
  | "delete";

// label 存字典 key，渲染时再经 strings 取值：模块级快照会让语言切换后菜单文案不变。
const ACTIONS: Array<{
  id: FileAction;
  labelKey: string;
  icon: React.ReactNode;
  filesOnly?: boolean;
}> = [
  { id: "open", labelKey: "open", icon: <OpenIcon /> },
  { id: "download", labelKey: "download", icon: <DownloadIcon /> },
  { id: "details", labelKey: "detailsOpen", icon: <DetailsIcon /> },
  { id: "rename", labelKey: "rename", icon: <RenameIcon /> },
  { id: "move", labelKey: "move", icon: <MoveIcon /> },
  { id: "share", labelKey: "share", icon: <ShareIcon /> },
  { id: "copy", labelKey: "copy", icon: <CopyIcon /> },
  { id: "cut", labelKey: "cut", icon: <CutIcon /> },
  { id: "delete", labelKey: "delete", icon: <DeleteIcon /> },
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
  ).map((action) => ({ ...action, label: strings[action.labelKey] }));

  const run = (action: FileAction) => {
    if (!file) return;
    const target = file;
    onClose();
    const openDialog =
      action === "details" ||
      action === "rename" ||
      action === "share" ||
      action === "delete" ||
      action === "move";
    if (openDialog) window.setTimeout(() => onAction(action, target), 0);
    else onAction(action, target);
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
      disableAutoFocus
      disableRestoreFocus
      disableEnforceFocus
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
