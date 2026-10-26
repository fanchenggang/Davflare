import { Box, Button, Stack, Typography } from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DownloadIcon from "@mui/icons-material/Download";

import {
  AGENTS_SKILL_FILENAME,
  buildDavflareSkillMarkdown,
  downloadAgentsSkillFile,
  MCP_API_KEY_ENV,
} from "./app/agentsSkill";
import { NotifyFn } from "./app/notify";
import { strings, translate } from "./app/strings";

/**
 * Settings card: copy/download the official Davflare Agent Skill (SKILL.md).
 * Separate from Connect Claude / Cursor MCP (#194) — this teaches the agent
 * how to use Davflare; it does not export mcp.json.
 */
function AgentsSkillCard({
  origin = typeof window !== "undefined" ? window.location.origin : "",
  onNotify,
}: {
  origin?: string;
  onNotify: NotifyFn;
}) {
  const skillMd = buildDavflareSkillMarkdown(origin);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(skillMd);
      onNotify(strings.agentsSkillCopied, "success");
    } catch {
      onNotify(strings.agentsSkillCopyFailed, "error");
    }
  };

  const download = () => {
    try {
      downloadAgentsSkillFile(skillMd);
      onNotify(strings.agentsSkillDownloaded, "success");
    } catch {
      onNotify(strings.agentsSkillDownloadFailed, "error");
    }
  };

  return (
    <Box
      component="section"
      aria-label={strings.agentsSkillTitle}
      data-testid="agents-skill-card"
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
        <AutoAwesomeIcon fontSize="small" color="primary" aria-hidden />
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {strings.agentsSkillTitle}
        </Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {strings.agentsSkillHint}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {translate("agentsSkillEnvHint", { env: MCP_API_KEY_ENV })}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {strings.agentsSkillVsMcpHint}
      </Typography>

      <Box
        component="pre"
        data-testid="agents-skill-preview"
        sx={{
          m: 0,
          mb: 0.75,
          p: 1,
          borderRadius: 1,
          bgcolor: "surface.code",
          color: "surface.codeText",
          fontSize: 11,
          overflow: "auto",
          maxHeight: 160,
        }}
      >
        {skillMd.slice(0, 900).trimEnd()}
        {skillMd.length > 900 ? "\n…" : ""}
      </Box>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Button
          size="small"
          startIcon={<ContentCopyIcon />}
          onClick={() => void copy()}
          data-testid="agents-skill-copy"
        >
          {strings.agentsSkillCopy}
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={<DownloadIcon />}
          onClick={download}
          data-testid="agents-skill-download"
        >
          {translate("agentsSkillDownload", { filename: AGENTS_SKILL_FILENAME })}
        </Button>
      </Stack>
    </Box>
  );
}

export default AgentsSkillCard;
