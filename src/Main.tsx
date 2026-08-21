import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Box,
  Breadcrumbs,
  Button,
  CircularProgress,
  IconButton,
  Link,
  Menu,
  MenuItem,
  Typography,
} from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  Home as HomeIcon,
  NoteAdd as NoteAddIcon,
} from "@mui/icons-material";

import ConfirmDialog from "./ConfirmDialog";
import FileGrid from "./FileGrid";
import MoveDialog from "./MoveDialog";
import MultiSelectToolbar from "./MultiSelectToolbar";
import PreviewDialog from "./PreviewDialog";
import RenameDialog from "./RenameDialog";
import ShareDialog from "./ShareDialog";
import SharesView from "./SharesView";
import TextPadDrawer from "./TextPadDrawer";
import TrashView from "./TrashView";
import UploadDrawer, { UploadFab } from "./UploadDrawer";
import { useClipboard } from "./app/clipboard";
import { Route } from "./app/route";
import { SortPref, ViewMode } from "./app/prefs";
import { strings } from "./app/strings";
import {
  collectFilesFromDataTransfer,
  copyPaste,
  downloadArchive,
  downloadFile,
  fetchPath,
  openFile,
  searchFiles,
} from "./app/transfer";
import { moveToTrash } from "./app/trash";
import { useAuth } from "./app/auth";
import { useTransferQueue, useUploadEnqueue } from "./app/transferQueue";
import { FileItem } from "./app/types";
import { basename, isDirectory } from "./app/utils";

function PathBar({
  cwd,
  onNavigate,
}: {
  cwd: string;
  onNavigate: (path: string) => void;
}) {
  const parts = cwd.replace(/\/$/, "").split("/").filter(Boolean);

  return (
    <Box sx={{ padding: 1, display: "flex", alignItems: "center", gap: 0.5 }}>
      <IconButton
        size="small"
        aria-label="返回上一级"
        disabled={parts.length === 0}
        onClick={() =>
          onNavigate(parts.slice(0, -1).join("/") + (parts.length > 1 ? "/" : ""))
        }
      >
        <ArrowBackIcon fontSize="small" />
      </IconButton>
      <Breadcrumbs separator="›" sx={{ flexGrow: 1 }}>
        <Button size="small" onClick={() => onNavigate("")} sx={{ minWidth: 0 }}>
          <HomeIcon fontSize="small" />
        </Button>
        {parts.map((part, index) =>
          index === parts.length - 1 ? (
            <Typography key={index} color="text.primary">
              {part}
            </Typography>
          ) : (
            <Link
              key={index}
              component="button"
              onClick={() =>
                onNavigate(parts.slice(0, index + 1).join("/") + "/")
              }
            >
              {part}
            </Link>
          )
        )}
      </Breadcrumbs>
    </Box>
  );
}

function uniqueName(name: string, taken: Set<string>) {
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let index = 2;
  while (taken.has(`${stem} (${index})${ext}`)) index++;
  return `${stem} (${index})${ext}`;
}

async function transferKeys(
  keys: string[],
  destination: string,
  mode: "copy" | "cut"
) {
  let existing: FileItem[] = [];
  try {
    existing = await fetchPath(destination);
  } catch {
    existing = [];
  }
  const taken = new Set(existing.map((file) => file.name));

  for (const key of keys) {
    const name = basename(key);
    if (mode === "cut") {
      const parent = key.slice(0, key.length - name.length);
      if (parent === destination) continue;
    }
    const targetName = uniqueName(name, taken);
    await copyPaste(key, `${destination}${targetName}`, mode === "cut");
    taken.add(targetName);
  }
}

