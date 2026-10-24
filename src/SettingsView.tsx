import { ThemeModePreference } from "./app/prefs";
import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControlLabel,
  Stack,
  Switch,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import ChecklistIcon from "@mui/icons-material/Checklist";
import HubIcon from "@mui/icons-material/Hub";

import { FeatureFlagName, FeatureFlags, useFeatures } from "./app/features";
import { NotifyFn } from "./app/notify";
import { strings } from "./app/strings";
import { errorMessage } from "./app/utils";
import BackupCronCard from "./BackupCronCard";
import ImageHostExportCard from "./ImageHostExportCard";
import McpExportCard from "./McpExportCard";
import MobileUploadCard from "./MobileUploadCard";

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

function SettingsView({
  onNotify,
  themeMode,
  onThemeModeChange,
  onOpenSetup,
  onOpenMcp,
}: {
  onNotify: NotifyFn;
  themeMode?: ThemeModePreference;
  onThemeModeChange?: (mode: ThemeModePreference) => void;
  onOpenSetup?: () => void;
  onOpenMcp?: () => void;
}) {
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
    <Box sx={{ px: { xs: 2, sm: 4 }, py: 3, maxWidth: 960, mx: "auto", minHeight: 0 }}>
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        {strings.settingsTitle}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {strings.settingsHint}
      </Typography>
      {onThemeModeChange && <Box sx={{ p: 2.5, mb: 3, bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 3 }}>
        <Typography variant="subtitle1" sx={{ mb: 1.5 }}>{strings.appearance}</Typography>
        <ToggleButtonGroup exclusive value={themeMode} onChange={(_, mode: ThemeModePreference | null) => mode && onThemeModeChange(mode)} size="small" aria-label={strings.theme}>
          <ToggleButton value="system">{strings.themeSystem}</ToggleButton><ToggleButton value="light">{strings.themeLight}</ToggleButton><ToggleButton value="dark">{strings.themeDark}</ToggleButton>
        </ToggleButtonGroup>
      </Box>}
      {(onOpenSetup || onOpenMcp) && (
        <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap" }}>
          {onOpenSetup && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<ChecklistIcon />}
              onClick={onOpenSetup}
            >
              {strings.setupOpenFromSettings}
            </Button>
          )}
          {onOpenMcp && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<HubIcon />}
              onClick={onOpenMcp}
            >
              {strings.mcpPlayOpenFromSettings}
            </Button>
          )}
        </Stack>
      )}
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
      <Typography variant="subtitle1" sx={{ mb: 1.5 }}>{strings.featureSettings}</Typography>
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
                    slotProps={{ input: { "aria-label": strings[item.label] } }}
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
        <Typography variant="subtitle1" sx={{ pt: 2 }}>{strings.clientConnections}</Typography>
        <McpExportCard onNotify={onNotify} />
        <BackupCronCard onNotify={onNotify} />
        <ImageHostExportCard onNotify={onNotify} />
        <MobileUploadCard onNotify={onNotify} />
      </Stack>
    </Box>
  );
}

export default SettingsView;
