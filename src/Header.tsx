import React, { useState } from "react";
import { alpha } from "@mui/material/styles";
import { translate } from "./app/strings";
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
  Language as LanguageIcon,
  LightMode as LightModeIcon,
  Logout as LogoutIcon,
  Search as SearchIcon,
  Settings as SettingsIcon,
  SettingsBrightness as SystemThemeIcon,
  VpnKey as ApiIcon,
} from "@mui/icons-material";

import { useFeatures } from "./app/features";
import { getLang, Lang, setLang, APP_NAME, strings } from "./app/strings";
import { ThemeModePreference } from "./app/prefs";
import { Z_INDEX, warmShadow } from "./app/theme";
import { useTransferQueue } from "./app/transferQueue";

function Header({
  search,
  onSearchChange,
  searchInputRef,
  username,
  onLogout,
  onOpenTransfers,
  onOpenApi,
  onOpenSettings,
  themeMode,
  onThemeModeChange,
  elevated = false,
}: {
  search: string;
  onSearchChange: (search: string) => void;
  searchInputRef?: React.Ref<HTMLInputElement>;
  username: string | null;
  onLogout: () => void;
  onOpenTransfers: () => void;
  onOpenApi: () => void;
  onOpenSettings: () => void;
  themeMode: ThemeModePreference;
  onThemeModeChange: (mode: ThemeModePreference) => void;
  elevated?: boolean;
}) {
  const [accountAnchor, setAccountAnchor] = useState<null | HTMLElement>(null);
  const [themeAnchor, setThemeAnchor] = useState<null | HTMLElement>(null);
  const [langAnchor, setLangAnchor] = useState<null | HTMLElement>(null);
  const transferQueue = useTransferQueue();
  const { flags } = useFeatures();

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
      component="header"
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
        transition:
          "box-shadow 0.2s ease, background-color 0.2s ease, backdrop-filter 0.2s ease",
        boxShadow: elevated
          ? (theme) => warmShadow(theme.palette.mode === "dark", "0 2px 12px", 0.1)
          : "none",
        // 滚动后顶栏毛玻璃：半透明纸色 + 模糊；不支持 backdrop-filter 时回退纯色
        ...(elevated && {
          backgroundColor: (theme) =>
            alpha(theme.palette.background.paper, 0.82),
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          "@supports not (backdrop-filter: blur(1px))": {
            backgroundColor: "background.paper",
          },
        }),
        zIndex: Z_INDEX.listHeader,
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
          event.stopPropagation();
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
                aria-label={strings.clearSearch}
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

      <Tooltip title={strings.language}>
        <IconButton
          aria-label={strings.language}
          onClick={(event) => setLangAnchor(event.currentTarget)}
        >
          <LanguageIcon />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={langAnchor}
        open={Boolean(langAnchor)}
        onClose={() => setLangAnchor(null)}
      >
        {(
          [
            ["zh", strings.langZh],
            ["en", strings.langEn],
          ] as Array<[Lang, string]>
        ).map(([value, label]) => (
          <MenuItem
            key={value}
            selected={getLang() === value}
            onClick={() => {
              setLang(value);
              setLangAnchor(null);
            }}
          >
            {label}
          </MenuItem>
        ))}
      </Menu>

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

      <Tooltip
        title={
          username
            ? translate("loggedInAs", { name: username })
            : strings.login
        }
      >
        <IconButton
          aria-label={strings.account}
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
            {translate("loggedInAs", { name: username })}
          </MenuItem>
        )}
        {username && flags.apiKey && (
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
              onOpenSettings();
            }}
          >
            <SettingsIcon sx={{ marginRight: 1 }} />
            {strings.settings}
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
