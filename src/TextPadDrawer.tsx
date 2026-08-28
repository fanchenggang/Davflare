import React, { useState } from "react";
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
  onUpload,
}) => {
  const [noteText, setNoteText] = useState("");
  const [noteName, setNoteName] = useState("note.txt");
  const uploadEnqueue = useUploadEnqueue();

  const handleSaveNote = () => {
    const fileBlob = new Blob([noteText], { type: "text/plain" });
    const file = new File([fileBlob], noteName, { type: "text/plain" });
    uploadEnqueue({ file, basedir: cwd });
    onUpload();
    setOpen(false);
    setNoteText("");
    setNoteName("note.txt");
  };

  return (
    <Drawer anchor="right" open={open} onClose={() => setOpen(false)}>
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
          disabled={!noteText.trim()}
        >
          保存并上传
        </Button>
      </Box>
    </Drawer>
  );
};

export default TextPadDrawer;
