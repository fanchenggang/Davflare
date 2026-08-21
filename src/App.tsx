import { ThemeProvider } from "@emotion/react";
import {
  Alert,
  createTheme,
  CssBaseline,
  GlobalStyles,
  Snackbar,
  Stack,
} from "@mui/material";
import React, { useEffect, useRef, useState } from "react";

import Header from "./Header";
import LoginDialog from "./LoginDialog";
import Main from "./Main";
import TransferManager from "./TransferManager";
import { AuthProvider, useAuth } from "./app/auth";
import { ClipboardProvider } from "./app/clipboard";
import { SortPref, usePersistedState, ViewMode } from "./app/prefs";
import { useHashRoute } from "./app/route";
import { TransferQueueProvider, useTransferQueue } from "./app/transferQueue";

const globalStyles = (
  <GlobalStyles styles={{ "html, body, #root": { height: "100%" } }} />
);

const theme = createTheme({
  palette: { primary: { main: "#f38020" } },
});

interface SnackbarMessage {
  message: string;
  severity: "error" | "success" | "info";
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

  const goTrash = () => {
    setSearch("");
    navigate({ kind: "trash" });
  };

  const goShares = () => {
    setSearch("");
    navigate({ kind: "shares" });
  };

  return (
    <Stack sx={{ height: "100%" }}>
      <Header
        search={search}
        onSearchChange={setSearch}
        view={view}
        onViewChange={setView}
        sort={sort}
        onSortChange={setSort}
        username={username}
        onLogout={logout}
        onOpenTransfers={() => setShowTransfers(true)}
        onNavigateTrash={goTrash}
        onNavigateShares={goShares}
      />
      <Main
        search={search}
        onSearchChange={setSearch}
        onError={(error) =>
          setSnackbar({ message: error.message, severity: "error" })
        }
        view={view}
        sort={sort}
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
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {globalStyles}
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
