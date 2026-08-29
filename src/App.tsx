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
import { translate, useLang } from "./app/strings";
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
  key: number;
  message: string;
  severity: NoticeSeverity;
  action?: NoticeAction;
  duration?: number;
}

const DEFAULT_SNACK_MS = 5000;
const ERROR_SNACK_MS = 8000;

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
  useLang(); // 语言切换时触发整树重渲染
  const { username, logout } = useAuth();
  const transferQueue = useTransferQueue();
  const [route, navigate] = useHashRoute();
  const [search, setSearch] = useState("");
  const [showTransfers, setShowTransfers] = useState(false);
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [contentScrolled, setContentScrolled] = useState(false);
  const [snackQueue, setSnackQueue] = useState<SnackbarMessage[]>([]);
  const [snackOpen, setSnackOpen] = useState(false);
  const snackKeyRef = useRef(0);
  const currentSnack = snackQueue[0] ?? null;
  const [view, setView] = usePersistedState<ViewMode>("flaredrive.view", "grid");
  const [sort, setSort] = usePersistedState<SortPref>("flaredrive.sort", {
    field: "name",
    order: "asc",
  });
  const searchInputRef = useRef<HTMLInputElement>(null);
  const notified = useRef(new Set<string>());

  const pushSnack = useCallback(
    (snack: Omit<SnackbarMessage, "key">) => {
      snackKeyRef.current += 1;
      setSnackQueue((queue) => [...queue, { ...snack, key: snackKeyRef.current }]);
    },
    []
  );

  // 队列化展示：上一条退出动画结束后再弹下一条，连续消息不再互相覆盖
  useEffect(() => {
    if (snackOpen || snackQueue.length === 0) return;
    setSnackOpen(true);
  }, [snackOpen, snackQueue]);

  useEffect(() => {
    transferQueue.forEach((task) => {
      if (notified.current.has(task.id)) return;
      if (task.status === "completed") {
        notified.current.add(task.id);
        pushSnack({
          message: translate("uploadedToast", { name: task.name }),
          severity: "success",
        });
      } else if (task.status === "failed") {
        notified.current.add(task.id);
        pushSnack({
          message: translate("uploadFailedToast", { name: task.name }),
          severity: "error",
          action: { label: translate("transfers"), onClick: () => setShowTransfers(true) },
        });
      }
    });
  }, [transferQueue, pushSnack]);

  const onNotify: NotifyFn = useCallback(
    (message, severity = "info", options?: NoticeOptions) => {
      pushSnack({
        message,
        severity,
        action: options?.action,
        duration: options?.duration ?? (severity === "error" ? ERROR_SNACK_MS : undefined),
      });
    },
    [pushSnack]
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
        elevated={contentScrolled}
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
        onContentScroll={setContentScrolled}
      />
      {username === null && <LoginDialog />}
      <Snackbar
        key={currentSnack?.key}
        autoHideDuration={currentSnack?.duration ?? (currentSnack?.severity === "error" ? ERROR_SNACK_MS : DEFAULT_SNACK_MS)}
        open={snackOpen}
        onClose={() => setSnackOpen(false)}
        TransitionProps={{ onExited: () => setSnackQueue((queue) => queue.slice(1)) }}
      >
        <Alert
          severity={currentSnack?.severity ?? "info"}
          onClose={() => setSnackOpen(false)}
          action={
            currentSnack?.action ? (
              <Button
                color="inherit"
                size="small"
                onClick={() => {
                  const action = currentSnack.action;
                  setSnackOpen(false);
                  action?.onClick();
                }}
              >
                {currentSnack.action.label}
              </Button>
            ) : undefined
          }
          sx={{ width: "100%" }}
        >
          {currentSnack?.message}
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
