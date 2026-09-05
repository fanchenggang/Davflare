/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";

import { authFetch } from "./app/auth";
import { NotifyFn } from "./app/notify";
import { strings, translate } from "./app/strings";
import { errorMessage } from "./app/utils";

interface WebDavInfo {
  username: string;
  publicRead: boolean;
}

function WebDavPanel({
  open,
  onClose,
  onNotify,
}: {
  open: boolean;
  onClose: () => void;
  onNotify: NotifyFn;
}) {
  const [info, setInfo] = useState<WebDavInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const webdavUrl = `${window.location.origin}/webdav`;

  useEffect(() => {
    if (!open) return;
    let canceled = false;
    setLoading(true);
    authFetch("/api/config")
      .then(async (response) => {
        if (!response.ok) throw new Error(translate("webdavConfigFailed"));
        const data = (await response.json()) as WebDavInfo;
        if (!canceled) setInfo(data);
      })
      .catch((error) => {
        if (!canceled) onNotify(errorMessage(error), "error");
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [open]);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onNotify(translate("copiedFormat", { label }), "success");
    } catch {
      onNotify(translate("copyFailed2"), "error");
    }
  };

  const guide = [
    `${translate("address")}：${webdavUrl}`,
    `${strings.username}：${info?.username || strings.notConfigured}`,
    translate("uploadLimitNote"),
    translate("finderHowTo"),
    translate("passwordNote"),
    info?.publicRead
      ? translate("publicReadOn")
      : translate("publicReadOff"),
  ].join("\n");

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{strings.webdavTitle}</DialogTitle>
      <DialogContent>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", padding: 3 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Stack spacing={2} sx={{ marginTop: 1 }}>
            <Box>
              <Typography variant="caption" color="text.secondary">
                {strings.address}
              </Typography>
              <Typography sx={{ wordBreak: "break-all" }}>{webdavUrl}</Typography>
              <Button
                size="small"
                startIcon={<ContentCopyIcon />}
                onClick={() => copy(webdavUrl, strings.address)}
              >
                {strings.copyAddress}
              </Button>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                {strings.username}
              </Typography>
              <Typography>{info?.username || strings.notConfigured}</Typography>
              {info?.username && (
                <Button
                  size="small"
                  startIcon={<ContentCopyIcon />}
                  onClick={() => copy(info.username, strings.username)}
                >
                  {strings.copyUsername}
                </Button>
              )}
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                {strings.publicRead}
              </Typography>
              <Typography>
                {info?.publicRead
                  ? strings.publicReadOn
                  : strings.publicReadOff}
              </Typography>
            </Box>
            <Box
              sx={{
                p: 1.5,
                borderRadius: 2,
                backgroundColor: "background.default",
                border: "1px solid",
                borderColor: "divider",
              }}
            >
              <Typography
                variant="body2"
                sx={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}
              >
                {guide}
              </Typography>
              <Button
                size="small"
                startIcon={<ContentCopyIcon />}
                onClick={() => copy(guide, strings.fullGuide)}
                sx={{ mt: 1 }}
              >
                {strings.copyWebDavGuide}
              </Button>
            </Box>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button
          startIcon={<ContentCopyIcon />}
          onClick={() => copy(guide, strings.fullGuide)}
          disabled={loading}
        >
          {strings.copyWebDavGuide}
        </Button>
        <Button onClick={onClose}>{strings.close}</Button>
      </DialogActions>
    </Dialog>
  );
}

export default WebDavPanel;
