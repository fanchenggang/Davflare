import { useState } from "react";
import {
  Button,
  IconButton,
  Menu,
  MenuItem,
  Typography,
  Box,
} from "@mui/material";
import { Close, PushPinOutlined } from "@mui/icons-material";
import { FolderShortcut, useFolderShortcuts } from "./app/shortcuts";
import { strings } from "./app/strings";

export default function QuickAccessMenu({
  onOpen,
}: {
  onOpen: (item: FolderShortcut) => void;
}) {
  const { items, remove } = useFolderShortcuts();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <Button
        size="small"
        startIcon={<PushPinOutlined />}
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        {strings.shortcuts}
      </Button>
      <Menu
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
      >
        {!items.length && <MenuItem disabled>{strings.shortcutsHint}</MenuItem>}
        {items.map((item) => (
          <Box
            key={item.path}
            sx={{ display: "flex", alignItems: "center", maxWidth: 320 }}
          >
            <MenuItem
              sx={{ flex: 1, minWidth: 0 }}
              onClick={() => {
                setAnchor(null);
                onOpen(item);
              }}
            >
              <Typography noWrap>{item.name}</Typography>
            </MenuItem>
            <IconButton
              size="small"
              aria-label={`${strings.removeShortcut}: ${item.name}`}
              onClick={() => remove(item.path)}
            >
              <Close fontSize="small" />
            </IconButton>
          </Box>
        ))}
      </Menu>
    </>
  );
}
