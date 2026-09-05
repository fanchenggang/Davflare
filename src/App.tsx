import {
  Alert,
  Box,
  Button,
  CssBaseline,
  Snackbar,
  Stack,
  ThemeProvider,
  useMediaQuery,
} from "@mui/material";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ApiKeysPanel from "./ApiKeysPanel";
import CommandPalette from "./CommandPalette";
import Header from "./Header";
import LoginDialog from "./LoginDialog";
import Main from "./Main";
import TransferManager from "./TransferManager";
import { AuthProvider, useAuth } from "./app/auth";
import { FeaturesProvider, useFeatures } from "./app/features";
import { ClipboardProvider } from "./app/clipboard";
import { NoticeAction, NoticeOptions, NoticeSeverity, NotifyFn } from "./app/notify";
import { strings, translate, useLang } from "./app/strings";
import {
  SortPref,
  ThemeModePreference,
  usePersistedState,
  ViewMode,
} from "./app/prefs";
import { useHashRoute } from "./app/route";
import { MOTION, Z_INDEX, createAppTheme } from "./app/theme";
import { TransferQueueProvider, useTransferQueue } from "./app/transferQueue";

export interface SnackbarMessage {
  key: number;
  message: string;
  severity: NoticeSeverity;
  action?: NoticeAction;
  duration?: number;
}

/** error 排队；success/info 立刻顶到队首并丢掉已排队的非 error。 */
export function enqueueSnack(
  queue: SnackbarMessage[],
  next: SnackbarMessage
): SnackbarMessage[] {
  if (next.severity === "error") {
    return [...queue, next];
  }
  return [next, ...queue.filter((s) => s.severity === "error")];
}

const DEFAULT_SNACK_MS = 5000;
const ERROR_SNACK_MS = 8000;

function isTypingTarget(target: EventTarget | null) {
  const el =
    target instanceof HTMLElement
      ? target
      : document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  if (!el) return false;
  const field = el.closest("input, textarea, select, [contenteditable='true']");
  if (field instanceof HTMLInputElement) {
    return !["checkbox", "radio", "button", "submit"].includes(field.type);
  }
  if (field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
    return true;
  }
  return Boolean(field) || el.isContentEditable;
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
  const { flags } = useFeatures();
  const transferQueue = useTransferQueue();
  const [route, navigate] = useHashRoute();
  const [search, setSearch] = useState("");
  const [showTransfers, setShowTransfers] = useState(false);
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
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
      const next = { ...snack, key: snackKeyRef.current };
      setSnackQueue((queue) => enqueueSnack(queue, next));
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
      if (event.isComposing || event.key === "Process") return;
      const cmdK =
        (event.key === "k" || event.key === "K") &&
        (event.metaKey || event.ctrlKey);
      if (cmdK) {
        // 命令面板快捷键即使在输入框聚焦时也要生效，故先于 isTypingTarget 判断
        event.preventDefault();
        setShowPalette(true);
        return;
      }
      if (isTypingTarget(event.target) || isTypingTarget(document.activeElement)) {
        return;
      }
      const slash = event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey;
      if (slash) {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <Stack sx={{ height: "100%", minHeight: 0, overflow: "hidden", backgroundColor: "background.default" }}>
      <Button
        href="#main-content"
        sx={{
          position: "absolute",
          left: 16,
          top: -48,
          zIndex: Z_INDEX.dragOverlay,
          transition: `top ${MOTION.fast}ms ease`,
          "&:focus-visible": { top: 8 },
        }}
      >
        {strings.skipToContent}
      </Button>
      <Header
        search={search}
        onSearchChange={setSearch}
        searchInputRef={searchInputRef}
        username={username}
        onLogout={logout}
        onOpenTransfers={() => setShowTransfers(true)}
        onOpenApi={() => flags.apiKey && setShowApiKeys(true)}
        onOpenSettings={() => navigate({ kind: "settings" })}
        themeMode={themeMode}
        onThemeModeChange={onThemeModeChange}
        elevated={contentScrolled}
      />
      <Box
        component="main"
        sx={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
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
        onOpenApi={() => flags.apiKey && setShowApiKeys(true)}
          onContentScroll={setContentScrolled}
        />
      </Box>
      {username === null && <LoginDialog />}
      <Snackbar
        key={currentSnack?.key}
        autoHideDuration={currentSnack?.duration ?? (currentSnack?.severity === "error" ? ERROR_SNACK_MS : DEFAULT_SNACK_MS)}
        open={snackOpen}
        onClose={() => setSnackOpen(false)}
        TransitionProps={{ onExited: () => setSnackQueue((queue) => queue.slice(1)) }}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        sx={{ top: { xs: 64, sm: 72 } }}
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
      <CommandPalette
        open={showPalette}
        onClose={() => setShowPalette(false)}
        onNavigate={navigate}
        onNotify={onNotify}
        onOpenTransfers={() => setShowTransfers(true)}
        onThemeToggle={() =>
          onThemeModeChange(themeMode === "dark" ? "light" : "dark")
        }
      />
      {flags.apiKey && (
        <ApiKeysPanel
          open={showApiKeys}
          onClose={() => setShowApiKeys(false)}
          onNotify={onNotify}
        />
      )}
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
      <FeaturesProvider>
        <TransferQueueProvider>
          <ClipboardProvider>
            <ThemedApp />
          </ClipboardProvider>
        </TransferQueueProvider>
      </FeaturesProvider>
    </AuthProvider>
  );
}

export default App;
