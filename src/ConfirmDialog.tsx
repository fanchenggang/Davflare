import { strings } from "./app/strings";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";

function ConfirmDialog({
  open,
  title,
  message,
  confirmText = strings.ok,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ whiteSpace: "pre-line" }}>
          {message}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{strings.cancel}</Button>
        <Button color="error" variant="contained" onClick={onConfirm}>
          {confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default ConfirmDialog;
