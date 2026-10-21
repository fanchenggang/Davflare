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
import AutoStoriesIcon from "@mui/icons-material/AutoStories";

import { NotifyFn } from "./app/notify";
import {
  albumSelectionBytes,
  bookshelfPublishBlockReason,
  isValidSiteSlug,
  partitionBookshelfFiles,
  partitionDirListing,
  publishBookshelfSite,
  siteUrl,
  suggestSiteSlug,
} from "./app/sites";
import { getLang, strings, translate } from "./app/strings";
import { fetchPath } from "./app/transfer";
import { FileItem } from "./app/types";
import { useSiteSlugGuard } from "./useSiteSlugGuard";
import { errorMessage, humanReadableSize } from "./app/utils";

function PublishBookshelfDialog({
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
  const [slug, setSlug] = useState("library");
  const [loading, setLoading] = useState(false);
  const [books, setBooks] = useState<FileItem[]>([]);
  const [ignored, setIgnored] = useState(0);
  const [subdirs, setSubdirs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [copiedCount, setCopiedCount] = useState(0);
  const [publishedSlug, setPublishedSlug] = useState("");
  const slugGuard = useSiteSlugGuard(
    "bookshelf",
    folder ? folder.key.replace(/^\/+|\/+$/g, "") : null,
    { slug, enabled: open && !busy && !resultUrl }
  );

  useEffect(() => {
    if (!open || !folder) return;
    let canceled = false;
    setSlug(suggestSiteSlug(folder.name));
    slugGuard.reset();
    setBooks([]);
    setIgnored(0);
    setSubdirs(0);
    setError(null);
    setBusy(false);
    setResultUrl(null);
    setCopiedCount(0);
    setPublishedSlug("");
    setLoading(true);
    fetchPath(`${folder.key}/`)
      .then((items) => {
        if (canceled) return;
        const listing = partitionDirListing(items);
        const parted = partitionBookshelfFiles(listing.files);
        setBooks(parted.assets);
        setIgnored(parted.ignored);
        setSubdirs(listing.subdirs);
      })
      .catch(() => {
        if (!canceled) setError(translate("publishBookshelfLoadFailed"));
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [open, folder]);

  const bytes = albumSelectionBytes(books);
  const blocked = loading ? null : bookshelfPublishBlockReason(books);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!folder || loading) return;
    const reason = bookshelfPublishBlockReason(books);
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
      const result = await publishBookshelfSite(
        trimmed,
        books.map((file) => file.key),
        { lang: getLang(), title: folder.name }
      );
      setCopiedCount(result.copied);
      setPublishedSlug(result.slug);
      const page = siteUrl(result.sitesHost, result.slug);
      setResultUrl(page);
      if (!page) {
        onNotify(translate("publishSiteNoHost", { slug: result.slug }), "info");
      } else {
        try {
          await navigator.clipboard.writeText(page);
          onNotify(translate("publishBookshelfDoneCopied", { count: result.copied }), "success");
        } catch {
          onNotify(translate("publishBookshelfDone", { count: result.copied }), "success");
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
          <AutoStoriesIcon fontSize="small" color="primary" aria-hidden />
          <span>{strings.publishBookshelfTitle}</span>
        </Stack>
      </DialogTitle>
      {success ? (
        <>
          <DialogContent>
            <Stack spacing={2}>
              <Typography variant="body2">
                {translate("publishBookshelfDone", { count: copiedCount })}
              </Typography>
              {resultUrl ? (
                <>
                  <TextField
                    fullWidth
                    label={strings.publishBookshelfPageUrl}
                    value={resultUrl}
                    inputProps={{ readOnly: true, "data-testid": "bookshelf-page-url" }}
                  />
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Button
                      startIcon={<ContentCopyIcon />}
                      variant="contained"
                      onClick={() => void copyText(resultUrl)}
                    >
                      {strings.publishBookshelfCopyUrl}
                    </Button>
                    <Button
                      startIcon={<OpenInNewIcon />}
                      href={resultUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {strings.publishBookshelfOpenPage}
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
                <Typography variant="body2">{strings.publishBookshelfLoading}</Typography>
              </Box>
            ) : (
              <Stack spacing={2}>
                <Typography variant="body2">
                  {translate("publishBookshelfSummary", {
                    count: books.length,
                    size: humanReadableSize(bytes),
                    slug: slug.trim().toLowerCase() || "…",
                  })}
                </Typography>
                {ignored > 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    {translate("publishBookshelfIgnored", { count: ignored })}
                  </Typography>
                ) : null}
                {subdirs > 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    {translate("publishBookshelfSubdirs", { count: subdirs })}
                  </Typography>
                ) : null}
                <Typography variant="body2" color="text.secondary">
                  {strings.publishBookshelfHint}
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
                  helperText={strings.publishBookshelfSlugHint}
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

export default PublishBookshelfDialog;
