/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import {
  DeleteForever as DeleteForeverIcon,
  Restore as RestoreIcon,
} from "@mui/icons-material";

import ConfirmDialog from "./ConfirmDialog";
import {
  listTrash,
  permanentDeleteTrash,
  restoreTrash,
} from "./app/trash";
import { TrashItem } from "./app/types";
import { strings } from "./app/strings";
import { humanReadableSize } from "./app/utils";

function TrashView({ onError }: { onError: (error: Error) => void }) {
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
      onError(error as Error);
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
        onError(
          new Error(
            failed
              .map((result) => result.message || "部分项目恢复失败")
              .join("\n")
          )
        );
      } else {
        onError(new Error("已恢复所选项目"));
      }
    } catch (error) {
      onError(error as Error);
    } finally {
      await load();
    }
  };

  const handlePermanentDelete = async () => {
    try {
      await permanentDeleteTrash(selected);
      onError(new Error("已彻底删除所选项目"));
    } catch (error) {
      onError(error as Error);
    } finally {
      setConfirm(null);
      await load();
    }
  };

  const handleEmpty = async () => {
    try {
      await permanentDeleteTrash([], true);
      onError(new Error("回收站已清空"));
    } catch (error) {
      onError(error as Error);
    } finally {
      setConfirm(null);
      await load();
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", padding: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (items.length === 0) {
    return (
      <Box sx={{ textAlign: "center", padding: 4 }}>
        <Typography color="text.secondary">{strings.emptyTrash}</Typography>
      </Box>
    );
  }

  return (
    <>
      <List>
        {items.map((item) => (
          <ListItem
            key={item.trashKey}
            button
            onClick={() => toggle(item.trashKey)}
          >
            <ListItemIcon>
              <Checkbox
                size="small"
                checked={selected.includes(item.trashKey)}
                onClick={(event) => event.stopPropagation()}
              />
            </ListItemIcon>
            <ListItemText
              primary={item.name}
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
        sx={{ position: "sticky", bottom: 0, padding: 1, backgroundColor: "white" }}
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
        <Button color="error" onClick={() => setConfirm({ kind: "empty" })}>
          清空回收站
        </Button>
      </Stack>
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
