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
  DeleteOutline as TrashIcon,
  GridView as GridViewIcon,
  Link as LinkIcon,
  Search as SearchIcon,
  Sort as SortIcon,
  ViewList as ViewListIcon,
} from "@mui/icons-material";

import { APP_NAME, strings } from "./app/strings";
import { SortField, SortPref, ViewMode } from "./app/prefs";
import { useTransferQueue } from "./app/transferQueue";

function Header({
  search,
  onSearchChange,
  view,
  onViewChange,
  sort,
  onSortChange,
  username,
  onLogout,
  onOpenTransfers,
  onNavigateTrash,
  onNavigateShares,
}: {
  search: string;
  onSearchChange: (search: string) => void;
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  sort: SortPref;
  onSortChange: (sort: SortPref) => void;
  username: string | null;
  onLogout: () => void;
  onOpenTransfers: () => void;
  onNavigateTrash: () => void;
  onNavigateShares: () => void;
}) {
  const [sortAnchor, setSortAnchor] = useState<null | HTMLElement>(null);
  const [accountAnchor, setAccountAnchor] = useState<null | HTMLElement>(null);
  const transferQueue = useTransferQueue();

  const activeTasks = transferQueue.filter((task) =>
    ["pending", "in-progress", "paused"].includes(task.status)
  ).length;

  const changeSort = (field: SortField) => {
    onSortChange({
      field,
      order: sort.field === field && sort.order === "asc" ? "desc" : "asc",
    });
    setSortAnchor(null);
  };

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

      <Tooltip title={view === "grid" ? "切换到列表视图" : "切换到网格视图"}>
        <IconButton
          aria-label="切换视图"
          onClick={() => onViewChange(view === "grid" ? "list" : "grid")}
        >
          {view === "grid" ? <ViewListIcon /> : <GridViewIcon />}
        </IconButton>
      </Tooltip>

      <Tooltip title="排序">
        <IconButton
          aria-label="排序"
          color={sortAnchor ? "primary" : "default"}
          onClick={(event) => setSortAnchor(event.currentTarget)}
        >
          <SortIcon />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={sortAnchor}
        open={Boolean(sortAnchor)}
        onClose={() => setSortAnchor(null)}
      >
        <MenuItem onClick={() => changeSort("name")}>
          按名称排序（{sort.field === "name" ? (sort.order === "asc" ? "↑" : "↓") : ""}）
        </MenuItem>
        <MenuItem onClick={() => changeSort("size")}>
          按大小排序（{sort.field === "size" ? (sort.order === "asc" ? "↑" : "↓") : ""}）
        </MenuItem>
        <MenuItem onClick={() => changeSort("date")}>
          按日期排序（{sort.field === "date" ? (sort.order === "asc" ? "↑" : "↓") : ""}）
        </MenuItem>
        <MenuItem
          onClick={() => {
            onSortChange({
              ...sort,
              order: sort.order === "asc" ? "desc" : "asc",
            });
            setSortAnchor(null);
          }}
        >
          升序/降序切换
        </MenuItem>
      </Menu>

      <Tooltip title="上传任务">
        <IconButton aria-label="上传任务" onClick={onOpenTransfers}>
          <Badge badgeContent={activeTasks} color="primary">
            <CloudUploadIcon />
          </Badge>
        </IconButton>
      </Tooltip>

      <Tooltip title="更多">
        <IconButton
          aria-label="更多"
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
        <MenuItem
          onClick={() => {
            onNavigateTrash();
            setAccountAnchor(null);
          }}
        >
          <TrashIcon sx={{ marginRight: 1 }} />
          回收站
        </MenuItem>
        <MenuItem
          onClick={() => {
            onNavigateShares();
            setAccountAnchor(null);
          }}
        >
          <LinkIcon sx={{ marginRight: 1 }} />
          我的分享
        </MenuItem>
        {username && (
          <MenuItem
            onClick={() => {
              setAccountAnchor(null);
              onLogout();
            }}
          >
            <AccountCircleIcon sx={{ marginRight: 1 }} />
            退出登录
          </MenuItem>
        )}
      </Menu>
    </Toolbar>
  );
}

export default Header;
