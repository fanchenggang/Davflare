import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Skeleton,
  Stack,
  Switch,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  CloudUpload as DeployIcon,
  ContentCopy as ContentCopyIcon,
  Delete as DeleteIcon,
  FolderOpen as FolderOpenIcon,
  Language as LanguageIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";
import { unzip } from "fflate";

import ConfirmDialog from "./ConfirmDialog";
import EmptyState from "./EmptyState";
import { NotifyFn } from "./app/notify";
import { SiteInfo, SitesResponse, deleteSite, listSites, siteUrl, updateSiteConfig } from "./app/sites";
import { strings, translate } from "./app/strings";
import { useUploadEnqueue } from "./app/transferQueue";
import { errorMessage, humanReadableSize } from "./app/utils";

/** 把 zip 条目路径规范成站点目录下的安全相对路径；不安全（穿越/绝对路径）返回 null。 */
function safeArchivePath(path: string): string | null {
  if (!path || path.startsWith("/") || /^[A-Za-z]:/.test(path)) return null;
  // Windows 风格 zip 也可能用反斜杠，统一按 / 解析后再判断穿越。
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.some((part) => part === ".." || part === ".")) return null;
  return parts.join("/");
}

/** fflate unzip 的 Promise 封装；跳过目录条目与 macOS 压缩噪声，并过滤不安全路径 */
async function unzipToFiles(
  data: ArrayBuffer
): Promise<{ files: File[]; totalSize: number }> {
  const entries = await new Promise<Record<string, Uint8Array>>(
    (resolve, reject) => unzip(new Uint8Array(data), (error, out) => (error ? reject(error) : resolve(out)))
  );
  const files: File[] = [];
  let totalSize = 0;
  for (const [rawPath, content] of Object.entries(entries)) {
    const pathForSkip = rawPath.replace(/\\/g, "/");
    if (
      pathForSkip.endsWith("/") ||
      pathForSkip.startsWith("__MACOSX/") ||
      pathForSkip.includes("/__MACOSX/")
    ) {
      continue;
    }
    // zip-slip 防御：只保留相对且不包含 . / .. 的条目；上传队列会按
    // webkitRelativePath 拼进 sites/<slug>/，不能让 zip 内容逃出站点前缀。
    const path = safeArchivePath(rawPath);
    if (path === null) continue;
    const file = new File([content], path.split("/").pop() || path);
    Object.defineProperty(file, "webkitRelativePath", { value: path });
    files.push(file);
    totalSize += content.byteLength;
  }
  return { files, totalSize };
}

const DEPLOY_MAX_FILES = 2000;
const DEPLOY_MAX_BYTES = 200 * 1000 * 1000;

