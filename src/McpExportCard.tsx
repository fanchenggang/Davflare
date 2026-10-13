import { Box, Button, Stack, Typography } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DownloadIcon from "@mui/icons-material/Download";
import HubIcon from "@mui/icons-material/Hub";

import {
  buildClaudeDesktopMcpJson,
  buildCursorMcpJson,
  downloadTextFile,
  MCP_API_KEY_ENV,
  mcpExportFilename,
} from "./app/mcpExport";
import { NotifyFn } from "./app/notify";
import { strings, translate } from "./app/strings";

/**
 * Settings card: one-click Cursor mcp.json + Claude Desktop config export.
 * Always uses env-var placeholders — never embeds a live API key.
 */
function McpExportCard({
  origin = typeof window !== "undefined" ? window.location.origin : "",
  onNotify,
}: {
  origin?: string;
  onNotify: NotifyFn;
}) {
  const cursorJson = buildCursorMcpJson(origin);
  const claudeJson = buildClaudeDesktopMcpJson(origin);

  const copy = async (text: string, okMessage: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onNotify(okMessage, "success");
    } catch {
      onNotify(strings.mcpExportCopyFailed, "error");
    }
  };

  const download = (target: "cursor" | "claudeDesktop", content: string) => {
    try {
      downloadTextFile(mcpExportFilename(target), content);
      onNotify(strings.mcpExportDownloaded, "success");
    } catch {
      onNotify(strings.mcpExportDownloadFailed, "error");
    }
  };

  return (
    <Box
      component="section"
      aria-label={strings.mcpExportTitle}
      data-testid="mcp-export-card"
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
        <HubIcon fontSize="small" color="primary" aria-hidden />
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {strings.mcpExportTitle}
        </Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {strings.mcpExportHint}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {translate("mcpExportEnvHint", { env: MCP_API_KEY_ENV })}
      </Typography>

      <Stack spacing={1.5}>
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
            {strings.mcpExportCursorTitle}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
            {strings.mcpExportCursorHint}
          </Typography>
          <Box
            component="pre"
            data-testid="mcp-export-cursor-preview"
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
            {cursorJson.trimEnd()}
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button
              size="small"
              startIcon={<ContentCopyIcon />}
              onClick={() => void copy(cursorJson, strings.mcpExportCursorCopied)}
            >
              {strings.mcpExportCopyCursor}
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={() => download("cursor", cursorJson)}
            >
              {strings.mcpExportDownloadCursor}
            </Button>
          </Stack>
        </Box>

        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
            {strings.mcpExportClaudeTitle}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
            {strings.mcpExportClaudeHint}
          </Typography>
          <Box
            component="pre"
            data-testid="mcp-export-claude-preview"
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
            {claudeJson.trimEnd()}
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button
              size="small"
              startIcon={<ContentCopyIcon />}
              onClick={() => void copy(claudeJson, strings.mcpExportClaudeCopied)}
            >
              {strings.mcpExportCopyClaude}
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={() => download("claudeDesktop", claudeJson)}
            >
              {strings.mcpExportDownloadClaude}
            </Button>
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
}

export default McpExportCard;
