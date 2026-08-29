/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useState } from "react";
import { strings, translate } from "./app/strings";
import {
  Box,
  Button,
  List,
  ListItem,
  ListItemText,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import LinkOffIcon from "@mui/icons-material/LinkOff";

import EmptyState from "./EmptyState";
import { formatShareClipboard, listShares, revokeShare } from "./app/share";
import { NotifyFn } from "./app/notify";
import { ShareInfo } from "./app/types";

function SharesView({
  onNotify,
  onGoFiles,
}: {
  onNotify: NotifyFn;
  onGoFiles?: () => void;
}) {
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

  const copy = async (share: ShareInfo) => {
    try {
      await navigator.clipboard.writeText(formatShareClipboard(share));
      onNotify(translate("linkCopied"), "success");
    } catch {
      onNotify(translate("copyFailed2"), "error");
    }
  };

  if (loading) {
    return (
      <Box sx={{ px: 2, py: 2 }}>
        {Array.from({ length: 4 }).map((_, index) => (
          <Box key={index} sx={{ py: 1.25 }}>
            <Skeleton variant="text" width="40%" height={28} />
            <Skeleton variant="text" width="80%" />
          </Box>
        ))}
      </Box>
    );
  }

  return (
    <>
      <Box sx={{ padding: 2 }}>
        <Typography variant="h6">{strings.shares}</Typography>
      </Box>
      {shares.length === 0 ? (
        <EmptyState
          variant="shares"
          icon={<LinkOffIcon />}
          title={strings.emptyShares}
          description={strings.emptySharesHint}
          actions={
            onGoFiles ? (
              <Button variant="contained" onClick={onGoFiles}>
                {strings.goToFiles}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <List>
          {shares.map((share) => (
            <ListItem
              key={share.token}
              sx={{
                mx: 1,
                mb: 0.5,
                borderRadius: 2,
                border: "1px solid",
                borderColor: "divider",
                backgroundColor: "background.paper",
              }}
              secondaryAction={
                <Stack direction="row" spacing={0.5}>
                  <Button
                    size="small"
                    startIcon={<ContentCopyIcon />}
                    onClick={() => copy(share)}
                  >
                    {strings.copy}
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    startIcon={<DeleteIcon />}
                    onClick={async () => {
                      const token = share.token;
                      setShares((prev) => prev.filter((item) => item.token !== token));
                      try {
                        await revokeShare(token);
                        onNotify(translate("shareLinkRevoked"), "success");
                      } catch (error) {
                        onNotify((error as Error).message, "error");
                        await load();
                      }
                    }}
                  >
                    {strings.revoke}
                  </Button>
                </Stack>
              }
            >
              <ListItemText
                primary={share.name}
                primaryTypographyProps={{ fontWeight: 600 }}
                secondary={
                  <>
                    <Typography
                      component="span"
                      variant="body2"
                      sx={{ display: "block", wordBreak: "break-all" }}
                    >
                      {share.url}
                    </Typography>
                    {[
                      share.expiresAt
                        ? translate("expiresAtLabel", { time: new Date(share.expiresAt).toLocaleString() })
                        : strings.validForever,
                      share.extractCode ? translate("extractCodeLabel", { code: share.extractCode }) : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
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
