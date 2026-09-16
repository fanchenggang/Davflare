import React, { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";

import { NotifyFn } from "./app/notify";
import {
  isValidSiteSlug,
  publishSite,
  siteUrl,
  suggestSiteSlug,
} from "./app/sites";
import { strings, translate } from "./app/strings";
import { FileItem } from "./app/types";
import { errorMessage } from "./app/utils";

function PublishSiteDialog({
  open,
  folder,
  onClose,
  onNotify,
}: {
  open: boolean;
  folder: FileItem | null;
  onClose: () => void;
  onNotify: NotifyFn;
}) {
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [copiedCount, setCopiedCount] = useState(0);
  const [publishedSlug, setPublishedSlug] = useState("");

  useEffect(() => {
    if (open && folder) {
      setSlug(suggestSiteSlug(folder.name));
      setError(null);
      setBusy(false);
      setResultUrl(null);
      setCopiedCount(0);
      setPublishedSlug("");
    }
  }, [open, folder]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!folder) return;
    const trimmed = slug.trim().toLowerCase();
    if (!isValidSiteSlug(trimmed)) {
      setError(translate("publishSiteBadSlug"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await publishSite(folder.key, trimmed);
      setCopiedCount(result.copied);
      setPublishedSlug(result.slug);
      const url = siteUrl(result.sitesHost, result.slug);
      setResultUrl(url);
      if (!url) {
        onNotify(translate("publishSiteNoHost", { slug: result.slug }), "info");
      } else {
        onNotify(translate("publishSiteDone", { count: result.copied }), "success");
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!resultUrl) return;
    try {
      await navigator.clipboard.writeText(resultUrl);
      onNotify(strings.linkCopied, "success");
    } catch {
      onNotify(translate("publishSiteFailed"), "error");
    }
  };

  const success = Boolean(publishedSlug);

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>{strings.publishSiteTitle}</DialogTitle>
      {success ? (
        <>
          <DialogContent>
            <Stack spacing={2}>
              <Typography variant="body2">
                {translate("publishSiteDone", { count: copiedCount })}
              </Typography>
              {resultUrl ? (
                <>
                  <TextField
                    fullWidth
                    label={strings.publishSiteUrl}
                    value={resultUrl}
                    InputProps={{ readOnly: true }}
                  />
                  <Stack direction="row" spacing={1}>
                    <Button
                      startIcon={<ContentCopyIcon />}
                      variant="contained"
                      onClick={() => void handleCopy()}
                    >
                      {strings.publishSiteCopyUrl}
                    </Button>
                    <Button
                      startIcon={<OpenInNewIcon />}
                      href={resultUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {strings.publishSiteOpen}
                    </Button>
                  </Stack>
                </>
              ) : (
                <Alert severity="info">
                  {translate("publishSiteNoHost", { slug: publishedSlug })}
                </Alert>
              )}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>{strings.close}</Button>
          </DialogActions>
        </>
      ) : (
        <form onSubmit={(event) => void handleSubmit(event)}>
          <DialogContent>
            <Stack spacing={2}>
              <TextField
                fullWidth
                label={strings.publishSiteSource}
                value={folder?.key ?? ""}
                InputProps={{ readOnly: true }}
              />
              <TextField
                autoFocus
                fullWidth
                label={strings.publishSiteSlug}
                value={slug}
                onChange={(event) => {
                  setSlug(event.target.value);
                  setError(null);
                }}
                error={Boolean(error)}
                helperText={error || strings.publishSiteSlugHint}
                disabled={busy}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose} disabled={busy}>
              {strings.cancel}
            </Button>
            <Button type="submit" variant="contained" disabled={busy}>
              {busy ? strings.publishSitePublishing : strings.publishSiteSubmit}
            </Button>
          </DialogActions>
        </form>
      )}
    </Dialog>
  );
}

export default PublishSiteDialog;
