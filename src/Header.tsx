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
  DarkMode as DarkModeIcon,
  LightMode as LightModeIcon,
  Logout as LogoutIcon,
  Search as SearchIcon,
  SettingsBrightness as SystemThemeIcon,
  VpnKey as ApiIcon,
} from "@mui/icons-material";

import { APP_NAME, strings } from "./app/strings";
import { ThemeModePreference } from "./app/prefs";
import { useTransferQueue } from "./app/transferQueue";

function Header({
  search,
  onSearchChange,
  searchInputRef,
  username,
  onLogout,
  onOpenTransfers,
  onOpenApi,
  themeMode,
  onThemeModeChange,
}: {
  search: string;
  onSearchChange: (search: string) => void;
  searchInputRef?: React.Ref<HTMLInputElement>;
  username: string | null;
  onLogout: () => void;
  onOpenTransfers: () => void;
  onOpenApi: () => void;
  themeMode: ThemeModePreference;
  onThemeModeChange: (mode: ThemeModePreference) => void;
}) {
  const [accountAnchor, setAccountAnchor] = useState<null | HTMLElement>(null);
  const [themeAnchor, setThemeAnchor] = useState<null | HTMLElement>(null);
  const transferQueue = useTransferQueue();

  const activeTasks = transferQueue.filter((task) =>
    ["pending", "in-progress", "paused"].includes(task.status)
  ).length;

  const ThemeModeIcon =
    themeMode === "dark"
      ? DarkModeIcon
      : themeMode === "light"
      ? LightModeIcon
      : SystemThemeIcon;

  return (
    <Toolbar
      disableGutters
      sx={{
        px: 1.5,
        py: 0.75,
        gap: 0.75,
        minHeight: 56,
        backgroundColor: "background.paper",
        borderBottom: "1px solid",
        borderColor: "divider",
        flexShrink: 0,
      }}
    >
      <Typography
        variant="h6"
        sx={{
          fontWeight: 700,
          whiteSpace: "nowrap",
          color: "primary.main",
          letterSpacing: "-0.03em",
          mr: 0.5,
        }}
      >
        {APP_NAME}
      </Typography>

      <InputBase
        id="flaredrive-search"
        inputRef={searchInputRef}
        fullWidth
        size="small"
        placeholder={strings.searchPlaceholder}
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            if (search) onSearchChange("");
            (event.target as HTMLInputElement).blur();
          }
        }}
        startAdornment={
          <InputAdornment position="start">
            <SearchIcon fontSize="small" sx={{ color: "text.secondary" }} />
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
        inputProps={{ "aria-label": strings.searchShortcutHint }}
        sx={{
          backgroundColor: "background.default",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: "999px",
          padding: "4px 12px",
          marginLeft: 0.5,
          maxWidth: 560,
          transition: "border-color 0.15s ease, box-shadow 0.15s ease",
          "&:hover": {
            borderColor: (theme) => `${theme.palette.primary.main}66`,
          },
          "&.Mui-focused": {
            borderColor: "primary.main",
            boxShadow: (theme) =>
              `0 0 0 3px ${theme.palette.primary.main}29`,
            backgroundColor: "background.paper",
          },
        }}
      />

      <Tooltip title={strings.transfers}>
        <IconButton aria-label={strings.transfers} onClick={onOpenTransfers}>
          <Badge badgeContent={activeTasks} color="primary">
            <CloudUploadIcon />
          </Badge>
        </IconButton>
      </Tooltip>

      <Tooltip title={strings.theme}>
        <IconButton
          aria-label={strings.theme}
          onClick={(event) => setThemeAnchor(event.currentTarget)}
        >
          <ThemeModeIcon />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={themeAnchor}
        open={Boolean(themeAnchor)}
        onClose={() => setThemeAnchor(null)}
      >
        {(
          [
            ["light", LightModeIcon, strings.themeLight],
            ["dark", DarkModeIcon, strings.themeDark],
            ["system", SystemThemeIcon, strings.themeSystem],
          ] as const
        ).map(([value, Icon, label]) => (
          <MenuItem
            key={value}
            selected={themeMode === value}
            onClick={() => {
              onThemeModeChange(value);
              setThemeAnchor(null);
            }}
          >
            <Icon sx={{ marginRight: 1 }} />
            {label}
          </MenuItem>
        ))}
      </Menu>

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
              onOpenApi();
            }}
          >
            <ApiIcon sx={{ marginRight: 1 }} />
            {strings.apiKeys}
          </MenuItem>
        )}
        {username && (
          <MenuItem
            onClick={() => {
              setAccountAnchor(null);
              onLogout();
            }}
          >
            <LogoutIcon sx={{ marginRight: 1 }} />
            {strings.logout}
          </MenuItem>
        )}
      </Menu>
    </Toolbar>
  );
}

export default Header;
