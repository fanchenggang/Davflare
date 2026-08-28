import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Drawer,
  TextField,
  Typography,
  IconButton,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useUploadEnqueue } from "./app/transferQueue";

interface TextPadDrawerProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  cwd: string;
  onUpload: () => void;
}

const TextPadDrawer: React.FC<TextPadDrawerProps> = ({
  open,
  setOpen,
  cwd,
}) => {
  const [noteText, setNoteText] = useState("");
  const [noteName, setNoteName] = useState("note.txt");
  const uploadEnqueue = useUploadEnqueue();
  const savingRef = useRef(false);

  useEffect(() => {
    if (open) savingRef.current = false;
  }, [open]);

  const handleSaveNote = () => {
    if (savingRef.current) return;
    if (!noteText.trim()) return;

    const name = (noteName.trim() || "note.txt").replace(/[/\\]/g, "_");
    const file = new File([noteText], name, { type: "text/plain" });

    // Enqueue in the click handler so the task is in React state before the
    // drawer starts closing. Do not refresh the listing here: the file is not
    // on the server yet, and unmounting the grid mid-click blanked the page.
    // Main reloads when the upload queue drains.
    savingRef.current = true;
    uploadEnqueue({ file, basedir: cwd });
    setNoteText("");
    setNoteName("note.txt");
    setOpen(false);
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={() => setOpen(false)}
      keepMounted
      ModalProps={{ keepMounted: true, disableScrollLock: true }}
    >
      <Box
        sx={{
          width: { xs: "100vw", sm: 400 },
          maxWidth: "100vw",
          padding: 2,
          display: "flex",
          flexDirection: "column",
          height: "100%",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
          <Typography variant="h6">记事本</Typography>
          <IconButton onClick={() => setOpen(false)}>
            <CloseIcon />
          </IconButton>
        </Box>

        <TextField
          label="文件名"
          value={noteName}
          onChange={(e) => setNoteName(e.target.value)}
          fullWidth
          sx={{ mb: 2 }}
        />

        <TextField
          label="写下你的笔记…"
          multiline
          rows={15}
          variant="outlined"
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          fullWidth
        />

        <Button
          variant="contained"
          sx={{ mt: 2 }}
          onClick={handleSaveNote}
          disabled={!noteText.trim() || savingRef.current}
        >
          保存并上传
        </Button>
      </Box>
    </Drawer>
  );
};

export default TextPadDrawer;
