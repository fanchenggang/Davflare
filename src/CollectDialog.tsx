/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import CollectLinkList from "./CollectLinkList";
import { COLLECT_EXPIRY_OPTIONS, CollectInfo, createCollect, listCollects } from "./app/collects";
import { NotifyFn } from "./app/notify";
import { strings, translate } from "./app/strings";
import { FileItem } from "./app/types";
import { errorMessage } from "./app/utils";

const NOTE_MAX = 200;

/** 从文件夹创建文件收集链接（匿名只写），并管理该文件夹已有的收集链接。 */
function CollectDialog({
  open,
  folder,
  onClose,
  onNotify,
}: {
  open: boolean;
  folder: FileItem | null;
  onClose: () => void;
  onNotify: NotifyFn;
}) {
  const [hours, setHours] = useState(168);
  const [note, setNote] = useState("");
  const [items, setItems] = useState<CollectInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    if (!folder) return;
    try {
      const all = await listCollects();
      setItems(all.filter((item) => item.folder === folder.key.replace(/\/+$/, "")));
    } catch (error) {
      onNotify(errorMessage(error), "error");
    }
  };

  useEffect(() => {
    if (open && folder) {
      setNote("");
      setHours(168);
      refresh();
    }
  }, [open, folder]);

  const handleCreate = async () => {
    if (!folder) return;
    setLoading(true);
    try {
      const created = await createCollect(folder.key.replace(/\/+$/, ""), hours, note);
      setItems((prev) => [created, ...prev.filter((item) => item.token !== created.token)]);
      setNote("");
      try {
        await navigator.clipboard.writeText(created.url);
        onNotify(translate("collectLinkCreated"), "success");
      } catch {
        onNotify(translate("collectLinkCreatedNoCopy"), "success");
      }
    } catch (error) {
      onNotify(errorMessage(error), "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{translate("collectDialogTitle", { name: folder?.name ?? "" })}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <Alert severity="info" variant="outlined">
            {strings.collectDialogHint}{" "}
            {translate("collectLimitsHint", { maxFile: "100 MB", maxFiles: 200, maxTotal: "2 GB" })}
          </Alert>
          <FormControl fullWidth>
            <InputLabel id="collect-expiry-label">{strings.expiry}</InputLabel>
            <Select
              labelId="collect-expiry-label"
              value={String(hours)}
              label={strings.expiry}
              onChange={(event) => setHours(Number(event.target.value))}
            >
              {COLLECT_EXPIRY_OPTIONS.map((option) => (
                <MenuItem key={option.hours} value={String(option.hours)}>
                  {strings[option.labelKey]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            fullWidth
            multiline
            minRows={2}
            label={strings.collectNoteLabel}
            placeholder={strings.collectNotePlaceholder}
            value={note}
            onChange={(event) => setNote(event.target.value.slice(0, NOTE_MAX))}
            inputProps={{ maxLength: NOTE_MAX }}
          />
          <Button variant="contained" disabled={!folder || loading} onClick={handleCreate}>
            {strings.createCollectLink}
          </Button>
          {items.length > 0 && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {strings.existingCollects}
              </Typography>
              <CollectLinkList
                items={items}
                onChange={setItems}
                onNotify={onNotify}
                showFolder={false}
              />
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{strings.close}</Button>
      </DialogActions>
    </Dialog>
  );
}

export default CollectDialog;