function SiteCard({
  site,
  sitesHost,
  onNotify,
  onManageFiles,
  onToggleSpa,
  onDeploy,
  onRequestDelete,
}: {
  site: SiteInfo;
  sitesHost: string | null;
  onNotify: NotifyFn;
  onManageFiles: (slug: string) => void;
  onToggleSpa: (site: SiteInfo, spa: boolean) => void;
  onDeploy: (site: SiteInfo) => void;
  onRequestDelete: (site: SiteInfo) => void;
}) {
  const url = siteUrl(sitesHost, site.slug);
  const copyUrl = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      onNotify(translate("linkCopied"), "success");
    } catch {
      onNotify(translate("copyFailed2"), "error");
    }
  };

  const statsLine = site.stats
    ? [
        translate("siteFilesCount", { count: site.stats.objects }),
        humanReadableSize(site.stats.size),
        site.stats.truncated ? translate("siteStatsTruncated") : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <ListItem
      sx={{
        mx: 1,
        mb: 0.5,
        borderRadius: 2,
        border: "1px solid",
        borderColor: "divider",
        backgroundColor: "background.paper",
      }}
      secondaryAction={
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Tooltip title={strings.siteSpaLabel}>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mr: 0.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                SPA
              </Typography>
              <Switch
                size="small"
                checked={site.spa}
                onChange={(event) => onToggleSpa(site, event.target.checked)}
                slotProps={{ input: { "aria-label": strings.siteSpaLabel } }}
              />
            </Stack>
          </Tooltip>
          <Tooltip title={strings.openSite}>
            <span>
              <IconButton
                size="small"
                disabled={!url}
                onClick={() => url && window.open(url, "_blank", "noopener,noreferrer")}
                aria-label={strings.openSite}
              >
                <LanguageIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={strings.manageFiles}>
            <IconButton
              size="small"
              onClick={() => onManageFiles(site.slug)}
              aria-label={strings.manageFiles}
            >
              <FolderOpenIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Button size="small" startIcon={<DeployIcon />} onClick={() => onDeploy(site)}>
            {strings.deployZip}
          </Button>
          <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={() => onRequestDelete(site)}>
            {strings.deleteSite}
          </Button>
        </Stack>
      }
    >
      <ListItemText
        primary={
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography component="span" sx={{ fontWeight: 600 }}>
              {site.slug}
            </Typography>
            <Chip
              label={site.spa ? "SPA" : strings.siteStaticBadge}
              size="small"
              color={site.spa ? "primary" : "default"}
              sx={{ height: 20, fontSize: "0.7rem" }}
            />
          </Stack>
        }
        secondary={
          <>
            <Stack
              direction="row"
              spacing={0.5}
              alignItems="center"
              sx={{ display: "inline-flex", maxWidth: "100%" }}
            >
              <Typography
                component="span"
                variant="body2"
                sx={{ wordBreak: "break-all", display: "block" }}
              >
                {url || strings.sitesHostMissing}
              </Typography>
              {url && (
                <IconButton size="small" onClick={copyUrl} aria-label={strings.copy} sx={{ p: 0.25 }}>
                  <ContentCopyIcon sx={{ fontSize: 14 }} />
                </IconButton>
              )}
            </Stack>
            {statsLine && (
              <Typography component="span" variant="caption" sx={{ display: "block" }}>
                {statsLine}
              </Typography>
            )}
          </>
        }
      />
    </ListItem>
  );
}

