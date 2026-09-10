import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Link,
  Stack,
  Typography,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import RefreshIcon from "@mui/icons-material/Refresh";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutline";

import {
  fetchSetup,
  setupDocsUrl,
  type SetupCheck,
  type SetupResult,
} from "./app/setup";
import { NotifyFn } from "./app/notify";
import { getLang, strings, useLang } from "./app/strings";
import { errorMessage } from "./app/utils";

function statusChip(status: SetupCheck["status"]) {
  if (status === "green") {
    return (
      <Chip
        size="small"
        color="success"
        icon={<CheckCircleOutlineIcon />}
        label={strings.setupStatusGreen}
      />
    );
  }
  if (status === "red") {
    return (
      <Chip
        size="small"
        color="error"
        icon={<ErrorOutlineIcon />}
        label={strings.setupStatusRed}
      />
    );
  }
  return (
    <Chip
      size="small"
      color="default"
      icon={<PauseCircleOutlineIcon />}
      label={strings.setupStatusSkipped}
    />
  );
}

function checkTitle(check: SetupCheck): string {
  const lang = getLang();
  return check.title[lang] || check.title.en;
}

function checkMessage(check: SetupCheck): string {
  const lang = getLang();
  return check.message[lang] || check.message.en;
}

function SetupView({ onNotify }: { onNotify: NotifyFn }) {
  const [data, setData] = useState<SetupResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useLang();
  const lang = getLang();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchSetup());
    } catch (err) {
      setData(null);
      setError(errorMessage(err) || strings.setupLoadFailed);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const copyMcp = async () => {
    if (!data?.mcpJson) return;
    try {
      await navigator.clipboard.writeText(data.mcpJson);
      onNotify(strings.setupMcpCopied, "success");
    } catch {
      onNotify(strings.setupCopyFailed, "error");
    }
  };

  return (
    <Box sx={{ px: 2, py: 2, maxWidth: 720, minHeight: 0 }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 0.5, gap: 1, flexWrap: "wrap" }}
      >
        <Typography variant="h6">{strings.setupTitle}</Typography>
        <Button
          size="small"
          startIcon={loading ? <CircularProgress size={14} /> : <RefreshIcon />}
          onClick={() => void load()}
          disabled={loading}
        >
          {strings.setupRefresh}
        </Button>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {strings.setupHint}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading && !data && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {data && (
        <Stack spacing={1.5}>
          {data.checks.map((check) => (
            <Box
              key={check.id}
              sx={{
                px: 1.5,
                py: 1.25,
                borderRadius: 2,
                border: "1px solid",
                borderColor: "divider",
                backgroundColor: "background.paper",
              }}
            >
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                spacing={1}
                sx={{ mb: checkMessage(check) || check.flags ? 0.75 : 0 }}
              >
                <Typography sx={{ fontWeight: 700 }}>{checkTitle(check)}</Typography>
                {statusChip(check.status)}
              </Stack>
              {check.flags && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                  {[
                    `WebDAV ${check.flags.webdav ? "ON" : "OFF"}`,
                    `MCP ${check.flags.mcp ? "ON" : "OFF"}`,
                    `API Key ${check.flags.apiKey ? "ON" : "OFF"}`,
                    `Sites ${check.flags.sites ? "ON" : "OFF"}`,
                    `Image Host ${check.flags.imageHost ? "ON" : "OFF"}`,
                  ].join(" · ")}
                </Typography>
              )}
              {checkMessage(check) && (
                <Typography variant="body2" color="text.secondary">
                  {checkMessage(check)}
                  {check.docs && (
                    <>
                      {" "}
                      <Link
                        href={setupDocsUrl(check.docs, lang)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {strings.setupDocsLink}
                      </Link>
                    </>
                  )}
                </Typography>
              )}
            </Box>
          ))}

          {data.allApplicableGreen ? (
            <Alert
              severity="success"
              sx={{ mt: 1 }}
              action={
                <Button
                  color="inherit"
                  size="small"
                  startIcon={<ContentCopyIcon />}
                  onClick={() => void copyMcp()}
                >
                  {strings.setupCopyMcp}
                </Button>
              }
            >
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                {strings.setupReady}
              </Typography>
              <Box
                component="pre"
                sx={{
                  m: 0,
                  mt: 1,
                  p: 1,
                  borderRadius: 1,
                  bgcolor: "surface.code",
                  color: "surface.codeText",
                  fontSize: 12,
                  overflow: "auto",
                  maxHeight: 220,
                }}
              >
                {data.mcpJson}
              </Box>
            </Alert>
          ) : (
            <Alert severity="warning">{strings.setupNotReady}</Alert>
          )}
        </Stack>
      )}
    </Box>
  );
}

export default SetupView;
