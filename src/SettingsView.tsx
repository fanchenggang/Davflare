import React, { useState } from "react";
import {
  Alert,
  Box,
  CircularProgress,
  FormControlLabel,
  Stack,
  Switch,
  Typography,
} from "@mui/material";

import { FeatureFlagName, FeatureFlags, useFeatures } from "./app/features";
import { NotifyFn } from "./app/notify";
import { strings } from "./app/strings";
import { errorMessage } from "./app/utils";

const SWITCHES: Array<{
  key: FeatureFlagName;
  label: string;
  hint: string;
}> = [
  { key: "webdav", label: "flagWebdav", hint: "flagWebdavHint" },
  { key: "mcp", label: "flagMcp", hint: "flagMcpHint" },
  { key: "apiKey", label: "flagApiKey", hint: "flagApiKeyHint" },
  { key: "sites", label: "flagSites", hint: "flagSitesHint" },
  { key: "imageHost", label: "flagImageHost", hint: "flagImageHostHint" },
];

function SettingsView({ onNotify }: { onNotify: NotifyFn }) {
  const { flags, sitesHost, updateFlags } = useFeatures();
  const [pending, setPending] = useState<FeatureFlagName | null>(null);

  const toggle = async (key: FeatureFlagName, value: boolean) => {
    setPending(key);
    try {
      await updateFlags({ [key]: value } as Partial<FeatureFlags>);
      onNotify(strings.flagSaved, "success");
    } catch (error) {
      onNotify(errorMessage(error) || strings.flagSaveFailed, "error");
    } finally {
      setPending(null);
    }
  };

  return (
    <Box sx={{ px: 2, py: 2, maxWidth: 640, minHeight: 0 }}>
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        {strings.settingsTitle}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {strings.settingsHint}
      </Typography>
      <Alert severity="info" sx={{ mb: 2 }}>
        {strings.mcpRequiresApiKey}
      </Alert>
      {!sitesHost && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {strings.imagesHostMissing}
          </Typography>
          <Typography variant="body2">{strings.imagesHostMissingHint}</Typography>
        </Alert>
      )}
      <Stack spacing={1.5}>
        {SWITCHES.map((item) => (
          <Box
            key={item.key}
            sx={{
              px: 1.5,
              py: 1,
              borderRadius: 2,
              border: "1px solid",
              borderColor: "divider",
              backgroundColor: "background.paper",
            }}
          >
            <FormControlLabel
              sx={{ alignItems: "flex-start", ml: 0, mr: 0, width: "100%" }}
              control={
                pending === item.key ? (
                  <CircularProgress size={22} sx={{ mx: 1.25, mt: 0.75 }} />
                ) : (
                  <Switch
                    checked={flags[item.key]}
                    onChange={(event) => toggle(item.key, event.target.checked)}
                    inputProps={{ "aria-label": strings[item.label] }}
                  />
                )
              }
              label={
                <Box sx={{ py: 0.5 }}>
                  <Typography sx={{ fontWeight: 700 }}>{strings[item.label]}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {strings[item.hint]}
                  </Typography>
                </Box>
              }
            />
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

export default SettingsView;
