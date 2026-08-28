import {
  Alert,
  CssBaseline,
  Snackbar,
  Stack,
  ThemeProvider,
} from "@mui/material";
import React, { useCallback, useEffect, useRef, useState } from "react";

import Header from "./Header";
import LoginDialog from "./LoginDialog";
import Main from "./Main";
import TransferManager from "./TransferManager";
import { AuthProvider, useAuth } from "./app/auth";
import { ClipboardProvider } from "./app/clipboard";
import { NoticeSeverity, NotifyFn } from "./app/notify";
import { SortPref, usePersistedState, ViewMode } from "./app/prefs";
import { useHashRoute } from "./app/route";
import { appTheme } from "./app/theme";
import { TransferQueueProvider, useTransferQueue } from "./app/transferQueue";

interface SnackbarMessage {
  message: string;
  severity: NoticeSeverity;
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

function AppContent() {
  const { username, logout } = useAuth();
  const transferQueue = useTransferQueue();
  const [route, navigate] = useHashRoute();
  const [search, setSearch] = useState("");
  const [showTransfers, setShowTransfers] = useState(false);
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

  const onNotify: NotifyFn = useCallback((message, severity = "info") => {
    setSnackbar({ message, severity });
  }, []);

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
      />
      {username === null && <LoginDialog />}
      <Snackbar
        autoHideDuration={5000}
        open={Boolean(snackbar)}
        onClose={() => setSnackbar(null)}
      >
        <Alert
          severity={snackbar?.severity ?? "info"}
          onClose={() => setSnackbar(null)}
          sx={{ width: "100%" }}
        >
          {snackbar?.message}
        </Alert>
      </Snackbar>
      <TransferManager open={showTransfers} onClose={() => setShowTransfers(false)} />
    </Stack>
  );
}

function App() {
  return (
    <AuthProvider>
      <ThemeProvider theme={appTheme}>
        <CssBaseline />
        <TransferQueueProvider>
          <ClipboardProvider>
            <AppContent />
          </ClipboardProvider>
        </TransferQueueProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
