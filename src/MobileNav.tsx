import React, { useState } from "react";
import { Box, Menu, MenuItem, Paper, Typography } from "@mui/material";
import { CircularProgress } from "@mui/material";
import {
  Add as AddIcon,
  CloudUpload as CloudUploadIcon,
  CreateNewFolder as CreateNewFolderIcon,
  Folder as FolderIcon,
  NoteAdd as NoteAddIcon,
} from "@mui/icons-material";

import { useTransferQueue } from "./app/transferQueue";
import { strings } from "./app/strings";
import { Z_INDEX } from "./app/theme";

function NavButton({
  icon,
  label,
  onClick,
  active = false,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  active?: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      sx={{
        flex: 1,
        border: "none",
        background: "transparent",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 0.25,
        py: 1,
        minHeight: 56,
        cursor: "pointer",
        color: active ? "primary.main" : "text.primary",
        "&:active": { backgroundColor: "action.hover" },
        // 点按时图标弹性放大
        "&:active .nav-icon": {
          transform: "scale(1.18)",
        },
        "& .nav-icon": {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)",
        },
        "@media (prefers-reduced-motion: reduce)": {
          "&:active .nav-icon": { transform: "none" },
          "& .nav-icon": { transition: "none" },
        },
      }}
    >
      <Box className="nav-icon">{badge ?? icon}</Box>
      <Typography variant="caption" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
        {label}
      </Typography>
    </Box>
  );
}

function MobileNav({
  visible,
  filesActive = false,
  onGoFiles,
  onUploadFile,
  onUploadFolder,
  onCreateFolder,
  onOpenTextPad,
}: {
  visible: boolean;
  filesActive?: boolean;
  onGoFiles: () => void;
  onUploadFile: () => void;
  onUploadFolder: () => void;
  onCreateFolder: () => void;
  onOpenTextPad: () => void;
}) {
  const [uploadAnchor, setUploadAnchor] = useState<null | HTMLElement>(null);
  const [createAnchor, setCreateAnchor] = useState<null | HTMLElement>(null);
  const transferQueue = useTransferQueue();

  if (!visible) return null;

  const uploads = transferQueue.filter((task) => task.type === "upload");
  const activeUploads = uploads.filter((task) =>
    ["pending", "in-progress", "paused"].includes(task.status)
  ).length;
  const total = uploads.reduce((sum, task) => sum + task.total, 0);
  const loaded = uploads.reduce((sum, task) => sum + task.loaded, 0);
  const overallPercent =
    activeUploads > 0 && total > 0 ? Math.round((loaded / total) * 100) : 0;

  // 有任务进行中时，上传 tab 图标换成分进度环
  const uploadIcon =
    activeUploads > 0 ? (
      <Box sx={{ position: "relative", width: 24, height: 24 }}>
        <CircularProgress
          variant="determinate"
          value={overallPercent}
          size={30}
          thickness={3.5}
          sx={{ position: "absolute", left: -3, top: -3 }}
        />
        <CloudUploadIcon sx={{ fontSize: 20, position: "absolute", left: 2, top: 2 }} />
      </Box>
    ) : (
      <CloudUploadIcon />
    );

  return (
    <>
      <Paper
        elevation={8}
        sx={{
          display: { xs: "block", sm: "none" },
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: Z_INDEX.mobileNav,
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "stretch" }}>
          <NavButton
            icon={<FolderIcon />}
            label={strings.files}
            active={filesActive}
            onClick={onGoFiles}
          />
          <NavButton
            icon={<CloudUploadIcon />}
            label={strings.upload}
            badge={uploadIcon}
            onClick={(event) => setUploadAnchor(event.currentTarget)}
          />
          <NavButton
            icon={<AddIcon />}
            label={strings.create}
            onClick={(event) => setCreateAnchor(event.currentTarget)}
          />
        </Box>
      </Paper>
      <Menu
        anchorEl={uploadAnchor}
        open={Boolean(uploadAnchor)}
        onClose={() => setUploadAnchor(null)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        transformOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <MenuItem
          onClick={() => {
            setUploadAnchor(null);
            onUploadFile();
          }}
        >
          {strings.uploadFile}
        </MenuItem>
        <MenuItem
          onClick={() => {
            setUploadAnchor(null);
            onUploadFolder();
          }}
        >
          {strings.uploadFolder}
        </MenuItem>
      </Menu>
      <Menu
        anchorEl={createAnchor}
        open={Boolean(createAnchor)}
        onClose={() => setCreateAnchor(null)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        transformOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <MenuItem
          onClick={() => {
            setCreateAnchor(null);
            onCreateFolder();
          }}
        >
          <CreateNewFolderIcon fontSize="small" sx={{ mr: 1 }} />
          {strings.createFolder}
        </MenuItem>
        <MenuItem
          onClick={() => {
            setCreateAnchor(null);
            onOpenTextPad();
          }}
        >
          <NoteAddIcon fontSize="small" sx={{ mr: 1 }} />
          {strings.openTextPad}
        </MenuItem>
      </Menu>
    </>
  );
}

export default MobileNav;
