/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useState } from "react";
import { strings, translate } from "./app/strings";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";

import { createShare, formatShareClipboard, listShares, revokeShare } from "./app/share";
import { NotifyFn } from "./app/notify";
import { FileItem, ShareInfo } from "./app/types";

function ShareDialog({
  open,
  file,
  onClose,
  onNotify,
}: {
  open: boolean;
  file: FileItem | null;
  onClose: () => void;
  onNotify: NotifyFn;
}) {
  const [expiry, setExpiry] = useState<string>("never");
  const [extractCode, setExtractCode] = useState("");
  const [shares, setShares] = useState<ShareInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    if (!file) return;
    try {
      const all = await listShares();
      setShares(all.filter((share) => share.key === file.key));
    } catch (error) {
      onNotify((error as Error).message, "error");
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (open && file) {
      setExtractCode("");
      refresh();
    }
  }, [open, file]);

  const handleCreate = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const expiresInHours =
        expiry === "never" ? undefined : Number(expiry);
      const created = await createShare(
        file.key,
        expiresInHours,
        extractCode.trim() || undefined
      );
      await refresh();
      onNotify(translate("shareLinkCreated"), "success");
      try {
        await navigator.clipboard.writeText(formatShareClipboard(created));
      } catch {
        // ignore; user can still copy from the list
      }
    } catch (error) {
      onNotify((error as Error).message, "error");
    } finally {
      setLoading(false);
    }
  };

  const copy = async (share: ShareInfo) => {
    try {
      await navigator.clipboard.writeText(formatShareClipboard(share));
      onNotify(translate("linkCopied"), "success");
    } catch {
      onNotify(translate("copyFailed2"), "error");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{translate("shareOf", { name: file?.name ?? "" })}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <FormControl fullWidth>
            <InputLabel>{strings.expiry}</InputLabel>
            <Select
              value={expiry}
              label={strings.expiry}
              onChange={(event) => setExpiry(event.target.value)}
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
            inputProps={{ maxLength: 32 }}
          />
          <Button
            variant="contained"
            disabled={!file || loading}
            onClick={handleCreate}
          >
            {strings.createShareLink}
          </Button>

          {shares.length > 0 && (
            <Box>
              <Typography variant="subtitle2">{strings.existingShare}</Typography>
              <List>
                {shares.map((share) => (
                  <ListItem
                    key={share.token}
                    alignItems="flex-start"
                    sx={{
                      display: "block",
                      px: 0,
                      py: 1.25,
                      borderBottom: "1px solid",
                      borderColor: "divider",
                    }}
                  >
                    <ListItemText
                      primary={
                        [
                          share.expiresAt
                            ? translate("expiresAtLabel", { time: new Date(share.expiresAt).toLocaleString() })
                            : strings.validForever,
                          share.extractCode
                            ? `${strings.extractCode} ${share.extractCode}`
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      }
                      secondary={share.url}
                      secondaryTypographyProps={{
                        sx: { wordBreak: "break-all", pr: 0 },
                      }}
                    />
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                      <Button
                        type="button"
                        size="small"
                        startIcon={<ContentCopyIcon />}
                        onClick={(event) => {
                          event.stopPropagation();
                          copy(share);
                        }}
                      >
                        {strings.copy}
                      </Button>
                      <Button
                        type="button"
                        size="small"
                        color="error"
                        onClick={async (event) => {
                          event.stopPropagation();
                          event.preventDefault();
                          try {
                            await revokeShare(share.token);
                            setShares((prev) =>
                              prev.filter((item) => item.token !== share.token)
                            );
                            onNotify(translate("shareLinkRevoked"), "success");
                          } catch (error) {
                            onNotify((error as Error).message, "error");
                            await refresh();
                          }
                        }}
                      >
                        {strings.revoke}
                      </Button>
                    </Stack>
                  </ListItem>
                ))}
              </List>
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

export default ShareDialog;
