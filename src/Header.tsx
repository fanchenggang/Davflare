import React, { useState } from "react";
import {
  Badge,
  IconButton,
  InputAdornment,
  InputBase,
  Menu,
  MenuItem,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  AccountCircle as AccountCircleIcon,
  Close as CloseIcon,
  CloudUpload as CloudUploadIcon,
  Search as SearchIcon,
} from "@mui/icons-material";

import { APP_NAME, strings } from "./app/strings";
import { useTransferQueue } from "./app/transferQueue";

function Header({
  search,
  onSearchChange,
  username,
  onLogout,
  onOpenTransfers,
}: {
  search: string;
  onSearchChange: (search: string) => void;
  username: string | null;
  onLogout: () => void;
  onOpenTransfers: () => void;
}) {
  const [accountAnchor, setAccountAnchor] = useState<null | HTMLElement>(null);
  const transferQueue = useTransferQueue();

  const activeTasks = transferQueue.filter((task) =>
    ["pending", "in-progress", "paused"].includes(task.status)
  ).length;

  return (
    <Toolbar disableGutters sx={{ padding: 1, gap: 0.5 }}>
      <Typography variant="h6" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
        {APP_NAME}
      </Typography>

      <InputBase
        fullWidth
        size="small"
        placeholder={strings.searchPlaceholder}
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        startAdornment={
          <InputAdornment position="start">
            <SearchIcon fontSize="small" />
          </InputAdornment>
        }
        endAdornment={
          search ? (
            <InputAdornment position="end">
              <IconButton
                size="small"
                aria-label="清空搜索"
                onClick={() => onSearchChange("")}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ) : null
        }
        sx={{
          backgroundColor: "whitesmoke",
          borderRadius: "999px",
          padding: "6px 14px",
          marginLeft: 1,
        }}
      />

      <Tooltip title={strings.transfers}>
        <IconButton aria-label={strings.transfers} onClick={onOpenTransfers}>
          <Badge badgeContent={activeTasks} color="primary">
            <CloudUploadIcon />
          </Badge>
        </IconButton>
      </Tooltip>

      <Tooltip title={username ? `已登录：${username}` : strings.login}>
        <IconButton
          aria-label="账户"
          onClick={(event) => setAccountAnchor(event.currentTarget)}
        >
          <AccountCircleIcon />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={accountAnchor}
        open={Boolean(accountAnchor)}
        onClose={() => setAccountAnchor(null)}
      >
        {username && (
          <MenuItem disabled>
            <AccountCircleIcon sx={{ marginRight: 1 }} />
            已登录：{username}
          </MenuItem>
        )}
        {username && (
          <MenuItem
            onClick={() => {
              setAccountAnchor(null);
              onLogout();
            }}
          >
            <AccountCircleIcon sx={{ marginRight: 1 }} />
            {strings.logout}
          </MenuItem>
        )}
      </Menu>
    </Toolbar>
  );
}

export default Header;
