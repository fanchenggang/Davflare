/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import {
  DeleteForever as DeleteForeverIcon,
  DeleteOutline as DeleteOutlineIcon,
  Restore as RestoreIcon,
} from "@mui/icons-material";

import ConfirmDialog from "./ConfirmDialog";
import EmptyState from "./EmptyState";
import {
  listTrash,
  permanentDeleteTrash,
  restoreTrash,
} from "./app/trash";
import { NotifyFn } from "./app/notify";
import { strings } from "./app/strings";
import { TrashItem } from "./app/types";
import { humanReadableSize } from "./app/utils";

function TrashView({
  onNotify,
  onGoFiles,
}: {
  onNotify: NotifyFn;
  onGoFiles?: () => void;
}) {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<
    { kind: "delete" | "empty" } | null
  >(null);

  const load = async () => {
    setLoading(true);
    try {
      setItems(await listTrash());
      setSelected([]);
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

  const toggle = (key: string) => {
    setSelected((prev) =>
      prev.includes(key)
        ? prev.filter((item) => item !== key)
        : [...prev, key]
    );
  };

  const handleRestore = async () => {
    try {
      const results = await restoreTrash(selected);
      const failed = results.filter((result) => result.status !== "restored");
      if (failed.length) {
        onNotify(
          failed
            .map((result) => result.message || "部分项目恢复失败")
            .join("\n"),
          "error"
        );
      } else {
        onNotify("已恢复所选项目", "success");
      }
    } catch (error) {
      onNotify((error as Error).message, "error");
    } finally {
      await load();
    }
  };

  const handlePermanentDelete = async () => {
    try {
      await permanentDeleteTrash(selected);
      onNotify("已彻底删除所选项目", "success");
    } catch (error) {
      onNotify((error as Error).message, "error");
    } finally {
      setConfirm(null);
      await load();
    }
  };

  const handleEmpty = async () => {
    try {
      await permanentDeleteTrash([], true);
      onNotify("回收站已清空", "success");
    } catch (error) {
      onNotify((error as Error).message, "error");
    } finally {
      setConfirm(null);
      await load();
    }
  };

  if (loading) {
    return (
      <Box sx={{ px: 2, py: 2 }}>
        {Array.from({ length: 6 }).map((_, index) => (
          <Box key={index} sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1 }}>
            <Skeleton variant="rounded" width={20} height={20} />
            <Box sx={{ flex: 1 }}>
              <Skeleton variant="text" width="45%" height={24} />
              <Skeleton variant="text" width="70%" />
            </Box>
          </Box>
        ))}
      </Box>
    );
  }

  return (
    <>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 2,
          gap: 1,
        }}
      >
        <Typography variant="h6">{strings.trash}</Typography>
        <Button
          color="error"
          disabled={items.length === 0}
          onClick={() => setConfirm({ kind: "empty" })}
        >
          清空回收站
        </Button>
      </Box>
      {items.length === 0 ? (
        <EmptyState
          icon={<DeleteOutlineIcon />}
          title={strings.emptyTrash}
          description={strings.emptyTrashHint}
          actions={
            onGoFiles ? (
              <Button variant="contained" onClick={onGoFiles}>
                {strings.goToFiles}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <List>
            {items.map((item) => (
              <ListItem
                key={item.trashKey}
                button
                onClick={() => toggle(item.trashKey)}
                sx={{
                  mx: 1,
                  mb: 0.5,
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: selected.includes(item.trashKey)
                    ? "primary.main"
                    : "divider",
                  backgroundColor: selected.includes(item.trashKey)
                    ? "action.selected"
                    : "background.paper",
                }}
              >
                <ListItemIcon>
                  <Checkbox
                    size="small"
                    checked={selected.includes(item.trashKey)}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggle(item.trashKey);
                    }}
                  />
                </ListItemIcon>
                <ListItemText
                  primary={item.name}
                  primaryTypographyProps={{ fontWeight: 600 }}
                  secondary={`原路径：${item.originalKey} · 删除于 ${new Date(
                    item.deletedAt
                  ).toLocaleString()} · ${humanReadableSize(item.size)}`}
                />
              </ListItem>
            ))}
          </List>
          <Stack
            direction="row"
            spacing={1}
            sx={{
              position: "sticky",
              bottom: 0,
              padding: 1.5,
              backgroundColor: "background.paper",
              borderTop: "1px solid",
              borderColor: "divider",
            }}
          >
            <Button
              startIcon={<RestoreIcon />}
              disabled={selected.length === 0}
              onClick={handleRestore}
            >
              恢复
            </Button>
            <Button
              color="error"
              startIcon={<DeleteForeverIcon />}
              disabled={selected.length === 0}
              onClick={() => setConfirm({ kind: "delete" })}
            >
              彻底删除
            </Button>
          </Stack>
        </>
      )}
      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.kind === "empty" ? "清空回收站" : "彻底删除"}
        message={
          confirm?.kind === "empty"
            ? "清空后所有内容将无法恢复，确定继续吗？"
            : `将彻底删除 ${selected.length} 项，此操作无法恢复。`
        }
        confirmText="删除"
        onClose={() => setConfirm(null)}
        onConfirm={
          confirm?.kind === "empty" ? handleEmpty : handlePermanentDelete
        }
      />
    </>
  );
}

export default TrashView;
