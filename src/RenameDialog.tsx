import React, { useEffect, useState } from "react";
import { strings, translate } from "./app/strings";
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
      setError(translate("nameEmpty"));
      return;
    }
    if (trimmed.includes("/")) {
      setError(translate("nameNoSlash"));
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
      <DialogTitle>{strings.renameTitle}</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label={strings.name}
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
          <Button onClick={onClose}>{strings.cancel}</Button>
          <Button type="submit" variant="contained">
            {strings.ok}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export default RenameDialog;
