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
  DocsPrepared,
  DocsPublishProgress,
  docsPublishBlockReason,
  docsSourceBlockReason,
  isValidSiteSlug,
  partitionMarkdownFiles,
  prepareDocsPublish,
  publishDocsSite,
  siteUrl,
  suggestSiteSlug,
} from "./app/sites";
import { getLang, strings, translate } from "./app/strings";
import { fetchPath } from "./app/transfer";
import { FileItem } from "./app/types";
import { errorMessage, humanReadableSize } from "./app/utils";

/** 入口二选一：多选里的 .md 文件，或单选文件夹（取当前层 .md）。 */
export type DocsPublishSource =
  | { kind: "files"; files: FileItem[]; ignored: number; title: string }
  | { kind: "folder"; folder: FileItem };

function progressText(progress: DocsPublishProgress | null): string {
  if (!progress || progress.phase === "plan") return strings.publishDirPreparing;
  if (progress.phase === "upload") {
    return translate("publishDocsProgress", { done: progress.done, total: progress.total });
  }
  return strings.publishDirFinishing;
}

function PublishDocsDialog({
  open,
  source,
  onClose,
  onNotify,
}: {
  open: boolean;
  source: DocsPublishSource | null;
  onClose: () => void;
  onNotify: NotifyFn;
}) {
  const [slug, setSlug] = useState("docs");
  const [loading, setLoading] = useState(false);
  const [prepared, setPrepared] = useState<DocsPrepared | null>(null);
  const [ignored, setIgnored] = useState(0);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<DocsPublishProgress | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [publishedSlug, setPublishedSlug] = useState("");
  const [publishedCount, setPublishedCount] = useState(0);

  const title = source ? (source.kind === "folder" ? source.folder.name : source.title) : "";

  useEffect(() => {
    if (!open || !source) return;
    let canceled = false;
    setSlug(suggestSiteSlug(title || "docs"));
    setPrepared(null);
    setIgnored(0);
    setBlocked(null);
    setError(null);
    setBusy(false);
    setProgress(null);
    setResultUrl(null);
    setPublishedSlug("");
    setPublishedCount(0);
    setLoading(true);
    (async () => {
      let files: FileItem[];
      let skipped = 0;
      if (source.kind === "folder") {
        let items: FileItem[];
        try {
          items = await fetchPath(`${source.folder.key}/`);
        } catch {
          throw new Error(translate("publishDirLoadFailed"));
        }
        files = partitionMarkdownFiles(items).docs;
      } else {
        files = source.files;
        skipped = source.ignored;
      }
      if (canceled) return;
      setIgnored(skipped);
      const early = docsSourceBlockReason(files);
      if (early) {
        setBlocked(early);
        return;
      }
      let ready: DocsPrepared;
      try {
        ready = await prepareDocsPublish(files);
      } catch (err) {
        throw new Error(translate("publishDocsLoadFailed", { reason: errorMessage(err) }));
      }
      if (canceled) return;
      setPrepared(ready);
      setBlocked(docsPublishBlockReason(ready));
    })()
      .catch((err) => {
        if (!canceled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
    // title 由 source 推出
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, source]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!prepared || loading || blocked) return;
    const trimmed = slug.trim().toLowerCase();
    if (!isValidSiteSlug(trimmed)) {
      setError(translate("publishSiteBadSlug"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await publishDocsSite(trimmed, prepared, {
        lang: getLang(),
        title,
        onProgress: setProgress,
      });
      setPublishedSlug(result.slug);
      setPublishedCount(prepared.docs.length);
      const url = siteUrl(result.sitesHost, result.slug);
      setResultUrl(url);
      if (!url) onNotify(translate("publishSiteNoHost", { slug: result.slug }), "info");
      else onNotify(translate("publishDocsDone", { count: prepared.docs.length }), "success");
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

  const percent =
    progress && progress.phase !== "plan" && progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : 0;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>{strings.publishDocsTitle}</DialogTitle>
      {publishedSlug ? (
        <>
          <DialogContent>
            <Stack spacing={2}>
              <Typography variant="body2">
                {translate("publishDocsDone", { count: publishedCount })}
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
                <Typography variant="body2">{strings.publishDocsLoading}</Typography>
              </Box>
            ) : (
              <Stack spacing={2}>
                {prepared ? (
                  <Typography variant="body2">
                    {translate("publishDocsSummary", {
                      docs: prepared.docs.length,
                      images: prepared.images.length,
                      size: humanReadableSize(prepared.bytes),
                      slug: slug.trim().toLowerCase() || "…",
                    })}
                  </Typography>
                ) : null}
                {source?.kind === "folder" ? (
                  <Typography variant="body2" color="text.secondary">
                    {strings.publishDocsFolderNote}
                  </Typography>
                ) : null}
                {ignored > 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    {translate("publishDocsIgnored", { count: ignored })}
                  </Typography>
                ) : null}
                {prepared && prepared.missing > 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    {translate("publishDocsMissingImages", { count: prepared.missing })}
                  </Typography>
                ) : null}
                {prepared ? (
                  <Typography variant="body2" color="text.secondary">
                    {strings.publishDocsCopyNote}
                  </Typography>
                ) : null}
                {blocked ? <Alert severity="warning">{blocked}</Alert> : null}
                {busy ? (
                  <Box role="status" aria-live="polite">
                    <Typography variant="body2" sx={{ mb: 0.5 }}>
                      {progressText(progress)}
                    </Typography>
                    <LinearProgress
                      variant={progress && progress.phase === "upload" ? "determinate" : "indeterminate"}
                      value={percent}
                    />
                  </Box>
                ) : null}
                {error ? <Alert severity="error">{error}</Alert> : null}
                {prepared ? (
                  <TextField
                    autoFocus
                    fullWidth
                    label={strings.publishSiteSlug}
                    value={slug}
                    onChange={(event) => {
                      setSlug(event.target.value);
                      setError(null);
                    }}
                    helperText={strings.publishDirSlugHint}
                    disabled={busy}
                  />
                ) : null}
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
              disabled={busy || loading || !prepared || Boolean(blocked)}
            >
              {busy ? strings.publishAlbumPublishing : strings.publishSiteSubmit}
            </Button>
          </DialogActions>
        </form>
      )}
    </Dialog>
  );
}

export default PublishDocsDialog;
