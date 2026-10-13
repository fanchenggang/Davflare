/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from "react";
import {
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
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ContentPasteGoIcon from "@mui/icons-material/ContentPasteGo";

import ShareQrButton from "./ShareQrButton";
import { NotifyFn } from "./app/notify";
import {
  PASTE_MAX_CHARS,
  createPasteShare,
  defaultPasteFilename,
} from "./app/paste";
import { formatShareClipboard } from "./app/share";
import { strings, translate } from "./app/strings";
import { ShareInfo } from "./app/types";
import { errorMessage } from "./app/utils";

function PasteDialog({
  open,
  cwd,
  onClose,
  onNotify,
  onCreated,
}: {
  open: boolean;
  cwd: string;
  onClose: () => void;
  onNotify: NotifyFn;
  /** Called after a successful paste+share so the file list can refresh */
  onCreated?: () => void;
}) {
  const [text, setText] = useState("");
  const [filename, setFilename] = useState(defaultPasteFilename());
  const [expiry, setExpiry] = useState<string>("168");
  const [extractCode, setExtractCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<ShareInfo | null>(null);

  useEffect(() => {
    if (open) {
      setText("");
      setFilename(defaultPasteFilename());
      setExpiry("168");
      setExtractCode("");
      setCreated(null);
      setLoading(false);
    }
  }, [open]);

  const handleCreate = async () => {
    if (!text.trim() || loading) return;
    setLoading(true);
    try {
      const expiresInHours = expiry === "never" ? undefined : Number(expiry);
      const result = await createPasteShare({
        cwd,
        text,
        filename,
        expiresInHours,
        extractCode: extractCode.trim() || undefined,
      });
      setCreated(result.share);
      try {
        await navigator.clipboard.writeText(result.clipboard);
        onNotify(translate("pasteCreatedCopied"), "success");
      } catch {
        onNotify(translate("pasteCreated"), "success");
      }
      onCreated?.();
    } catch (error) {
      onNotify(errorMessage(error), "error");
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(formatShareClipboard(created));
      onNotify(translate("linkCopied"), "success");
    } catch {
      onNotify(translate("copyFailed2"), "error");
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="paste-dialog-title"
    >
      <DialogTitle id="paste-dialog-title">
        <Stack direction="row" spacing={1} alignItems="center">
          <ContentPasteGoIcon fontSize="small" color="primary" aria-hidden />
          <span>{strings.pasteShareTitle}</span>
        </Stack>
      </DialogTitle>
      <DialogContent>
        {created ? (
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              {strings.pasteShareDoneHint}
            </Typography>
            <Box
              component="pre"
              data-testid="paste-share-url"
              sx={{
                m: 0,
                p: 1.25,
                borderRadius: 1,
                bgcolor: "surface.code",
                color: "surface.codeText",
                fontSize: 13,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {formatShareClipboard(created)}
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <ShareQrButton url={created.url} />
              <Button
                type="button"
                size="small"
                startIcon={<ContentCopyIcon />}
                onClick={copyLink}
              >
                {strings.copy}
              </Button>
              <Button
                type="button"
                size="small"
                variant="outlined"
                onClick={() => {
                  setCreated(null);
                  setText("");
                  setFilename(defaultPasteFilename());
                }}
              >
                {strings.pasteShareAnother}
              </Button>
            </Stack>
          </Stack>
        ) : (
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              {strings.pasteShareHint}
            </Typography>
            <TextField
              label={strings.pasteShareContent}
              multiline
              minRows={8}
              maxRows={16}
              fullWidth
              value={text}
              onChange={(event) => setText(event.target.value.slice(0, PASTE_MAX_CHARS))}
              inputProps={{
                "data-testid": "paste-share-text",
                maxLength: PASTE_MAX_CHARS,
              }}
              helperText={translate("pasteShareChars", {
                n: String(text.length),
                max: String(PASTE_MAX_CHARS),
              })}
            />
            <TextField
              label={strings.fileName}
              fullWidth
              value={filename}
              onChange={(event) => setFilename(event.target.value)}
              inputProps={{ "data-testid": "paste-share-filename" }}
            />
            <FormControl fullWidth>
              <InputLabel>{strings.expiry}</InputLabel>
              <Select
                value={expiry}
                label={strings.expiry}
                onChange={(event) => setExpiry(event.target.value)}
                data-testid="paste-share-expiry"
              >
                <MenuItem value="never">{strings.apiNever}</MenuItem>
                <MenuItem value="24">{strings.apiExpiry1d}</MenuItem>
                <MenuItem value="168">{strings.apiExpiry7d}</MenuItem>
                <MenuItem value="720">{strings.apiExpiry30d}</MenuItem>
              </Select>
            </FormControl>
            <TextField
              fullWidth
              label={strings.extractCodeOptional}
              placeholder={strings.extractCodeHint}
              value={extractCode}
              onChange={(event) => setExtractCode(event.target.value.slice(0, 32))}
              inputProps={{ maxLength: 32, "data-testid": "paste-share-code" }}
            />
            <Button
              variant="contained"
              disabled={!text.trim() || loading}
              onClick={handleCreate}
              data-testid="paste-share-submit"
            >
              {loading ? strings.pasteShareCreating : strings.pasteShareCreate}
            </Button>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{strings.close}</Button>
      </DialogActions>
    </Dialog>
  );
}

export default PasteDialog;
