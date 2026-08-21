import React, { forwardRef, useCallback, useMemo } from "react";

import { Button, Card, Drawer, Fab, Grid, Typography } from "@mui/material";
import {
  Camera as CameraIcon,
  CreateNewFolder as CreateNewFolderIcon,
  Folder as FolderIcon,
  Image as ImageIcon,
  Upload as UploadIcon,
} from "@mui/icons-material";
import CreateFolderDialog from "./CreateFolderDialog";
import { strings } from "./app/strings";
import { createFolder, selectDirectoryFiles } from "./app/transfer";
import { useUploadEnqueue } from "./app/transferQueue";

function IconCaptionButton({
  icon,
  caption,
  onClick,
}: {
  icon: React.ReactNode;
  caption: string;
  onClick?: () => void;
}) {
  return (
    <Button
      color="inherit"
      sx={{ width: "100%", display: "flex", flexDirection: "column" }}
      onClick={onClick}
    >
      {icon}
      <Typography
        variant="caption"
        sx={{ textTransform: "none", textWrap: "nowrap" }}
      >
        {caption}
      </Typography>
    </Button>
  );
}

export const UploadFab = forwardRef<HTMLButtonElement, { onClick: () => void }>(
  function ({ onClick }, ref) {
    return (
      <Fab
        ref={ref}
        aria-label="Upload"
        variant="circular"
        color="primary"
        size="large"
        sx={{ position: "fixed", right: 16, bottom: 16, color: "white" }}
        onClick={onClick}
      >
        <UploadIcon fontSize="large" />
      </Fab>
    );
  }
);

function UploadDrawer({
  open,
  setOpen,
  cwd,
  onUpload,
  onError,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  cwd: string;
  onUpload: () => void;
  onError: (error: Error) => void;
}) {
  const uploadEnqueue = useUploadEnqueue();
  const [showCreateFolder, setShowCreateFolder] = React.useState(false);

  const handleUpload = useCallback(
    (action: string) => async () => {
      if (action === "folder") {
        const files = await selectDirectoryFiles();
        if (files.length) {
          uploadEnqueue(...files.map((file) => ({ file, basedir: cwd })));
          setOpen(false);
          onUpload();
        }
        return;
      }

      const input = document.createElement("input");
      input.type = "file";
      switch (action) {
        case "photo":
          input.accept = "image/*";
          input.capture = "environment";
          break;
        case "image":
          input.accept = "image/*,video/*";
          break;
        case "file":
          input.accept = "*/*";
          break;
      }
      input.multiple = true;
      input.onchange = async () => {
        if (!input.files) return;
        const files = Array.from(input.files);
        uploadEnqueue(...files.map((file) => ({ file, basedir: cwd })));
        setOpen(false);
        onUpload();
      };
      input.click();
    },
    [cwd, onUpload, setOpen, uploadEnqueue]
  );

  const takePhoto = useMemo(() => handleUpload("photo"), [handleUpload]);
  const uploadImage = useMemo(() => handleUpload("image"), [handleUpload]);
  const uploadFile = useMemo(() => handleUpload("file"), [handleUpload]);

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={() => setOpen(false)}
      PaperProps={{ sx: { borderRadius: "16px 16px 0 0" } }}
    >
      <Card sx={{ padding: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={3}>
            <IconCaptionButton
              icon={<CameraIcon fontSize="large" />}
              caption={strings.takePhoto}
              onClick={takePhoto}
            />
          </Grid>
          <Grid item xs={3}>
            <IconCaptionButton
              icon={<ImageIcon fontSize="large" />}
              caption={strings.uploadImageVideo}
              onClick={uploadImage}
            />
          </Grid>
          <Grid item xs={3}>
            <IconCaptionButton
              icon={<UploadIcon fontSize="large" />}
              caption={strings.uploadFile}
              onClick={uploadFile}
            />
          </Grid>
          <Grid item xs={3}>
            <IconCaptionButton
              icon={<FolderIcon fontSize="large" />}
              caption={strings.uploadFolder}
              onClick={() => handleUpload("folder")()}
            />
          </Grid>
          <Grid item xs={3}>
            <IconCaptionButton
              icon={<CreateNewFolderIcon fontSize="large" />}
              caption={strings.createFolder}
              onClick={() => setShowCreateFolder(true)}
            />
          </Grid>
        </Grid>
      </Card>
      <CreateFolderDialog
        open={showCreateFolder}
        onClose={() => setShowCreateFolder(false)}
        onSubmit={async (name) => {
          try {
            await createFolder(cwd, name);
            setShowCreateFolder(false);
            setOpen(false);
            onUpload();
          } catch (error) {
            onError(error as Error);
          }
        }}
      />
    </Drawer>
  );
}

export default UploadDrawer;
