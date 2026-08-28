/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import VpnKeyIcon from "@mui/icons-material/VpnKey";

import {
  createApiKey,
  downloadCurlExample,
  formatApiUsage,
  listApiKeys,
  revokeApiKey,
  uploadCurlExample,
} from "./app/apikeys";
import { NotifyFn } from "./app/notify";
import { strings } from "./app/strings";
import { ApiKeyInfo } from "./app/types";

function formatExpiry(expiresAt: string | null) {
  if (!expiresAt) return strings.apiNever;
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return strings.apiNever;
  const expired = date.getTime() <= Date.now();
  return `${expired ? "已过期 · " : ""}${date.toLocaleString()}`;
}

function formatLastUsed(lastUsedAt?: string | null) {
  if (!lastUsedAt) return strings.apiNeverUsed;
  const date = new Date(lastUsedAt);
  return Number.isNaN(date.getTime())
    ? strings.apiNeverUsed
    : date.toLocaleString();
}

function ApiKeysPanel({
  open,
  onClose,
  onNotify,
}: {
  open: boolean;
  onClose: () => void;
  onNotify: NotifyFn;
}) {
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("never");
  const [customHours, setCustomHours] = useState("");
  const [customKey, setCustomKey] = useState("");
  const [created, setCreated] = useState<(ApiKeyInfo & { key: string }) | null>(
    null
  );
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const usageKey = created?.key || "<apiKey>";
  const usageText = useMemo(
    () => formatApiUsage(origin, usageKey),
    [origin, usageKey]
  );

  const load = async () => {
    setLoading(true);
    try {
      setKeys(await listApiKeys());
    } catch (error) {
      onNotify((error as Error).message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setCreated(null);
    setName("");
    setExpiry("never");
    setCustomHours("");
    setCustomKey("");
    load();
  }, [open]);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onNotify(`${label}已复制`, "success");
    } catch {
      onNotify("复制失败", "error");
    }
  };

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      onNotify("请填写密钥名称", "error");
      return;
    }
    let expiresInHours: number | null = null;
    if (expiry === "custom") {
      const hours = Number(customHours);
      if (!Number.isFinite(hours) || hours <= 0) {
        onNotify("请填写有效的自定义小时数", "error");
        return;
      }
      expiresInHours = hours;
    } else if (expiry !== "never") {
      expiresInHours = Number(expiry);
    }
    setCreating(true);
    try {
      const result = await createApiKey({
        name: trimmed,
        expiresInHours,
        key: customKey.trim() || undefined,
      });
      setCreated(result);
      setName("");
      setCustomKey("");
      setCustomHours("");
      setExpiry("never");
      await load();
      onNotify("密钥已创建，请立即复制", "success");
    } catch (error) {
      onNotify((error as Error).message, "error");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      setKeys((prev) => prev.filter((item) => item.id !== id));
      if (created?.id === id) setCreated(null);
      await revokeApiKey(id);
      onNotify("密钥已作废", "success");
    } catch (error) {
      onNotify((error as Error).message, "error");
      await load();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{strings.apiKeys}</DialogTitle>
      <DialogContent>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", padding: 3 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Stack spacing={2.5} sx={{ marginTop: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {strings.apiKeysHint}
            </Typography>

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {strings.createApiKey}
              </Typography>
              <Stack spacing={1.5}>
                <TextField
                  fullWidth
                  size="small"
                  label={strings.apiKeyName}
                  value={name}
                  onChange={(event) => setName(event.target.value.slice(0, 64))}
                  inputProps={{ maxLength: 64 }}
                />
                <FormControl fullWidth size="small">
                  <InputLabel>{strings.apiKeyExpiry}</InputLabel>
                  <Select
                    value={expiry}
                    label={strings.apiKeyExpiry}
                    onChange={(event) => setExpiry(event.target.value)}
                  >
                    <MenuItem value="never">{strings.apiNever}</MenuItem>
                    <MenuItem value="24">{strings.apiExpiry1d}</MenuItem>
                    <MenuItem value="168">{strings.apiExpiry7d}</MenuItem>
                    <MenuItem value="720">{strings.apiExpiry30d}</MenuItem>
                    <MenuItem value="custom">{strings.apiExpiryCustom}</MenuItem>
                  </Select>
                </FormControl>
                {expiry === "custom" && (
                  <TextField
                    fullWidth
                    size="small"
                    type="number"
                    label={strings.apiExpiryCustom}
                    value={customHours}
                    onChange={(event) => setCustomHours(event.target.value)}
                    inputProps={{ min: 1, step: 1 }}
                  />
                )}
                <TextField
                  fullWidth
                  size="small"
                  label={strings.apiKeyCustom}
                  placeholder={strings.apiKeyCustomHint}
                  value={customKey}
                  onChange={(event) => setCustomKey(event.target.value)}
                  helperText={strings.apiKeyCustomHint}
                />
                <Button
                  variant="contained"
                  disabled={creating}
                  onClick={handleCreate}
                  startIcon={<VpnKeyIcon />}
                >
                  {strings.createApiKey}
                </Button>
              </Stack>
            </Box>

            {created?.key && (
              <Alert
                severity="warning"
                sx={{
                  backgroundColor: "#fff8ef",
                  color: "text.primary",
                  border: "1px solid",
                  borderColor: "rgba(243, 128, 32, 0.28)",
                }}
              >
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                  {strings.apiKeyOnce}
                </Typography>
                <Typography
                  sx={{
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    wordBreak: "break-all",
                    mb: 1,
                  }}
                >
                  {created.key}
                </Typography>
                <Button
                  size="small"
                  startIcon={<ContentCopyIcon />}
                  onClick={() => copy(created.key, "密钥")}
                >
                  {strings.copyApiKey}
                </Button>
              </Alert>
            )}

            <Box>
              <Typography variant="subtitle2">已有密钥</Typography>
              {keys.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {strings.apiNoKeys}
                </Typography>
              ) : (
                <List disablePadding>
                  {keys.map((item) => (
                    <ListItem
                      key={item.id}
                      disableGutters
                      secondaryAction={
                        <Button
                          color="error"
                          size="small"
                          onClick={() => handleRevoke(item.id)}
                        >
                          {strings.revokeApiKey}
                        </Button>
                      }
                      sx={{
                        alignItems: "flex-start",
                        borderBottom: "1px solid",
                        borderColor: "divider",
                        pr: 8,
                      }}
                    >
                      <ListItemText
                        primary={`${item.name} · ${item.prefix}…`}
                        secondary={`${strings.apiKeyExpiry}：${formatExpiry(
                          item.expiresAt
                        )} · ${strings.apiLastUsed}：${formatLastUsed(
                          item.lastUsedAt
                        )}`}
                      />
                    </ListItem>
                  ))}
                </List>
              )}
            </Box>

            <Box
              sx={{
                p: 1.5,
                borderRadius: 2,
                backgroundColor: "#f7f5f1",
                border: "1px solid",
                borderColor: "divider",
              }}
            >
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {strings.apiUsage}
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: "0.8rem",
                  lineHeight: 1.55,
                }}
              >
                {usageText}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap">
                <Button
                  size="small"
                  startIcon={<ContentCopyIcon />}
                  onClick={() => copy(usageText, "调用说明")}
                >
                  {strings.copyUsage}
                </Button>
                <Button
                  size="small"
                  startIcon={<ContentCopyIcon />}
                  onClick={() =>
                    copy(
                      uploadCurlExample(origin, usageKey, "folder/"),
                      "curl 示例"
                    )
                  }
                >
                  复制 curl
                </Button>
                <Button
                  size="small"
                  startIcon={<ContentCopyIcon />}
                  onClick={() =>
                    copy(
                      downloadCurlExample(
                        origin,
                        usageKey,
                        "DBX/sync/snapshot.json"
                      ),
                      "下载 curl"
                    )
                  }
                >
                  复制下载 curl
                </Button>
              </Stack>
            </Box>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button
          startIcon={<ContentCopyIcon />}
          onClick={() => copy(usageText, "调用说明")}
          disabled={loading}
        >
          {strings.copyUsage}
        </Button>
        <Button onClick={onClose}>关闭</Button>
      </DialogActions>
    </Dialog>
  );
}

export default ApiKeysPanel;
