import {
  Alert,
  Button,
  CssBaseline,
  Snackbar,
  Stack,
  ThemeProvider,
  useMediaQuery,
} from "@mui/material";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ApiKeysPanel from "./ApiKeysPanel";
import Header from "./Header";
import LoginDialog from "./LoginDialog";
import Main from "./Main";
import TransferManager from "./TransferManager";
import { AuthProvider, useAuth } from "./app/auth";
import { ClipboardProvider } from "./app/clipboard";
import { NoticeAction, NoticeOptions, NoticeSeverity, NotifyFn } from "./app/notify";
import {
  SortPref,
  ThemeModePreference,
  usePersistedState,
  ViewMode,
} from "./app/prefs";
import { useHashRoute } from "./app/route";
import { createAppTheme } from "./app/theme";
import { TransferQueueProvider, useTransferQueue } from "./app/transferQueue";

interface SnackbarMessage {
  message: string;
  severity: NoticeSeverity;
  action?: NoticeAction;
  duration?: number;
}

function isTypingTarget(target: EventTarget | null) {
  if (target instanceof HTMLInputElement) {
    // 复选框/单选/按钮不是文本输入，键盘导航应继续生效
    return !["checkbox", "radio", "button", "submit"].includes(target.type);
  }
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

function AppContent({
  themeMode,
  onThemeModeChange,
}: {
  themeMode: ThemeModePreference;
  onThemeModeChange: (mode: ThemeModePreference) => void;
}) {
  const { username, logout } = useAuth();
  const transferQueue = useTransferQueue();
  const [route, navigate] = useHashRoute();
  const [search, setSearch] = useState("");
  const [showTransfers, setShowTransfers] = useState(false);
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [snackbar, setSnackbar] = useState<SnackbarMessage | null>(null);
  const [view, setView] = usePersistedState<ViewMode>("flaredrive.view", "grid");
  const [sort, setSort] = usePersistedState<SortPref>("flaredrive.sort", {
    field: "name",
    order: "asc",
  });
  const searchInputRef = useRef<HTMLInputElement>(null);
  const notified = useRef(new Set<string>());

  useEffect(() => {
    transferQueue.forEach((task) => {
      if (notified.current.has(task.id)) return;
      if (task.status === "completed") {
        notified.current.add(task.id);
        setSnackbar({ message: `已上传 ${task.name}`, severity: "success" });
      } else if (task.status === "failed") {
        notified.current.add(task.id);
        setSnackbar({ message: `上传失败：${task.name}`, severity: "error" });
      }
    });
  }, [transferQueue]);

  const onNotify: NotifyFn = useCallback(
    (message, severity = "info", options?: NoticeOptions) => {
      setSnackbar({
        message,
        severity,
        action: options?.action,
        duration: options?.duration,
      });
    },
    []
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const cmdK =
        (event.key === "k" || event.key === "K") &&
        (event.metaKey || event.ctrlKey);
      const slash = event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey;
      if (cmdK || (slash && !isTypingTarget(event.target))) {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <Stack sx={{ height: "100%", backgroundColor: "background.default" }}>
      <Header
        search={search}
        onSearchChange={setSearch}
        searchInputRef={searchInputRef}
        username={username}
        onLogout={logout}
        onOpenTransfers={() => setShowTransfers(true)}
        onOpenApi={() => setShowApiKeys(true)}
        themeMode={themeMode}
        onThemeModeChange={onThemeModeChange}
      />
      <Main
        search={search}
        onSearchChange={setSearch}
        onNotify={onNotify}
        view={view}
        onViewChange={setView}
        sort={sort}
        onSortChange={setSort}
        route={route}
        navigate={navigate}
        onOpenApi={() => setShowApiKeys(true)}
      />
      {username === null && <LoginDialog />}
      <Snackbar
        autoHideDuration={snackbar?.duration ?? 5000}
        open={Boolean(snackbar)}
        onClose={() => setSnackbar(null)}
      >
        <Alert
          severity={snackbar?.severity ?? "info"}
          onClose={() => setSnackbar(null)}
          action={
            snackbar?.action ? (
              <Button
                color="inherit"
                size="small"
                onClick={() => {
                  const action = snackbar.action;
                  setSnackbar(null);
                  action?.onClick();
                }}
              >
                {snackbar.action.label}
              </Button>
            ) : undefined
          }
          sx={{ width: "100%" }}
        >
          {snackbar?.message}
        </Alert>
      </Snackbar>
      <TransferManager open={showTransfers} onClose={() => setShowTransfers(false)} />
      <ApiKeysPanel
        open={showApiKeys}
        onClose={() => setShowApiKeys(false)}
        onNotify={onNotify}
      />
    </Stack>
  );
}

function ThemedApp() {
  const [themeMode, setThemeMode] = usePersistedState<ThemeModePreference>(
    "flaredrive.themeMode",
    "system"
  );
  const systemPrefersDark = useMediaQuery("(prefers-color-scheme: dark)", {
    noSsr: true,
  });
  const effectiveMode =
    themeMode === "system"
      ? systemPrefersDark
        ? "dark"
        : "light"
      : themeMode;
  const theme = useMemo(() => createAppTheme(effectiveMode), [effectiveMode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppContent
        themeMode={themeMode}
        onThemeModeChange={setThemeMode}
      />
    </ThemeProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <TransferQueueProvider>
        <ClipboardProvider>
          <ThemedApp />
        </ClipboardProvider>
      </TransferQueueProvider>
    </AuthProvider>
  );
}

export default App;
