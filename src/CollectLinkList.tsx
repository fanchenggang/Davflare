import { Button, Chip, List, ListItem, ListItemText, Stack, Tooltip, Typography } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import BlockIcon from "@mui/icons-material/Block";
import DeleteIcon from "@mui/icons-material/Delete";

import ShareQrButton from "./ShareQrButton";
import {
  CollectInfo,
  collectStatusLabel,
  deleteCollect,
  disableCollect,
} from "./app/collects";
import { NotifyFn } from "./app/notify";
import { shareExpiryView } from "./app/share";
import { strings, translate } from "./app/strings";
import { errorMessage, formatDateTime, formatRelativeDateTime, humanReadableSize } from "./app/utils";

/** 收集链接列表：分享管理页与收集对话框共用。状态/用量/有效期 + 复制、二维码、停用、删除。 */
function CollectLinkList({
  items,
  onChange,
  onNotify,
  showFolder = true,
}: {
  items: CollectInfo[];
  onChange: (next: CollectInfo[]) => void;
  onNotify: NotifyFn;
  showFolder?: boolean;
}) {
  const copy = async (item: CollectInfo) => {
    try {
      await navigator.clipboard.writeText(item.url);
      onNotify(translate("linkCopied"), "success");
    } catch {
      onNotify(translate("copyFailed2"), "error");
    }
  };

  const disable = async (item: CollectInfo) => {
    try {
      const updated = await disableCollect(item.token);
      onChange(items.map((entry) => (entry.token === item.token ? updated : entry)));
      onNotify(translate("collectDisabledToast"), "success");
    } catch (error) {
      onNotify(errorMessage(error), "error");
    }
  };

  const remove = async (item: CollectInfo) => {
    try {
      await deleteCollect(item.token);
      onChange(items.filter((entry) => entry.token !== item.token));
      onNotify(translate("collectDeletedToast"), "success");
    } catch (error) {
      onNotify(errorMessage(error), "error");
    }
  };

  return (
    <List disablePadding>
      {items.map((item) => {
        const expiry = item.status === "active" ? shareExpiryView(item.expiresAt) : null;
        return (
          <ListItem
            key={item.token}
            alignItems="flex-start"
            sx={{
              display: "block",
              mb: 0.75,
              px: 1.5,
              py: 1.25,
              borderRadius: 2,
              border: "1px solid",
              borderColor: "divider",
              backgroundColor: "background.paper",
            }}
          >
            <ListItemText
              primary={showFolder ? translate("collectTarget", { folder: item.folder }) : undefined}
              primaryTypographyProps={{ fontWeight: 600, sx: { wordBreak: "break-all" } }}
              secondaryTypographyProps={{ component: "div" }}
              secondary={
                <>
                  <Typography
                    component="span"
                    variant="body2"
                    sx={{ display: "block", wordBreak: "break-all" }}
                  >
                    {item.url}
                  </Typography>
                  {item.note && (
                    <Typography
                      component="span"
                      variant="body2"
                      sx={{ display: "block", mt: 0.5, whiteSpace: "pre-wrap" }}
                    >
                      {item.note}
                    </Typography>
                  )}
                  <Stack direction="row" spacing={0.5} sx={{ mt: 0.75, flexWrap: "wrap", rowGap: 0.5 }}>
                    <Chip
                      size="small"
                      color={item.status === "active" ? "success" : "default"}
                      label={collectStatusLabel(item.status)}
                    />
                    {expiry && (
                      <Chip
                        size="small"
                        color={expiry.urgent ? "warning" : "default"}
                        label={expiry.label}
                      />
                    )}
                    <Chip
                      size="small"
                      variant="outlined"
                      label={translate("collectUsage", {
                        files: item.usage.files,
                        maxFiles: item.limits.maxFiles,
                        bytes: humanReadableSize(item.usage.bytes),
                        maxBytes: humanReadableSize(item.limits.maxTotalBytes),
                      })}
                    />
                    {item.createdAt && (
                      <Tooltip title={formatDateTime(item.createdAt)} enterDelay={400}>
                        <Chip
                          size="small"
                          label={translate("shareCreatedAt", {
                            time: formatRelativeDateTime(item.createdAt),
                          })}
                        />
                      </Tooltip>
                    )}
                  </Stack>
                </>
              }
            />
            <Stack direction="row" spacing={0.5} sx={{ mt: 1, flexWrap: "wrap" }}>
              {item.status === "active" && <ShareQrButton url={item.url} />}
              {item.status === "active" && (
                <Button size="small" startIcon={<ContentCopyIcon />} onClick={() => copy(item)}>
                  {strings.copy}
                </Button>
              )}
              {item.status === "active" && (
                <Button
                  size="small"
                  color="warning"
                  startIcon={<BlockIcon />}
                  onClick={() => disable(item)}
                >
                  {strings.collectDisable}
                </Button>
              )}
              <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={() => remove(item)}>
                {strings.delete}
              </Button>
            </Stack>
          </ListItem>
        );
      })}
    </List>
  );
}

export default CollectLinkList;