function Main({
  search,
  onSearchChange,
  onError,
  view,
  sort,
  route,
  navigate,
}: {
  search: string;
  onSearchChange: (search: string) => void;
  onError: (error: Error) => void;
  view: ViewMode;
  sort: SortPref;
  route: Route;
  navigate: (route: Route) => void;
}) {
  const {
    clipboard,
    copy: copyToClipboard,
    cut: cutToClipboard,
    clear: clearClipboard,
  } = useClipboard();
  const transferQueue = useTransferQueue();
  const uploadEnqueue = useUploadEnqueue();
  const { username } = useAuth();

  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [multiSelected, setMultiSelected] = useState<string[] | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchCursor, setSearchCursor] = useState<string | undefined>();
  const [showUploadDrawer, setShowUploadDrawer] = useState(false);
  const [showTextPadDrawer, setShowTextPadDrawer] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    file: FileItem;
  } | null>(null);
  const [renameTarget, setRenameTarget] = useState<FileItem | null>(null);
  const [shareTarget, setShareTarget] = useState<FileItem | null>(null);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);
  const [moveTarget, setMoveTarget] = useState<string[] | null>(null);

  const cwd = route.kind === "folder" ? route.path : "";

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadListing = useCallback(async () => {
    if (route.kind !== "folder") {
      setFiles([]);
      setLoading(false);
      return;
    }
    if (username === null) {
      setFiles([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      if (debouncedSearch) {
        const result = await searchFiles(debouncedSearch);
        setFiles(result.items);
        setSearchHasMore(result.hasMore);
        setSearchCursor(result.nextCursor);
      } else {
        setFiles(await fetchPath(cwd));
        setSearchHasMore(false);
        setSearchCursor(undefined);
      }
      setMultiSelected(null);
    } catch (error) {
      onError(error as Error);
    } finally {
      setLoading(false);
    }
  }, [cwd, debouncedSearch, onError, route.kind, username]);

  useEffect(() => {
    loadListing();
  }, [loadListing]);

  const activeUploads = transferQueue.filter(
    (task) =>
      task.type === "upload" &&
      ["pending", "in-progress", "paused"].includes(task.status)
  ).length;
  const previousActive = useRef(0);

  useEffect(() => {
    if (previousActive.current > 0 && activeUploads === 0) {
      loadListing();
    }
    previousActive.current = activeUploads;
  }, [activeUploads, loadListing]);

  const loadMore = async () => {
    if (!debouncedSearch || !searchCursor) return;
    try {
      const result = await searchFiles(debouncedSearch, searchCursor);
      setFiles((prev) => [...prev, ...result.items]);
      setSearchHasMore(result.hasMore);
      setSearchCursor(result.nextCursor);
    } catch (error) {
      onError(error as Error);
    }
  };

  const sortedFiles = useMemo(() => {
    const items = [...files];
    items.sort((a, b) => {
      const aDir = isDirectory(a) ? 0 : 1;
      const bDir = isDirectory(b) ? 0 : 1;
      if (aDir !== bDir) return aDir - bDir;

      let compare = 0;
      if (sort.field === "size") {
        compare = a.size - b.size;
      } else if (sort.field === "date") {
        compare = new Date(a.uploaded).getTime() - new Date(b.uploaded).getTime();
      } else {
        compare = a.name.localeCompare(b.name, undefined, { numeric: true });
      }
      return sort.order === "asc" ? compare : -compare;
    });
    return items;
  }, [files, sort]);

  const navigateFolder = useCallback(
    (path: string) => {
      setDebouncedSearch("");
      const normalized =
        path && !path.endsWith("/") ? `${path}/` : path;
      navigate({ kind: "folder", path: normalized });
      if (search) onSearchChange("");
    },
    [navigate, onSearchChange, search]
  );

  const toggleSelect = useCallback((key: string) => {
    setMultiSelected((prev) => {
      if (prev === null) return [key];
      if (prev.includes(key)) {
        const next = prev.filter((item) => item !== key);
        return next.length ? next : null;
      }
      return [...prev, key];
    });
  }, []);

  const selectAll = useCallback(() => {
    setMultiSelected((prev) => {
      const all = sortedFiles.map((file) => file.key);
      if (prev && prev.length === all.length) return null;
      return all;
    });
  }, [sortedFiles]);

  const isPreviewable = (file: FileItem) =>
    !file.isDir &&
    (file.contentType.startsWith("image/") ||
      file.contentType.startsWith("video/") ||
      file.contentType.startsWith("audio/") ||
      file.contentType === "application/pdf");

  const handleOpen = useCallback(
    (key: string) => {
      const file = files.find((item) => item.key === key);
      if (!file) return;
      if (isPreviewable(file)) {
        setPreviewFile(file);
      } else {
        openFile(key).catch(onError);
      }
    },
    [files, onError]
  );

  const handleContextAction = useCallback(
    async (
      action:
        | "open"
        | "download"
        | "rename"
        | "delete"
        | "share"
        | "copy"
        | "cut"
        | "select",
      file: FileItem
    ) => {
      setContextMenu(null);
      try {
        if (action === "open") {
          if (file.isDir) navigateFolder(file.key);
          else handleOpen(file.key);
        } else if (action === "download") {
          if (file.isDir) await downloadArchive([file.key]);
          else await downloadFile(file.key);
        } else if (action === "rename") {
          setRenameTarget(file);
        } else if (action === "delete") {
          setConfirmDelete([file.key]);
        } else if (action === "share") {
          setShareTarget(file);
        } else if (action === "copy") {
          copyToClipboard([file.key]);
        } else if (action === "cut") {
          cutToClipboard([file.key]);
        } else if (action === "select") {
          setMultiSelected([file.key]);
        }
      } catch (error) {
        onError(error as Error);
      }
    },
    [copyToClipboard, cutToClipboard, handleOpen, navigateFolder, onError]
  );

  const handleRenameSubmit = async (name: string) => {
    if (!renameTarget) return;
    const parent = renameTarget.key.slice(
      0,
      renameTarget.key.length - renameTarget.name.length
    );
    const target = `${parent}${name}`;
    try {
      await copyPaste(renameTarget.key, target, true);
      onError(new Error("重命名成功"));
    } catch (error) {
      onError(error as Error);
    } finally {
      setRenameTarget(null);
      await loadListing();
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    try {
      await moveToTrash(confirmDelete);
      onError(new Error("已移入回收站"));
    } catch (error) {
      onError(error as Error);
    } finally {
      setConfirmDelete(null);
      setMultiSelected(null);
      await loadListing();
    }
  };

  const handlePaste = async () => {
    if (!clipboard || route.kind !== "folder") return;
    try {
      await transferKeys(clipboard.keys, cwd, clipboard.mode);
      if (clipboard.mode === "cut") clearClipboard();
      onError(new Error("粘贴完成"));
    } catch (error) {
      onError(error as Error);
    } finally {
      await loadListing();
    }
  };

  const handleMove = async (destination: string) => {
    if (!moveTarget?.length) return;
    try {
      await transferKeys(moveTarget, destination, "cut");
      setMultiSelected(null);
      onError(new Error("移动完成"));
    } catch (error) {
      onError(error as Error);
    } finally {
      setMoveTarget(null);
      await loadListing();
    }
  };

  const handleDropOnFolder = async (
    folder: FileItem,
    dataTransfer: DataTransfer
  ) => {
    const internalKey = dataTransfer.getData("application/x-flaredrive");
    if (internalKey) {
      try {
        await transferKeys([internalKey], `${folder.key}/`, "cut");
        await loadListing();
      } catch (error) {
        onError(error as Error);
      }
      return;
    }

    const droppedFiles = await collectFilesFromDataTransfer(dataTransfer);
    if (droppedFiles.length) {
      uploadEnqueue(
        ...droppedFiles.map((file) => ({
          file,
          basedir: `${folder.key}/`,
        }))
      );
    }
  };

  if (route.kind === "trash") {
    return (
      <Box sx={{ flexGrow: 1, overflowY: "auto" }}>
        <TrashView onError={onError} />
      </Box>
    );
  }
  if (route.kind === "shares") {
    return (
      <Box sx={{ flexGrow: 1, overflowY: "auto" }}>
        <SharesView onError={onError} />
      </Box>
    );
  }

  const cutKeys =
    clipboard?.mode === "cut" ? new Set(clipboard.keys) : undefined;

  return (
    <>
      {!debouncedSearch && cwd && (
        <PathBar cwd={cwd} onNavigate={navigateFolder} />
      )}
      {debouncedSearch && (
        <Typography variant="body2" sx={{ padding: 1 }} color="text.secondary">
          搜索：{debouncedSearch}
        </Typography>
      )}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", padding: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Box
          sx={{
            flexGrow: 1,
            overflowY: "auto",
            backgroundColor: (theme) => theme.palette.background.default,
          }}
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDrop={async (event) => {
            event.preventDefault();
            const droppedFiles = await collectFilesFromDataTransfer(
              event.dataTransfer
            );
            if (droppedFiles.length) {
              uploadEnqueue(
                ...droppedFiles.map((file) => ({ file, basedir: cwd }))
              );
            }
          }}
        >
          <FileGrid
            files={sortedFiles}
            view={view}
            multiSelected={multiSelected}
            dimmedKeys={cutKeys}
            onToggleSelect={toggleSelect}
            onNavigate={navigateFolder}
            onOpen={handleOpen}
            onOpenMenu={(position, file) =>
              setContextMenu({ x: position.clientX, y: position.clientY, file })
            }
            onDropOnFolder={handleDropOnFolder}
            emptyMessage={
              <Box sx={{ textAlign: "center", padding: 4 }}>
                {debouncedSearch
                  ? strings.noSearchResult
                  : strings.noFiles}
              </Box>
            }
          />
          {searchHasMore && (
            <Button
              fullWidth
              onClick={loadMore}
              sx={{ marginBottom: "48px" }}
            >
              加载更多
            </Button>
          )}
        </Box>
      )}

      {multiSelected === null && (
        <>
          <UploadFab onClick={() => setShowUploadDrawer(true)} />
          <Button
            variant="contained"
            startIcon={<NoteAddIcon />}
            sx={{
              position: "fixed",
              bottom: 88,
              right: 24,
              zIndex: 999,
            }}
            onClick={() => setShowTextPadDrawer(true)}
          >
            {strings.openTextPad}
          </Button>
        </>
      )}

      <UploadDrawer
        open={showUploadDrawer}
        setOpen={setShowUploadDrawer}
        cwd={cwd}
        onUpload={loadListing}
        onError={onError}
      />

      <TextPadDrawer
        open={showTextPadDrawer}
        setOpen={setShowTextPadDrawer}
        cwd={cwd}
        onUpload={loadListing}
      />

      <Menu
        open={Boolean(contextMenu)}
        onClose={() => setContextMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu ? { top: contextMenu.y, left: contextMenu.x } : undefined
        }
      >
        {contextMenu && !contextMenu.file.isDir && (
          <MenuItem
            onClick={() => handleContextAction("open", contextMenu.file)}
          >
            打开 / 预览
          </MenuItem>
        )}
        {contextMenu && (
          <MenuItem
            onClick={() => handleContextAction("download", contextMenu.file)}
          >
            下载
          </MenuItem>
        )}
        {contextMenu && (
          <MenuItem
            onClick={() => handleContextAction("rename", contextMenu.file)}
          >
            重命名
          </MenuItem>
        )}
        {contextMenu && !contextMenu.file.isDir && (
          <MenuItem
            onClick={() => handleContextAction("share", contextMenu.file)}
          >
            分享
          </MenuItem>
        )}
        {contextMenu && (
          <MenuItem
            onClick={() => handleContextAction("copy", contextMenu.file)}
          >
            复制
          </MenuItem>
        )}
        {contextMenu && (
          <MenuItem
            onClick={() => handleContextAction("cut", contextMenu.file)}
          >
            剪切
          </MenuItem>
        )}
        {contextMenu && (
          <MenuItem
            onClick={() => handleContextAction("delete", contextMenu.file)}
          >
            删除
          </MenuItem>
        )}
        {contextMenu && (
          <MenuItem
            onClick={() => handleContextAction("select", contextMenu.file)}
          >
            多选
          </MenuItem>
        )}
      </Menu>

      <RenameDialog
        open={Boolean(renameTarget)}
        currentName={renameTarget?.name ?? ""}
        onClose={() => setRenameTarget(null)}
        onSubmit={handleRenameSubmit}
      />

      <ShareDialog
        open={Boolean(shareTarget)}
        file={shareTarget}
        onClose={() => setShareTarget(null)}
        onError={onError}
      />

      <PreviewDialog
        file={previewFile}
        onClose={() => setPreviewFile(null)}
        onError={onError}
      />

      <MoveDialog
        open={Boolean(moveTarget)}
        sourceKeys={moveTarget ?? []}
        onClose={() => setMoveTarget(null)}
        onMove={handleMove}
        onError={onError}
      />

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="移入回收站"
        message={`将删除 ${confirmDelete?.length ?? 0} 项，删除后可到回收站恢复。`}
        confirmText="移入回收站"
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleConfirmDelete}
      />

      <MultiSelectToolbar
        multiSelected={multiSelected}
        onClose={() => setMultiSelected(null)}
        onSelectAll={selectAll}
        onDownload={async () => {
          if (!multiSelected?.length) return;
          try {
            if (
              multiSelected.length === 1 &&
              files.find((file) => file.key === multiSelected[0])?.isDir === false
            ) {
              await downloadFile(multiSelected[0]);
            } else {
              await downloadArchive(multiSelected);
            }
          } catch (error) {
            onError(error as Error);
          }
        }}
        onRename={() => {
          if (multiSelected?.length !== 1) return;
          const file = files.find((item) => item.key === multiSelected[0]);
          if (file) setRenameTarget(file);
        }}
        onDelete={() => setConfirmDelete(multiSelected)}
        onShare={() => {
          if (multiSelected?.length !== 1) return;
          const file = files.find((item) => item.key === multiSelected[0]);
          if (file && !file.isDir) setShareTarget(file);
        }}
        onCopy={() => copyToClipboard(multiSelected ?? [])}
        onCut={() => cutToClipboard(multiSelected ?? [])}
        onPaste={handlePaste}
        onMove={() => setMoveTarget(multiSelected)}
        canPaste={Boolean(
          clipboard && clipboard.keys.length > 0 && route.kind === "folder"
        )}
      />
    </>
  );
}

export default Main;
