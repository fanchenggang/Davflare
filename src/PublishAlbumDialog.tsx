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
  albumPublishBlockReason,
  albumSelectionBytes,
  isValidSiteSlug,
  publishAlbumSite,
  siteUrl,
  suggestSiteSlug,
} from "./app/sites";
import { getLang, strings, translate } from "./app/strings";
import { FileItem } from "./app/types";
import { useSiteSlugGuard } from "./useSiteSlugGuard";
import { errorMessage, humanReadableSize } from "./app/utils";

function PublishAlbumDialog({
  open,
  images,
  ignoredCount,
  onClose,
  onNotify,
}: {
  open: boolean;
  images: FileItem[];
  ignoredCount: number;
  onClose: () => void;
  onNotify: NotifyFn;
}) {
  const [slug, setSlug] = useState("album");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [copiedCount, setCopiedCount] = useState(0);
  const [publishedSlug, setPublishedSlug] = useState("");
  const slugGuard = useSiteSlugGuard("album", null, { slug, enabled: open && !busy && !resultUrl });

  useEffect(() => {
    if (!open) return;
    const seed = images[0]?.name?.replace(/\.[^.]+$/, "") || "album";
    setSlug(suggestSiteSlug(seed));
    slugGuard.reset();
    setError(albumPublishBlockReason(images));
    setBusy(false);
    setResultUrl(null);
    setCopiedCount(0);
    setPublishedSlug("");
  }, [open, images]);

  const bytes = albumSelectionBytes(images);
  const blocked = albumPublishBlockReason(images);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const reason = albumPublishBlockReason(images);
    if (reason) {
      setError(reason);
      return;
    }
    const trimmed = slug.trim().toLowerCase();
    if (!isValidSiteSlug(trimmed)) {
      setError(translate("publishSiteBadSlug"));
      return;
    }
    setBusy(true);
    setError(null);
    if (!(await slugGuard.guard(trimmed))) {
      setBusy(false);
      return;
    }
    try {
      const result = await publishAlbumSite(
        trimmed,
        images.map((file) => file.key),
        { lang: getLang(), title: strings.siteAlbumHeading }
      );
      setCopiedCount(result.copied);
      setPublishedSlug(result.slug);
      const url = siteUrl(result.sitesHost, result.slug);
      setResultUrl(url);
      if (!url) {
        onNotify(translate("publishSiteNoHost", { slug: result.slug }), "info");
      } else {
        onNotify(translate("publishAlbumDone", { count: result.copied }), "success");
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
      onNotify(translate("publishAlbumFailed"), "error");
    }
  };

  const success = Boolean(publishedSlug);

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>{strings.publishAlbumTitle}</DialogTitle>
      {success ? (
        <>
          <DialogContent>
            <Stack spacing={2}>
              <Typography variant="body2">
                {translate("publishAlbumDone", { count: copiedCount })}
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
              <Typography variant="body2">
                {translate("publishAlbumSummary", {
                  count: images.length,
                  size: humanReadableSize(bytes),
                  slug: slug.trim().toLowerCase() || "…",
                })}
              </Typography>
              {ignoredCount > 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {translate("publishAlbumIgnored", { count: ignoredCount })}
                </Typography>
              ) : null}
              {blocked ? <Alert severity="warning">{blocked}</Alert> : null}
              {slugGuard.conflict ? (
                <Alert severity="warning">{slugGuard.conflict.message}</Alert>
              ) : null}
              <TextField
                autoFocus
                fullWidth
                label={strings.publishSiteSlug}
                value={slug}
                onChange={(event) => {
                  setSlug(event.target.value);
                  setError(blocked);
                  slugGuard.reset();
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
            <Button type="submit" variant="contained" disabled={busy || Boolean(blocked)}>
              {busy
                ? strings.publishAlbumPublishing
                : slugGuard.conflict
                  ? strings.siteSlugOverwrite
                  : strings.publishSiteSubmit}
            </Button>
          </DialogActions>
        </form>
      )}
    </Dialog>
  );
}

export default PublishAlbumDialog;
