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
  Typography,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";

import { createShare, listShares, revokeShare } from "./app/share";
import { FileItem, ShareInfo } from "./app/types";

function ShareDialog({
  open,
  file,
  onClose,
  onError,
}: {
  open: boolean;
  file: FileItem | null;
  onClose: () => void;
  onError: (error: Error) => void;
}) {
  const [expiry, setExpiry] = useState<string>("never");
  const [shares, setShares] = useState<ShareInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    if (!file) return;
    try {
      const all = await listShares();
      setShares(all.filter((share) => share.key === file.key));
    } catch (error) {
      onError(error as Error);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (open && file) {
      refresh();
    }
  }, [open, file]);

  const handleCreate = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const expiresInHours =
        expiry === "never"
          ? undefined
          : Number(expiry);
      await createShare(file.key, expiresInHours);
      await refresh();
    } catch (error) {
      onError(error as Error);
    } finally {
      setLoading(false);
    }
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      onError(new Error("链接已复制"));
    } catch {
      onError(new Error("复制失败"));
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
                            await revokeShare(share.token);
                            await refresh();
                          } catch (error) {
                            onError(error as Error);
                          }
                        }}
                      >
                        撤销
                      </Button>
                    }
                  >
                    <ListItemText
                      primary={
                        share.expiresAt
                          ? `有效期至 ${new Date(share.expiresAt).toLocaleString()}`
                          : "永久有效"
                      }
                      secondary={share.url}
                      secondaryTypographyProps={{
                        sx: { wordBreak: "break-all" },
                      }}
                    />
                    <Button
                      startIcon={<ContentCopyIcon />}
                      onClick={() => copy(share.url)}
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
