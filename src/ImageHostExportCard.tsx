import { Box, Button, Stack, Typography } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DownloadIcon from "@mui/icons-material/Download";
import PhotoLibraryIcon from "@mui/icons-material/PhotoLibrary";

import {
  IMAGE_HOST_API_KEY_PLACEHOLDER,
  buildShareXSxcuJson,
  buildTyporaCurl,
  downloadTextFile,
  shareXFilename,
} from "./app/imageHostExport";
import { NotifyFn } from "./app/notify";
import { strings, translate } from "./app/strings";

/**
 * Settings card: export ShareX .sxcu + Typora curl for the image host.
 * Always uses YOUR_API_KEY — never embeds a live key.
 */
function ImageHostExportCard({
  origin = typeof window !== "undefined" ? window.location.origin : "",
  onNotify,
}: {
  origin?: string;
  onNotify: NotifyFn;
}) {
  const sxcu = buildShareXSxcuJson(origin);
  const typora = buildTyporaCurl(origin);

  const copy = async (text: string, okMessage: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onNotify(okMessage, "success");
    } catch {
      onNotify(strings.imageHostExportCopyFailed, "error");
    }
  };

  const downloadSxcu = () => {
    try {
      downloadTextFile(shareXFilename(), sxcu);
      onNotify(strings.imageHostExportDownloaded, "success");
    } catch {
      onNotify(strings.imageHostExportDownloadFailed, "error");
    }
  };

  return (
    <Box
      component="section"
      aria-label={strings.imageHostExportTitle}
      data-testid="image-host-export-card"
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
        <PhotoLibraryIcon fontSize="small" color="primary" aria-hidden />
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {strings.imageHostExportTitle}
        </Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {strings.imageHostExportHint}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {translate("imageHostExportKeyHint", {
          placeholder: IMAGE_HOST_API_KEY_PLACEHOLDER,
        })}
      </Typography>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ mb: 1.5 }}
        data-testid="image-host-paste-hint"
      >
        {strings.pasteImageHostHint}
      </Typography>

      <Stack spacing={1.5}>
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
            {strings.imageHostExportShareXTitle}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
            {strings.imageHostExportShareXHint}
          </Typography>
          <Box
            component="pre"
            data-testid="image-host-export-sharex-preview"
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
            {sxcu.trimEnd()}
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button
              size="small"
              startIcon={<ContentCopyIcon />}
              onClick={() => void copy(sxcu, strings.imageHostExportShareXCopied)}
            >
              {strings.imageHostExportCopyShareX}
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={downloadSxcu}
            >
              {strings.imageHostExportDownloadShareX}
            </Button>
          </Stack>
        </Box>

        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
            {strings.imageHostExportTyporaTitle}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
            {strings.imageHostExportTyporaHint}
          </Typography>
          <Box
            component="pre"
            data-testid="image-host-export-typora-preview"
            sx={{
              m: 0,
              mb: 0.75,
              p: 1,
              borderRadius: 1,
              bgcolor: "surface.code",
              color: "surface.codeText",
              fontSize: 11,
              overflow: "auto",
              maxHeight: 120,
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {typora}
          </Box>
          <Button
            size="small"
            startIcon={<ContentCopyIcon />}
            onClick={() => void copy(typora, strings.imageHostExportTyporaCopied)}
          >
            {strings.imageHostExportCopyTypora}
          </Button>
        </Box>

        <Typography variant="body2" color="text.secondary">
          {strings.imageHostExportPicGoHint}
        </Typography>
      </Stack>
    </Box>
  );
}

export default ImageHostExportCard;
