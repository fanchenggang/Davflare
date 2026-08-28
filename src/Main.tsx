import { isPreviewable } from "./app/preview";
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
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { ArrowBack as ArrowBackIcon } from "@mui/icons-material";

import ConfirmDialog from "./ConfirmDialog";
import CreateFolderDialog from "./CreateFolderDialog";
import ExplorerBar, { ExplorerSection } from "./ExplorerBar";
import FileActionSheet, { FileAction } from "./FileActionSheet";
import FileGrid from "./FileGrid";
import MoveDialog from "./MoveDialog";
import MultiSelectToolbar from "./MultiSelectToolbar";
import PreviewDialog from "./PreviewDialog";
import RenameDialog from "./RenameDialog";
import ShareDialog from "./ShareDialog";
import SharesView from "./SharesView";
import TextPadDrawer from "./TextPadDrawer";
import TrashView from "./TrashView";
import WebDavPanel from "./WebDavPanel";
import { useClipboard } from "./app/clipboard";
import { NotifyFn } from "./app/notify";
import { Route } from "./app/route";
import { FileTypeFilter, SortPref, usePersistedState, ViewMode } from "./app/prefs";
import { strings } from "./app/strings";
import {
  collectFilesFromDataTransfer,
  copyPaste,
  createFolder,
  downloadArchive,
  downloadFile,
  fetchPath,
  openFile,
  searchFiles,
  selectDirectoryFiles,
} from "./app/transfer";
import { moveToTrash } from "./app/trash";
import { useAuth } from "./app/auth";
import { useTransferQueue, useUploadEnqueue } from "./app/transferQueue";
import { FileItem } from "./app/types";
import {
  basename,
  fileTypeCategory,
  formatListingSize,
  isDirectory,
  isJunkFileName,
} from "./app/utils";

export type SearchScope = "folder" | "global";

