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

function CreateFolderDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setError(null);
    }
  }, [open]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError(translate("folderNameEmpty"));
      return;
    }
    if (trimmed.includes("/")) {
      setError(translate("folderNameNoSlash"));
      return;
    }
    onSubmit(trimmed);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{strings.createFolderTitle}</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label={strings.folderName}
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
            {strings.create}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export default CreateFolderDialog;
