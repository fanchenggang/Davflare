import React, { useState } from "react";
import { Box, Menu, MenuItem, Paper, Typography } from "@mui/material";
import {
  Add as AddIcon,
  CloudUpload as CloudUploadIcon,
  CreateNewFolder as CreateNewFolderIcon,
  Folder as FolderIcon,
  NoteAdd as NoteAddIcon,
} from "@mui/icons-material";

import { strings } from "./app/strings";

function NavButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-label={label}
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
        color: "text.primary",
        "&:active": { backgroundColor: "action.hover" },
      }}
    >
      {icon}
      <Typography variant="caption" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
        {label}
      </Typography>
    </Box>
  );
}

function MobileNav({
  visible,
  onGoFiles,
  onUploadFile,
  onUploadFolder,
  onCreateFolder,
  onOpenTextPad,
}: {
  visible: boolean;
  onGoFiles: () => void;
  onUploadFile: () => void;
  onUploadFolder: () => void;
  onCreateFolder: () => void;
  onOpenTextPad: () => void;
}) {
  const [uploadAnchor, setUploadAnchor] = useState<null | HTMLElement>(null);
  const [createAnchor, setCreateAnchor] = useState<null | HTMLElement>(null);

  if (!visible) return null;

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
          zIndex: 90,
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
            onClick={onGoFiles}
          />
          <NavButton
            icon={<CloudUploadIcon />}
            label={strings.upload}
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
