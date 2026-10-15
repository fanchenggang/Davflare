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
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import PodcastsIcon from "@mui/icons-material/Podcasts";

import { NotifyFn } from "./app/notify";
import {
  albumSelectionBytes,
  isValidSiteSlug,
  partitionDirListing,
  partitionMediaFiles,
  podcastFeedUrl,
  podcastPublishBlockReason,
  publishPodcastSite,
  siteUrl,
  suggestSiteSlug,
} from "./app/sites";
import { getLang, strings, translate } from "./app/strings";
import { fetchPath } from "./app/transfer";
import { FileItem } from "./app/types";
import { useSiteSlugGuard } from "./useSiteSlugGuard";
import { errorMessage, humanReadableSize } from "./app/utils";

function PublishPodcastDialog({
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
  const [slug, setSlug] = useState("podcast");
  const [loading, setLoading] = useState(false);
  const [media, setMedia] = useState<FileItem[]>([]);
  const [ignored, setIgnored] = useState(0);
  const [subdirs, setSubdirs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [feedUrl, setFeedUrl] = useState<string | null>(null);
  const [copiedCount, setCopiedCount] = useState(0);
  const [publishedSlug, setPublishedSlug] = useState("");
  const slugGuard = useSiteSlugGuard(
    "podcast",
    folder ? folder.key.replace(/^\/+|\/+$/g, "") : null,
    { slug, enabled: open && !busy && !resultUrl }
  );

  useEffect(() => {
    if (!open || !folder) return;
    let canceled = false;
    setSlug(suggestSiteSlug(folder.name));
    slugGuard.reset();
    setMedia([]);
    setIgnored(0);
    setSubdirs(0);
    setError(null);
    setBusy(false);
    setResultUrl(null);
    setFeedUrl(null);
    setCopiedCount(0);
    setPublishedSlug("");
    setLoading(true);
    fetchPath(`${folder.key}/`)
      .then((items) => {
        if (canceled) return;
        const listing = partitionDirListing(items);
        const parted = partitionMediaFiles(listing.files);
        setMedia(parted.media);
        setIgnored(parted.ignored);
        setSubdirs(listing.subdirs);
      })
      .catch(() => {
        if (!canceled) setError(translate("publishPodcastLoadFailed"));
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [open, folder]);

  const bytes = albumSelectionBytes(media);
  const blocked = loading ? null : podcastPublishBlockReason(media);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!folder || loading) return;
    const reason = podcastPublishBlockReason(media);
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
      const result = await publishPodcastSite(
        trimmed,
        media.map((file) => file.key),
        { lang: getLang(), title: folder.name }
      );
      setCopiedCount(result.copied);
      setPublishedSlug(result.slug);
      const page = siteUrl(result.sitesHost, result.slug);
      const feed = podcastFeedUrl(result.sitesHost, result.slug);
      setResultUrl(page);
      setFeedUrl(feed);
      if (!feed) {
        onNotify(translate("publishSiteNoHost", { slug: result.slug }), "info");
      } else {
        try {
          await navigator.clipboard.writeText(feed);
          onNotify(translate("publishPodcastDoneCopied", { count: result.copied }), "success");
        } catch {
          onNotify(translate("publishPodcastDone", { count: result.copied }), "success");
        }
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const copyText = async (text: string | null) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      onNotify(strings.linkCopied, "success");
    } catch {
      onNotify(strings.copyFailed2, "error");
    }
  };

  const success = Boolean(publishedSlug);

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        <Stack direction="row" spacing={1} alignItems="center">
          <PodcastsIcon fontSize="small" color="primary" aria-hidden />
          <span>{strings.publishPodcastTitle}</span>
        </Stack>
      </DialogTitle>
      {success ? (
        <>
          <DialogContent>
            <Stack spacing={2}>
              <Typography variant="body2">
                {translate("publishPodcastDone", { count: copiedCount })}
              </Typography>
              {feedUrl ? (
                <>
                  <TextField
                    fullWidth
                    label={strings.publishPodcastFeedUrl}
                    value={feedUrl}
                    inputProps={{ readOnly: true, "data-testid": "podcast-feed-url" }}
                  />
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Button
                      startIcon={<ContentCopyIcon />}
                      variant="contained"
                      onClick={() => void copyText(feedUrl)}
                    >
                      {strings.publishPodcastCopyFeed}
                    </Button>
                    {resultUrl ? (
                      <Button
                        startIcon={<OpenInNewIcon />}
                        href={resultUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {strings.publishPodcastOpenPage}
                      </Button>
                    ) : null}
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
                <Typography variant="body2">{strings.publishPodcastLoading}</Typography>
              </Box>
            ) : (
              <Stack spacing={2}>
                <Typography variant="body2">
                  {translate("publishPodcastSummary", {
                    count: media.length,
                    size: humanReadableSize(bytes),
                    slug: slug.trim().toLowerCase() || "…",
                  })}
                </Typography>
                {ignored > 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    {translate("publishPodcastIgnored", { count: ignored })}
                  </Typography>
                ) : null}
                {subdirs > 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    {translate("publishPodcastSubdirs", { count: subdirs })}
                  </Typography>
                ) : null}
                <Typography variant="body2" color="text.secondary">
                  {strings.publishPodcastHint}
                </Typography>
                {blocked ? <Alert severity="warning">{blocked}</Alert> : null}
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
                  helperText={strings.publishPodcastSlugHint}
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

export default PublishPodcastDialog;
