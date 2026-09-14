import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  InputAdornment,
  Link,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import ListAltIcon from "@mui/icons-material/ListAlt";

import { useFeatures } from "./app/features";
import {
  buildMcpJsonSnippet,
  loadStoredApiKey,
  mcpToolsList,
  mcpTryListRoot,
  storeApiKey,
  type McpToolInfo,
} from "./app/mcpPlayground";
import { NotifyFn } from "./app/notify";
import { strings, translate, useLang } from "./app/strings";
import { errorMessage } from "./app/utils";

type StepStatus = "idle" | "loading" | "green" | "red";

function statusIcon(status: StepStatus) {
  if (status === "green") {
    return <CheckCircleOutlineIcon color="success" fontSize="small" />;
  }
  if (status === "red") {
    return <ErrorOutlineIcon color="error" fontSize="small" />;
  }
  if (status === "loading") {
    return <CircularProgress size={16} />;
  }
  return null;
}

function McpPlaygroundView({
  onNotify,
  onOpenSettings,
}: {
  onNotify: NotifyFn;
  onOpenSettings?: () => void;
}) {
  useLang();
  const { flags } = useFeatures();
  const origin =
    typeof window === "undefined" ? "" : window.location.origin;

  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  const [listStatus, setListStatus] = useState<StepStatus>("idle");
  const [listError, setListError] = useState<string | null>(null);
  const [tools, setTools] = useState<McpToolInfo[]>([]);

  const [tryStatus, setTryStatus] = useState<StepStatus>("idle");
  const [tryError, setTryError] = useState<string | null>(null);
  const [tryText, setTryText] = useState<string>("");

  useEffect(() => {
    setApiKey(loadStoredApiKey());
  }, []);

  const mcpJson = useMemo(
    () => buildMcpJsonSnippet(origin, apiKey.trim() || "<apiKey>"),
    [apiKey, origin]
  );

  const bothGreen = listStatus === "green" && tryStatus === "green";
  // Tip is only for when MCP/API Key switches are off — hide once features are
  // enabled or the playground Key checks already succeeded.
  const featuresReady = flags.mcp && flags.apiKey;
  const showEnableTip = !featuresReady && !bothGreen;

  const onKeyChange = (value: string) => {
    setApiKey(value);
    storeApiKey(value);
    // Reset check state when the key changes so copy stays gated correctly.
    setListStatus("idle");
    setListError(null);
    setTools([]);
    setTryStatus("idle");
    setTryError(null);
    setTryText("");
  };

  const runToolsList = useCallback(async () => {
    const key = apiKey.trim();
    if (!key) {
      onNotify(strings.mcpPlayNeedKey, "error");
      return;
    }
    setListStatus("loading");
    setListError(null);
    try {
      const next = await mcpToolsList(key);
      setTools(next);
      setListStatus("green");
      onNotify(translate("mcpPlayListOk", { count: next.length }), "success");
    } catch (err) {
      setTools([]);
      setListStatus("red");
      const message = errorMessage(err) || strings.mcpPlayListFailed;
      setListError(message);
      onNotify(message, "error");
    }
  }, [apiKey, onNotify]);

  const runTryList = useCallback(async () => {
    const key = apiKey.trim();
    if (!key) {
      onNotify(strings.mcpPlayNeedKey, "error");
      return;
    }
    setTryStatus("loading");
    setTryError(null);
    try {
      const result = await mcpTryListRoot(key);
      if (result.isError) {
        setTryStatus("red");
        setTryText(result.text);
        setTryError(result.text || strings.mcpPlayTryFailed);
        onNotify(strings.mcpPlayTryFailed, "error");
        return;
      }
      setTryText(result.text);
      setTryStatus("green");
      onNotify(strings.mcpPlayTryOk, "success");
    } catch (err) {
      setTryText("");
      setTryStatus("red");
      const message = errorMessage(err) || strings.mcpPlayTryFailed;
      setTryError(message);
      onNotify(message, "error");
    }
  }, [apiKey, onNotify]);

  const copyMcp = async () => {
    try {
      await navigator.clipboard.writeText(mcpJson);
      onNotify(strings.setupMcpCopied, "success");
    } catch {
      onNotify(strings.setupCopyFailed, "error");
    }
  };

  return (
    <Box sx={{ px: 2, py: 2, maxWidth: 720, minHeight: 0 }}>
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        {strings.mcpPlayTitle}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {strings.mcpPlayHint}
      </Typography>

      {showEnableTip && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {strings.mcpPlayInfo}
          {onOpenSettings && (
            <>
              {" "}
              <Link
                component="button"
                type="button"
                onClick={onOpenSettings}
                sx={{ verticalAlign: "baseline" }}
              >
                {strings.mcpPlayOpenSettings}
              </Link>
            </>
          )}
        </Alert>
      )}

      <TextField
        fullWidth
        size="small"
        label={strings.mcpPlayKeyLabel}
        placeholder={strings.mcpPlayKeyPlaceholder}
        type={showKey ? "text" : "password"}
        value={apiKey}
        onChange={(event) => onKeyChange(event.target.value)}
        autoComplete="off"
        sx={{ mb: 2 }}
        slotProps={{
          input: {
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  aria-label={
                    showKey ? strings.mcpPlayHideKey : strings.mcpPlayShowKey
                  }
                  onClick={() => setShowKey((v) => !v)}
                  edge="end"
                  size="small"
                >
                  {showKey ? <VisibilityOffIcon /> : <VisibilityIcon />}
                </IconButton>
              </InputAdornment>
            ),
          },
        }}
      />

      <Stack spacing={1.5}>
        <Box
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
            sx={{ mb: 1, flexWrap: "wrap", gap: 1 }}
          >
            <Stack direction="row" alignItems="center" spacing={1}>
              {statusIcon(listStatus)}
              <Typography sx={{ fontWeight: 700 }}>
                {strings.mcpPlayListTitle}
              </Typography>
            </Stack>
            <Button
              size="small"
              variant="contained"
              startIcon={
                listStatus === "loading" ? (
                  <CircularProgress size={14} color="inherit" />
                ) : (
                  <ListAltIcon />
                )
              }
              onClick={() => void runToolsList()}
              disabled={listStatus === "loading" || !apiKey.trim()}
            >
              {strings.mcpPlayListAction}
            </Button>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {strings.mcpPlayListHint}
          </Typography>
          {listError && (
            <Alert severity="error" sx={{ mb: 1 }}>
              {listError}
            </Alert>
          )}
          {tools.length > 0 && (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
              {tools.map((tool) => (
                <Chip
                  key={tool.name}
                  size="small"
                  label={tool.name}
                  title={tool.description || tool.name}
                  variant="outlined"
                />
              ))}
            </Box>
          )}
        </Box>

        <Box
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
            sx={{ mb: 1, flexWrap: "wrap", gap: 1 }}
          >
            <Stack direction="row" alignItems="center" spacing={1}>
              {statusIcon(tryStatus)}
              <Typography sx={{ fontWeight: 700 }}>
                {strings.mcpPlayTryTitle}
              </Typography>
            </Stack>
            <Button
              size="small"
              variant="outlined"
              startIcon={
                tryStatus === "loading" ? (
                  <CircularProgress size={14} color="inherit" />
                ) : (
                  <PlayArrowIcon />
                )
              }
              onClick={() => void runTryList()}
              disabled={tryStatus === "loading" || !apiKey.trim()}
            >
              {strings.mcpPlayTryAction}
            </Button>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {strings.mcpPlayTryHint}
          </Typography>
          {tryError && (
            <Alert severity="error" sx={{ mb: 1 }}>
              {tryError}
            </Alert>
          )}
          {tryText && (
            <Box
              component="pre"
              sx={{
                m: 0,
                p: 1,
                borderRadius: 1,
                bgcolor: "surface.code",
                color: "surface.codeText",
                fontSize: 12,
                overflow: "auto",
                maxHeight: 220,
              }}
            >
              {tryText}
            </Box>
          )}
        </Box>

        {bothGreen ? (
          <Alert
            severity="success"
            sx={{ mt: 0.5 }}
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
              {strings.mcpPlayReady}
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
              {mcpJson}
            </Box>
          </Alert>
        ) : (
          <Alert severity="info">{strings.mcpPlayNotReady}</Alert>
        )}
      </Stack>
    </Box>
  );
}

export default McpPlaygroundView;
