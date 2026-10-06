import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";

import { NotifyFn } from "./app/notify";
import {
  DirPublishProgress,
  albumSelectionBytes,
  dirPublishBlockReason,
  isValidSiteSlug,
  partitionDirListing,
  publishDirSite,
  siteUrl,
  suggestSiteSlug,
} from "./app/sites";
import { getLang, strings, translate } from "./app/strings";
import { fetchPath } from "./app/transfer";
import { FileItem } from "./app/types";
import { useSiteSlugGuard } from "./useSiteSlugGuard";
import { errorMessage, humanReadableSize } from "./app/utils";

function progressText(progress: DirPublishProgress | null): string {
  if (!progress || progress.phase === "plan") return strings.publishDirPreparing;
  if (progress.phase === "copy") {
    return translate("publishDirProgress", { done: progress.done, total: progress.total });
  }
  return strings.publishDirFinishing;
}

function PublishDirDialog({
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
  const [slug, setSlug] = useState("files");
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [subdirs, setSubdirs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<DirPublishProgress | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [copiedCount, setCopiedCount] = useState(0);
  const [publishedSlug, setPublishedSlug] = useState("");
  const slugGuard = useSiteSlugGuard("dir", folder ? folder.key.replace(/^\/+|\/+$/g, "") : null);

  useEffect(() => {
    if (!open || !folder) return;
    let canceled = false;
    setSlug(suggestSiteSlug(folder.name));
    slugGuard.reset();
    setFiles([]);
    setSubdirs(0);
    setError(null);
    setBusy(false);
    setProgress(null);
    setResultUrl(null);
    setCopiedCount(0);
    setPublishedSlug("");
    setLoading(true);
    fetchPath(`${folder.key}/`)
      .then((items) => {
        if (canceled) return;
        const listing = partitionDirListing(items);
        setFiles(listing.files);
        setSubdirs(listing.subdirs);
      })
      .catch(() => {
        if (!canceled) setError(translate("publishDirLoadFailed"));
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [open, folder]);

  const bytes = albumSelectionBytes(files);
  const blocked = loading ? null : dirPublishBlockReason(files);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!folder || loading) return;
    const reason = dirPublishBlockReason(files);
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
      const result = await publishDirSite(trimmed, folder.key, {
        lang: getLang(),
        title: folder.name,
        onProgress: setProgress,
      });
      setCopiedCount(result.copied);
      setPublishedSlug(result.slug);
      const url = siteUrl(result.sitesHost, result.slug);
      setResultUrl(url);
      if (!url) onNotify(translate("publishSiteNoHost", { slug: result.slug }), "info");
      else onNotify(translate("publishDirDone", { count: result.copied }), "success");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const handleCopy = async () => {
    if (!resultUrl) return;
    try {
      await navigator.clipboard.writeText(resultUrl);
      onNotify(strings.linkCopied, "success");
    } catch {
      onNotify(translate("copyFailed2"), "error");
    }
  };

  const success = Boolean(publishedSlug);
  const percent =
    progress && progress.phase !== "plan" && progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : 0;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>{strings.publishDirTitle}</DialogTitle>
      {success ? (
        <>
          <DialogContent>
            <Stack spacing={2}>
              <Typography variant="body2">
                {translate("publishDirDone", { count: copiedCount })}
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
            {loading ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 2 }}>
                <CircularProgress size={20} />
                <Typography variant="body2">{strings.publishDirLoading}</Typography>
              </Box>
            ) : (
              <Stack spacing={2}>
                <Typography variant="body2">
                  {translate("publishDirSummary", {
                    count: files.length,
                    size: humanReadableSize(bytes),
                    slug: slug.trim().toLowerCase() || "…",
                  })}
                </Typography>
                {subdirs > 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    {translate("publishDirSubdirs", { count: subdirs })}
                  </Typography>
                ) : null}
                <Typography variant="body2" color="text.secondary">
                  {strings.publishDirCopyNote}
                </Typography>
                {blocked ? <Alert severity="warning">{blocked}</Alert> : null}
                {busy ? (
                  <Box role="status" aria-live="polite">
                    <Typography variant="body2" sx={{ mb: 0.5 }}>
                      {progressText(progress)}
                    </Typography>
                    <LinearProgress
                      variant={progress && progress.phase === "copy" ? "determinate" : "indeterminate"}
                      value={percent}
                    />
                  </Box>
                ) : null}
                {error && error !== blocked ? <Alert severity="error">{error}</Alert> : null}
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
                    setError(null);
                    slugGuard.reset();
                  }}
                  helperText={strings.publishDirSlugHint}
                  disabled={busy}
                />
              </Stack>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose} disabled={busy}>
              {strings.cancel}
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={busy || loading || Boolean(blocked)}
            >
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

export default PublishDirDialog;
