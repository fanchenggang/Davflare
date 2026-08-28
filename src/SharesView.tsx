/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";

import { listShares, revokeShare } from "./app/share";
import { NotifyFn } from "./app/notify";
import { ShareInfo } from "./app/types";
import { strings } from "./app/strings";

function SharesView({ onNotify }: { onNotify: NotifyFn }) {
  const [shares, setShares] = useState<ShareInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setShares(await listShares());
    } catch (error) {
      onNotify((error as Error).message, "error");
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
  }, []);

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      onNotify("链接已复制", "success");
    } catch {
      onNotify("复制失败", "error");
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", padding: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <>
      <Box sx={{ padding: 1.5 }}>
        <Typography variant="h6">{strings.shares}</Typography>
      </Box>
      {shares.length === 0 ? (
        <Box sx={{ textAlign: "center", padding: 4 }}>
          <Typography color="text.secondary">{strings.emptyShares}</Typography>
        </Box>
      ) : (
        <List>
          {shares.map((share) => (
            <ListItem
              key={share.token}
              secondaryAction={
                <Stack direction="row" spacing={0.5}>
                  <Button
                    size="small"
                    startIcon={<ContentCopyIcon />}
                    onClick={() => copy(share.url)}
                  >
                    复制
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    startIcon={<DeleteIcon />}
                    onClick={async () => {
                      try {
                        await revokeShare(share.token);
                        onNotify("已撤销分享", "success");
                        await load();
                      } catch (error) {
                        onNotify((error as Error).message, "error");
                      }
                    }}
                  >
                    撤销
                  </Button>
                </Stack>
              }
            >
              <ListItemText
                primary={share.name}
                secondary={
                  <>
                    <Typography
                      component="span"
                      variant="body2"
                      sx={{ display: "block", wordBreak: "break-all" }}
                    >
                      {share.url}
                    </Typography>
                    {share.expiresAt
                      ? `有效期至 ${new Date(share.expiresAt).toLocaleString()}`
                      : "永久有效"}
                  </>
                }
              />
            </ListItem>
          ))}
        </List>
      )}
    </>
  );
}

export default SharesView;
