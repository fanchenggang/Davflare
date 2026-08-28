/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useState } from "react";
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
import { strings } from "./app/strings";
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
      onNotify("分享链接已创建", "success");
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
      onNotify("链接已复制", "success");
    } catch {
      onNotify("复制失败", "error");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>分享{file ? `「${file.name}」` : ""}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <FormControl fullWidth>
            <InputLabel>有效期</InputLabel>
            <Select
              value={expiry}
              label="有效期"
              onChange={(event) => setExpiry(event.target.value)}
            >
              <MenuItem value="never">永久</MenuItem>
              <MenuItem value="24">1 天</MenuItem>
              <MenuItem value="168">7 天</MenuItem>
              <MenuItem value="720">30 天</MenuItem>
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
            创建分享链接
          </Button>

          {shares.length > 0 && (
            <Box>
              <Typography variant="subtitle2">已有分享</Typography>
              <List>
                {shares.map((share) => (
                  <ListItem
                    key={share.token}
                    secondaryAction={
                      <Button
                        color="error"
                        onClick={async () => {
                          try {
                            setShares((prev) =>
                              prev.filter((item) => item.token !== share.token)
                            );
                            await revokeShare(share.token);
                          } catch (error) {
                            onNotify((error as Error).message, "error");
                            await refresh();
                          }
                        }}
                      >
                        撤销
                      </Button>
                    }
                  >
                    <ListItemText
                      primary={
                        [
                          share.expiresAt
                            ? `有效期至 ${new Date(share.expiresAt).toLocaleString()}`
                            : "永久有效",
                          share.extractCode
                            ? `${strings.extractCode} ${share.extractCode}`
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      }
                      secondary={share.url}
                      secondaryTypographyProps={{
                        sx: { wordBreak: "break-all" },
                      }}
                    />
                    <Button
                      startIcon={<ContentCopyIcon />}
                      onClick={() => copy(share)}
                    >
                      复制
                    </Button>
                  </ListItem>
                ))}
              </List>
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>关闭</Button>
      </DialogActions>
    </Dialog>
  );
}

export default ShareDialog;