function PathBar({
  cwd,
  onNavigate,
  stats,
  searchScope,
  onSearchScopeChange,
  searchQuery,
}: {
  cwd: string;
  onNavigate: (path: string) => void;
  stats: string;
  searchScope: SearchScope;
  onSearchScopeChange: (scope: SearchScope) => void;
  searchQuery: string;
}) {
  const parts = cwd.replace(/\/$/, "").split("/").filter(Boolean);
  const atRoot = parts.length === 0;

  return (
    <Box
      sx={{
        padding: "8px 12px 10px",
        borderBottom: "1px solid",
        borderColor: "divider",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <IconButton
          size="small"
          aria-label="返回上一级"
          disabled={atRoot}
          onClick={() =>
            onNavigate(parts.slice(0, -1).join("/") + (parts.length > 1 ? "/" : ""))
          }
          sx={{
            visibility: atRoot ? "hidden" : "visible",
            opacity: atRoot ? 0 : 1,
            pointerEvents: atRoot ? "none" : "auto",
          }}
        >
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        <Breadcrumbs separator="›" sx={{ flexGrow: 1 }}>
          {parts.length === 0 ? (
            <Typography color="text.primary">{strings.allFiles}</Typography>
          ) : (
            <Link component="button" onClick={() => onNavigate("")}>
              {strings.allFiles}
            </Link>
          )}
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
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          flexWrap: "wrap",
          paddingLeft: "40px",
          minHeight: 32,
        }}
      >
        <Typography variant="caption" color="text.secondary">
          {stats}
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <ToggleButtonGroup
          exclusive
          size="small"
          value={searchScope}
          onChange={(_, value: SearchScope | null) => {
            if (value) onSearchScopeChange(value);
          }}
          aria-label="搜索范围"
        >
          <ToggleButton value="folder">{strings.searchHere}</ToggleButton>
          <ToggleButton value="global">{strings.searchAll}</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      {searchQuery ? (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ paddingLeft: "40px", paddingTop: 0.5 }}
        >
          {searchScope === "global" ? strings.searchAll : strings.searchHere}：
          {searchQuery}
        </Typography>
      ) : null}
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
  onNotify,
  view,
  onViewChange,
  sort,
  onSortChange,
  route,
  navigate,
}: {
  search: string;
  onSearchChange: (search: string) => void;
  onNotify: NotifyFn;
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  sort: SortPref;
  onSortChange: (sort: SortPref) => void;
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
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchCursor, setSearchCursor] = useState<string | undefined>();
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showTextPadDrawer, setShowTextPadDrawer] = useState(false);
  const [showWebDav, setShowWebDav] = useState(false);
  const [typeFilter, setTypeFilter] = useState<FileTypeFilter>("all");
  const [showHidden, setShowHidden] = usePersistedState(
    "flaredrive.showHidden",
    false
  );
  const [searchScope, setSearchScope] = useState<SearchScope>("folder");
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
  const lastFolderPath = useRef("");
  const loadedListingKey = useRef<string | null>(null);

  const cwd = route.kind === "folder" ? route.path : lastFolderPath.current;
  const section: ExplorerSection =
    route.kind === "shares" || route.kind === "trash" ? route.kind : "folder";

  useEffect(() => {
    if (route.kind === "folder") lastFolderPath.current = route.path;
  }, [route]);

  useEffect(() => {
    setSearchScope(cwd ? "folder" : "global");
  }, [cwd]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (search.trim() && route.kind !== "folder") {
      navigate({ kind: "folder", path: lastFolderPath.current });
    }
  }, [navigate, route.kind, search]);

  const isGlobalSearch = Boolean(debouncedSearch) && searchScope === "global";
  const listingKey =
    route.kind === "folder"
      ? isGlobalSearch
        ? `folder:${cwd}||search:${debouncedSearch}`
        : `folder:${cwd}`
      : route.kind;

  const loadListing = useCallback(async () => {
    if (route.kind !== "folder") {
      setFiles([]);
      setLoading(false);
      loadedListingKey.current = listingKey;
      return;
    }
    if (username === null) {
      setFiles([]);
      setLoading(false);
      return;
    }

    // Keep the current grid mounted when refreshing the same folder so a
    // click that lands during create/rename/upload is not lost on remount.
    const silent = loadedListingKey.current === listingKey;
    if (!silent) setLoading(true);
    try {
      if (isGlobalSearch) {
        const result = await searchFiles(debouncedSearch);
        setFiles(result.items);
        setSearchHasMore(result.hasMore);
        setSearchCursor(result.nextCursor);
      } else {
        setFiles(await fetchPath(cwd));
        setSearchHasMore(false);
        setSearchCursor(undefined);
      }
      loadedListingKey.current = listingKey;
      setSelectedKeys([]);
    } catch (error) {
      onNotify((error as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }, [
    cwd,
    debouncedSearch,
    listingKey,
    onNotify,
    route.kind,
    isGlobalSearch,
    username,
  ]);

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
    if (!isGlobalSearch || !searchCursor) return;
    try {
      const result = await searchFiles(debouncedSearch, searchCursor);
      setFiles((prev) => [...prev, ...result.items]);
      setSearchHasMore(result.hasMore);
      setSearchCursor(result.nextCursor);
    } catch (error) {
      onNotify((error as Error).message, "error");
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

  const visibleFiles = useMemo(() => {
    let items = sortedFiles;
    if (!showHidden) {
      items = items.filter((file) => !isJunkFileName(file.name));
    }
    if (typeFilter !== "all") {
      items = items.filter((file) => {
        if (file.isDir) return true;
        return fileTypeCategory(file) === typeFilter;
      });
    }
    if (debouncedSearch && searchScope === "folder") {
      const q = debouncedSearch.toLowerCase();
      items = items.filter(
        (file) =>
          file.name.toLowerCase().includes(q) ||
          file.key.toLowerCase().includes(q)
      );
    }
    return items;
  }, [debouncedSearch, searchScope, showHidden, sortedFiles, typeFilter]);

  const listingStats = useMemo(() => {
    let folders = 0;
    let fileCount = 0;
    let bytes = 0;
    for (const file of visibleFiles) {
      if (file.isDir) {
        folders += 1;
      } else {
        fileCount += 1;
        bytes += file.size || 0;
      }
    }
    return `${folders} 个文件夹 · ${fileCount} 个文件 · 共 ${formatListingSize(
      bytes
    )}`;
  }, [visibleFiles]);

  const navigateFolder = useCallback(
    (path: string) => {
      setDebouncedSearch("");
      const normalized = path && !path.endsWith("/") ? `${path}/` : path;
      navigate({ kind: "folder", path: normalized });
      if (search) onSearchChange("");
    },
    [navigate, onSearchChange, search]
  );

  const toggleSelect = useCallback((key: string) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    );
  }, []);

  const selectAll = useCallback(() => {
    setSelectedKeys((prev) => {
      const all = visibleFiles.map((file) => file.key);
      if (prev.length === all.length) return [];
      return all;
    });
  }, [visibleFiles]);


  const handleOpenMenu = useCallback(
    (position: { clientX: number; clientY: number }, file: FileItem) => {
      setContextMenu({
        x: position.clientX,
        y: position.clientY,
        file,
      });
    },
    []
  );

  const handleOpen = useCallback(
    (key: string) => {
      const file = files.find((item) => item.key === key);
      if (!file) return;
      if (isPreviewable(file)) {
        setPreviewFile(file);
      } else {
        openFile(key).catch((error) => onNotify((error as Error).message, "error"));
      }
    },
    [files, onNotify]
  );

  const handleContextAction = useCallback(
    async (action: FileAction, file: FileItem) => {
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
        } else if (action === "move") {
          setMoveTarget([file.key]);
        } else if (action === "delete") {
          setConfirmDelete([file.key]);
        } else if (action === "share") {
          setShareTarget(file);
        } else if (action === "copy") {
          copyToClipboard([file.key]);
          onNotify("已复制到剪贴板", "success");
        } else if (action === "cut") {
          cutToClipboard([file.key]);
          onNotify("已剪切到剪贴板", "success");
        }
      } catch (error) {
        onNotify((error as Error).message, "error");
      }
    },
    [copyToClipboard, cutToClipboard, handleOpen, navigateFolder, onNotify]
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
      onNotify("重命名成功", "success");
    } catch (error) {
      onNotify((error as Error).message, "error");
    } finally {
      setRenameTarget(null);
      await loadListing();
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    try {
      await moveToTrash(confirmDelete);
      onNotify("已移入回收站", "success");
    } catch (error) {
      onNotify((error as Error).message, "error");
    } finally {
      setConfirmDelete(null);
      setSelectedKeys([]);
      setPreviewFile(null);
      await loadListing();
    }
  };

  const handlePaste = async () => {
    if (!clipboard || route.kind !== "folder") return;
    try {
      await transferKeys(clipboard.keys, cwd, clipboard.mode);
      if (clipboard.mode === "cut") clearClipboard();
      onNotify("粘贴完成", "success");
    } catch (error) {
      onNotify((error as Error).message, "error");
    } finally {
      await loadListing();
    }
  };

  const handleMove = async (destination: string) => {
    if (!moveTarget?.length) return;
    try {
      await transferKeys(moveTarget, destination, "cut");
      setSelectedKeys([]);
      onNotify("移动完成", "success");
    } catch (error) {
      onNotify((error as Error).message, "error");
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
        onNotify((error as Error).message, "error");
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

  const openFilePicker = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "*/*";
    input.multiple = true;
    input.onchange = async () => {
      if (!input.files) return;
      uploadEnqueue(
        ...Array.from(input.files).map((file) => ({ file, basedir: cwd }))
      );
    };
    input.click();
  };

  const openFolderPicker = async () => {
    const files = await selectDirectoryFiles();
    if (files.length) {
      uploadEnqueue(...files.map((file) => ({ file, basedir: cwd })));
    }
  };

  const handleSectionChange = (next: ExplorerSection) => {
    onSearchChange("");
    if (next === "folder") {
      navigate({ kind: "folder", path: lastFolderPath.current });
    } else {
      navigate({ kind: next });
    }
  };

  const cutKeys =
    clipboard?.mode === "cut" ? new Set(clipboard.keys) : undefined;
  const canPaste = Boolean(
    clipboard && clipboard.keys.length > 0 && route.kind === "folder"
  );

  return (
    <>
      <ExplorerBar
        section={section}
        onSectionChange={handleSectionChange}
        onUploadFile={openFilePicker}
        onUploadFolder={openFolderPicker}
        onCreateFolder={() => setShowCreateFolder(true)}
        onOpenTextPad={() => setShowTextPadDrawer(true)}
        onPaste={handlePaste}
        canPaste={canPaste}
        clipboardCount={clipboard?.keys.length ?? 0}
        clipboardMode={clipboard?.mode ?? null}
        view={view}
        onViewChange={onViewChange}
        sort={sort}
        onSortChange={onSortChange}
        onOpenWebDav={() => setShowWebDav(true)}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        showHidden={showHidden}
        onShowHiddenChange={setShowHidden}
      />

      {route.kind === "trash" && (
        <Box sx={{ flexGrow: 1, overflowY: "auto" }}>
          <TrashView onNotify={onNotify} />
        </Box>
      )}
      {route.kind === "shares" && (
        <Box sx={{ flexGrow: 1, overflowY: "auto" }}>
          <SharesView onNotify={onNotify} />
        </Box>
      )}

      {route.kind === "folder" && (
        <>
          <PathBar
            cwd={cwd}
            onNavigate={navigateFolder}
            stats={listingStats}
            searchScope={searchScope}
            onSearchScopeChange={setSearchScope}
            searchQuery={debouncedSearch}
          />

          {loading ||
          (route.kind === "folder" && loadedListingKey.current !== listingKey) ? (
            <Box
              sx={{
                flexGrow: 1,
                minHeight: 200,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
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
                files={visibleFiles}
                view={view}
                selectedKeys={selectedKeys}
                dimmedKeys={cutKeys}
                onToggleSelect={toggleSelect}
                onNavigate={navigateFolder}
                onOpen={handleOpen}
                onOpenMenu={handleOpenMenu}
                onDropOnFolder={handleDropOnFolder}
                emptyMessage={
                  <Box sx={{ textAlign: "center", padding: 4 }}>
                    <Typography color="text.secondary" sx={{ marginBottom: 2 }}>
                      {debouncedSearch
                        ? strings.noSearchResult
                        : strings.noFiles}
                    </Typography>
                    {!debouncedSearch && (
                      <Box sx={{ display: "flex", justifyContent: "center", gap: 1 }}>
                        <Button variant="contained" onClick={openFilePicker}>
                          {strings.upload}
                        </Button>
                        <Button
                          variant="outlined"
                          onClick={() => setShowCreateFolder(true)}
                        >
                          {strings.createFolder}
                        </Button>
                      </Box>
                    )}
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
        </>
      )}

      <WebDavPanel
        open={showWebDav}
        onClose={() => setShowWebDav(false)}
        onNotify={onNotify}
      />

      <CreateFolderDialog
        open={showCreateFolder}
        onClose={() => setShowCreateFolder(false)}
        onSubmit={async (name) => {
          try {
            await createFolder(cwd, name);
            setShowCreateFolder(false);
            onNotify("文件夹已创建", "success");
            await loadListing();
          } catch (error) {
            onNotify((error as Error).message, "error");
          }
        }}
      />

      <TextPadDrawer
        open={showTextPadDrawer}
        setOpen={setShowTextPadDrawer}
        cwd={cwd}
        onUpload={loadListing}
      />

      <FileActionSheet
        file={contextMenu?.file ?? null}
        anchorPosition={
          contextMenu ? { top: contextMenu.y, left: contextMenu.x } : null
        }
        onClose={() => setContextMenu(null)}
        onAction={handleContextAction}
      />

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
        onNotify={onNotify}
      />

      <PreviewDialog
        file={previewFile}
        onClose={() => setPreviewFile(null)}
        onNotify={onNotify}
        onShare={() => {
          if (previewFile) setShareTarget(previewFile);
        }}
        onRename={() => {
          if (previewFile) {
            setRenameTarget(previewFile);
            setPreviewFile(null);
          }
        }}
        onDelete={() => {
          if (previewFile) {
            setConfirmDelete([previewFile.key]);
          }
        }}
      />

      <MoveDialog
        open={Boolean(moveTarget)}
        sourceKeys={moveTarget ?? []}
        onClose={() => setMoveTarget(null)}
        onMove={handleMove}
        onError={(error) => onNotify(error.message, "error")}
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
        selectedKeys={selectedKeys}
        onClose={() => setSelectedKeys([])}
        onSelectAll={selectAll}
        onDownload={async () => {
          if (!selectedKeys.length) return;
          try {
            if (
              selectedKeys.length === 1 &&
              files.find((file) => file.key === selectedKeys[0])?.isDir === false
            ) {
              await downloadFile(selectedKeys[0]);
            } else {
              await downloadArchive(selectedKeys);
            }
          } catch (error) {
            onNotify((error as Error).message, "error");
          }
        }}
        onRename={() => {
          if (selectedKeys.length !== 1) return;
          const file = files.find((item) => item.key === selectedKeys[0]);
          if (file) setRenameTarget(file);
        }}
        onDelete={() => setConfirmDelete(selectedKeys)}
        onShare={() => {
          if (selectedKeys.length !== 1) return;
          const file = files.find((item) => item.key === selectedKeys[0]);
          if (file && !file.isDir) setShareTarget(file);
        }}
        onCopy={() => {
          copyToClipboard(selectedKeys);
          onNotify("已复制到剪贴板", "success");
        }}
        onCut={() => {
          cutToClipboard(selectedKeys);
          onNotify("已剪切到剪贴板", "success");
        }}
        onMove={() => setMoveTarget(selectedKeys)}
      />
    </>
  );
}

export default Main;