function SitesView({
  onNotify,
  onGoFiles,
  onManageFiles,
}: {
  onNotify: NotifyFn;
  onGoFiles?: () => void;
  onManageFiles: (slug: string) => void;
}) {
  const enqueue = useUploadEnqueue();
  const [data, setData] = useState<SitesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [deploySite, setDeploySite] = useState<SiteInfo | null>(null);
  const [deployFile, setDeployFile] = useState<{ file: File; files: File[]; totalSize: number } | null>(null);
  const [deployClear, setDeployClear] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SiteInfo | null>(null);

  const load = useCallback(
    async (withStats: boolean) => {
      try {
        setData(await listSites(withStats));
      } catch (error) {
        if (!withStats) onNotify(errorMessage(error), "error");
      }
    },
    [onNotify]
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load(false);
      setLoading(false);
      // 统计懒加载：列表先出，再静默补文件数/大小
      load(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleSpa = async (site: SiteInfo, spa: boolean) => {
    setData((prev) =>
      prev
        ? { ...prev, sites: prev.sites.map((item) => (item.slug === site.slug ? { ...item, spa } : item)) }
        : prev
    );
    try {
      await updateSiteConfig(site.slug, spa);
      onNotify(translate("siteConfigSaved"), "success");
    } catch (error) {
      onNotify(errorMessage(error), "error");
      await load(false);
    }
  };

  const handlePickZip = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { files, totalSize } = await unzipToFiles(await file.arrayBuffer());
      if (files.length === 0) {
        onNotify(translate("deployZipInvalid"), "error");
        return;
      }
      if (files.length > DEPLOY_MAX_FILES || totalSize > DEPLOY_MAX_BYTES) {
        onNotify(translate("deployZipTooLarge"), "error");
        return;
      }
      setDeployFile({ file, files, totalSize });
    } catch {
      onNotify(translate("deployZipFailed"), "error");
    }
  };

  const handleDeploy = async () => {
    if (!deploySite || !deployFile) return;
    setDeploying(true);
    try {
      if (deployClear) await deleteSite(deploySite.slug);
      enqueue(
        ...deployFile.files.map((file) => ({ basedir: `sites/${deploySite.slug}/`, file }))
      );
      onNotify(translate("deployZipEnqueued", { count: deployFile.files.length }), "success");
      setDeploySite(null);
      setDeployFile(null);
    } catch (error) {
      onNotify(errorMessage(error), "error");
    } finally {
      setDeploying(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const site = pendingDelete;
    setPendingDelete(null);
    try {
      const deleted = await deleteSite(site.slug, { purge: true });
      onNotify(translate("siteDeleted", { name: site.slug, count: deleted }), "success");
      await load(false);
    } catch (error) {
      onNotify(errorMessage(error), "error");
    }
  };

  if (loading) {
    return (
      <Box sx={{ px: 2, py: 2 }}>
        {Array.from({ length: 3 }).map((_, index) => (
          <Box key={index} sx={{ py: 1.25 }}>
            <Skeleton variant="text" width="30%" height={28} />
            <Skeleton variant="text" width="70%" />
          </Box>
        ))}
      </Box>
    );
  }

  const sites = data?.sites ?? [];

  return (
    <>
      <Box sx={{ padding: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="h6">{strings.sitesTitle}</Typography>
          <IconButton size="small" onClick={() => load(false)} aria-label={strings.refresh}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Box>
      {data && !data.sitesHost && (
        <Alert severity="warning" sx={{ mx: 2, mb: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {strings.sitesHostMissing}
          </Typography>
          <Typography variant="body2">{strings.sitesHostMissingHint}</Typography>
        </Alert>
      )}
      {sites.length === 0 ? (
        <EmptyState
          variant="folder"
          icon={<LanguageIcon />}
          title={strings.emptySites}
          description={strings.emptySitesHint}
          actions={
            onGoFiles ? (
              <Button variant="contained" onClick={onGoFiles}>
                {strings.goToFiles}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <List>
          {sites.map((site) => (
            <SiteCard
              key={site.slug}
              site={site}
              sitesHost={data?.sitesHost ?? null}
              onNotify={onNotify}
              onManageFiles={onManageFiles}
              onToggleSpa={handleToggleSpa}
              onDeploy={setDeploySite}
              onRequestDelete={setPendingDelete}
            />
          ))}
        </List>
      )}

      <Dialog
        open={Boolean(deploySite)}
        onClose={() => {
          setDeploySite(null);
          setDeployFile(null);
        }}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>
          {deploySite ? translate("deployZipTitle", { name: deploySite.slug }) : ""}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <Button variant="outlined" component="label" startIcon={<DeployIcon />}>
              {deployFile ? deployFile.file.name : strings.deployZipPick}
              <input
                type="file"
                accept=".zip,application/zip"
                hidden
                onChange={(event) => {
                  handlePickZip(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </Button>
            {deployFile && (
              <Typography variant="body2" color="text.secondary">
                {translate("deployZipSummary", {
                  count: deployFile.files.length,
                  size: humanReadableSize(deployFile.totalSize),
                  name: deploySite?.slug ?? "",
                })}
              </Typography>
            )}
            <Stack direction="row" spacing={1} alignItems="center">
              <Switch
                size="small"
                checked={deployClear}
                onChange={(event) => setDeployClear(event.target.checked)}
                slotProps={{ input: { "aria-label": strings.deployZipClear } }}
              />
              <Typography variant="body2">{strings.deployZipClear}</Typography>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDeploySite(null);
              setDeployFile(null);
            }}
          >
            {strings.cancel}
          </Button>
          <Button
            variant="contained"
            disabled={!deployFile || deploying}
            onClick={handleDeploy}
          >
            {strings.deployZip}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={strings.deleteSiteConfirmTitle}
        message={
          pendingDelete
            ? pendingDelete.stats
              ? translate("deleteSiteConfirm", { name: pendingDelete.slug, count: pendingDelete.stats.objects })
              : translate("deleteSiteConfirmUnknownCount", { name: pendingDelete.slug })
            : ""
        }
        confirmText={strings.deleteSite}
        onClose={() => setPendingDelete(null)}
        onConfirm={handleDelete}
      />
    </>
  );
}

export default SitesView;
