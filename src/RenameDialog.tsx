import React, { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";

function RenameDialog({
  open,
  currentName,
  onClose,
  onSubmit,
}: {
  open: boolean;
  currentName: string;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(currentName);
      setError(null);
    }
  }, [open, currentName]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("名称不能为空");
      return;
    }
    if (trimmed.includes("/")) {
      setError("名称不能包含 /");
      return;
    }
    if (trimmed === currentName) {
      onClose();
      return;
    }
    onSubmit(trimmed);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>重命名</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="名称"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
            error={Boolean(error)}
            helperText={error}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>取消</Button>
          <Button type="submit" variant="contained">
            确定
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export default RenameDialog;
