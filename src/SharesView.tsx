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
import { ShareInfo } from "./app/types";
import { strings } from "./app/strings";

function SharesView({ onError }: { onError: (error: Error) => void }) {
  const [shares, setShares] = useState<ShareInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setShares(await listShares());
    } catch (error) {
      onError(error as Error);
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
      onError(new Error("链接已复制"));
    } catch {
      onError(new Error("复制失败"));
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", padding: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (shares.length === 0) {
    return (
      <Box sx={{ textAlign: "center", padding: 4 }}>
        <Typography color="text.secondary">{strings.emptyShares}</Typography>
      </Box>
    );
  }

  return (
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
                    onError(new Error("已撤销分享"));
                    await load();
                  } catch (error) {
                    onError(error as Error);
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
  );
}

export default SharesView;
