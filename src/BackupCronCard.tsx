import { Box, Button, Stack, Typography } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import BackupIcon from "@mui/icons-material/Backup";

import {
  BACKUP_KEY_ENV,
  BACKUP_SERVER_ENV,
  buildBackupCronBlock,
  buildConfigFileCrontab,
} from "./app/backupCron";
import { NotifyFn } from "./app/notify";
import { strings, translate } from "./app/strings";

/**
 * Settings card: one-click crontab lines for `davflare sync push|pull`.
 * Credentials stay in ~/.config/davflare or env files — never in the copied text.
 */
function BackupCronCard({
  origin = typeof window !== "undefined" ? window.location.origin : "",
  onNotify,
}: {
  origin?: string;
  onNotify: NotifyFn;
}) {
  const block = buildBackupCronBlock(origin);
  const pushLine = buildConfigFileCrontab("push");
  const pullLine = buildConfigFileCrontab("pull", {
    schedule: "30 3 * * *",
    logFile: "~/logs/davflare-pull.log",
  });

  const copy = async (text: string, okMessage: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onNotify(okMessage, "success");
    } catch {
      onNotify(strings.backupCronCopyFailed, "error");
    }
  };

  return (
    <Box
      component="section"
      aria-label={strings.backupCronTitle}
      data-testid="backup-cron-card"
      sx={{
        px: 1.5,
        py: 1.5,
        borderRadius: 2,
        border: "1px solid",
        borderColor: "divider",
        backgroundColor: "background.paper",
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
        <BackupIcon fontSize="small" color="primary" aria-hidden />
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {strings.backupCronTitle}
        </Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {strings.backupCronHint}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {translate("backupCronEnvHint", {
          serverEnv: BACKUP_SERVER_ENV,
          keyEnv: BACKUP_KEY_ENV,
        })}
      </Typography>

      <Stack spacing={1.5}>
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
            {strings.backupCronPushTitle}
          </Typography>
          <Box
            component="pre"
            data-testid="backup-cron-push-preview"
            sx={{
              m: 0,
              mb: 0.75,
              p: 1,
              borderRadius: 1,
              bgcolor: "surface.code",
              color: "surface.codeText",
              fontSize: 11,
              overflow: "auto",
              maxHeight: 80,
            }}
          >
            {pushLine}
          </Box>
          <Button
            size="small"
            startIcon={<ContentCopyIcon />}
            onClick={() => void copy(pushLine, strings.backupCronPushCopied)}
          >
            {strings.backupCronCopyPush}
          </Button>
        </Box>

        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
            {strings.backupCronPullTitle}
          </Typography>
          <Box
            component="pre"
            data-testid="backup-cron-pull-preview"
            sx={{
              m: 0,
              mb: 0.75,
              p: 1,
              borderRadius: 1,
              bgcolor: "surface.code",
              color: "surface.codeText",
              fontSize: 11,
              overflow: "auto",
              maxHeight: 80,
            }}
          >
            {pullLine}
          </Box>
          <Button
            size="small"
            startIcon={<ContentCopyIcon />}
            onClick={() => void copy(pullLine, strings.backupCronPullCopied)}
          >
            {strings.backupCronCopyPull}
          </Button>
        </Box>

        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
            {strings.backupCronFullTitle}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
            {strings.backupCronFullHint}
          </Typography>
          <Box
            component="pre"
            data-testid="backup-cron-full-preview"
            sx={{
              m: 0,
              mb: 0.75,
              p: 1,
              borderRadius: 1,
              bgcolor: "surface.code",
              color: "surface.codeText",
              fontSize: 11,
              overflow: "auto",
              maxHeight: 200,
            }}
          >
            {block.trimEnd()}
          </Box>
          <Button
            size="small"
            startIcon={<ContentCopyIcon />}
            onClick={() => void copy(block, strings.backupCronFullCopied)}
          >
            {strings.backupCronCopyFull}
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}

export default BackupCronCard;
