import { isPreviewable } from "./app/preview";
import React, {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import { FolderOpen as FolderOpenIcon, SearchOff as SearchOffIcon } from "@mui/icons-material";

import ConfirmDialog from "./ConfirmDialog";
import CreateFolderDialog from "./CreateFolderDialog";
import EmptyState from "./EmptyState";
import ExplorerBar, { ExplorerSection } from "./ExplorerBar";
import FileActionSheet, { FileAction } from "./FileActionSheet";
import FileGrid, { FileGridSkeleton } from "./FileGrid";
import MobileNav from "./MobileNav";
import MoveDialog from "./MoveDialog";
import MultiSelectToolbar from "./MultiSelectToolbar";
import PathBar, { SearchScope } from "./PathBar";
import RenameDialog from "./RenameDialog";
import ShareDialog from "./ShareDialog";
import SharesView from "./SharesView";
import SettingsView from "./SettingsView";
import TextPadDrawer from "./TextPadDrawer";
import TrashView from "./TrashView";
import WebDavPanel from "./WebDavPanel";
import { useClipboard } from "./app/clipboard";
import { NotifyFn } from "./app/notify";
import { Route } from "./app/route";
import { Density, FileTypeFilter, SortPref, usePersistedState, ViewMode } from "./app/prefs";
import { Z_INDEX, warmShadow } from "./app/theme";
import { pushRecent, RecentEntry, useRecent } from "./app/recent";
import { strings, translate, useLang } from "./app/strings";
import {
  collectFilesFromDataTransfer,
  copyPaste,
  createFolder,
  downloadArchive,
  downloadFile,
  fetchPath,
  openFile,
  selectDirectoryFiles,
} from "./app/transfer";
import { moveToTrash, restoreTrash } from "./app/trash";
import { transferKeys, useUploadInputs } from "./app/useUploadInputs";
import { useDragDropUpload } from "./app/useDragDropUpload";
import { useFolderCounts } from "./app/useFolderCounts";
import { useFolderListing } from "./app/useFolderListing";
import { useKeyboardShortcuts } from "./app/useKeyboardShortcuts";
import { useMultiSelect } from "./app/useMultiSelect";
import { usePasteUpload } from "./app/usePasteUpload";
import { useFeatures } from "./app/features";
import { FileItem } from "./app/types";
import { errorMessage, fileTypeCategory, formatListingSize, isDirectory, isJunkFileName } from "./app/utils";
import { parentKey } from "./app/interaction";

// 重组件按需加载：只有真正打开预览 / 进入对应 section 时才拉取对应 chunk
const PreviewDialog = lazy(() => import("./PreviewDialog"));
const SitesView = lazy(() => import("./SitesView"));
const ImagesView = lazy(() => import("./ImagesView"));

function SectionLoading() {
  return (
    <Box sx={{ display: "flex", justifyContent: "center", padding: 6 }}>
      <CircularProgress size={28} />
    </Box>
  );
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
  onOpenApi,
  onContentScroll,
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
  onOpenApi: () => void;
  onContentScroll?: (scrolled: boolean) => void;
}) {
  const {
    clipboard,
    copy: copyToClipboard,
    cut: cutToClipboard,
    clear: clearClipboard,
  } = useClipboard();
  const recents = useRecent();
  const { flags } = useFeatures();

  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchScope, setSearchScope] = useState<SearchScope>("folder");
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showTextPadDrawer, setShowTextPadDrawer] = useState(false);
  const [showWebDav, setShowWebDav] = useState(false);
  const [typeFilter, setTypeFilter] = useState<FileTypeFilter>("all");
  const [showHidden, setShowHidden] = usePersistedState(
    "flaredrive.showHidden",
    false
  );
  const [density, setDensity] = usePersistedState<Density>(
    "flaredrive.density",
    "standard"
  );
  const [pendingOpen, setPendingOpen] = useState<string | null>(null);
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

  // 跨 hook 的桥接：useFolderListing 在选择/计数 hook 之前声明，
  // 通过 ref 转发其回调到后声明的 setter。
  const folderCountsSetterRef = useRef<
    (update: (prev: Record<string, number>) => Record<string, number>) => void
  >(() => {});
  const clearSelectionRef = useRef<() => void>(() => {});
  const onListingLoaded = useCallback(
    (path: string, count: number) => {
      folderCountsSetterRef.current((prev) => ({ ...prev, [path]: count }));
    },
    []
  );
  const onListingChanged = useCallback(() => {
    clearSelectionRef.current();
  }, []);
  const clearSelection = useCallback(() => {
    clearSelectionRef.current();
  }, []);

  const cwd = route.kind === "folder" ? route.path : lastFolderPath.current;
  const section: ExplorerSection =
    route.kind === "shares" ||
    route.kind === "trash" ||
    route.kind === "sites" ||
    route.kind === "images" ||
    route.kind === "settings"
      ? route.kind
      : "folder";

  const {
    files,
    listingPending,
    isGlobalSearch,
    loadListing,
    searchHasMore,
    loadMoreSentinelRef,
  } = useFolderListing({
    route,
    cwd,
    debouncedSearch,
    searchScope,
    onNotify,
    onListingLoaded,
    onListingChanged,
  });

  const { transferQueue, takenForCwd, enqueueToDir } = useUploadInputs({
    cwd,
    files,
  });

  useEffect(() => {
    if (route.kind === "folder") lastFolderPath.current = route.path;
  }, [route]);

  useEffect(() => {
    if (route.kind === "sites" && !flags.sites) {
      navigate({ kind: "folder", path: lastFolderPath.current });
    }
    if (route.kind === "images" && !flags.imageHost) {
      navigate({ kind: "folder", path: lastFolderPath.current });
    }
  }, [flags.imageHost, flags.sites, navigate, route.kind]);

  const handleContentScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      onContentScroll?.(event.currentTarget.scrollTop > 8);
    },
    [onContentScroll]
  );

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

  const lang = useLang();
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
    return translate("listingStats", {
      folders,
      files: fileCount,
      size: formatListingSize(bytes),
    });
    // lang 入参让语言切换时重算翻译结果（useMemo 否则缓存旧语言文案）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleFiles, lang]);

  const {
    selectedKeys,
    setSelectedKeys,
    focusedKey,
    setFocusedKey,
    toggleSelect,
    selectAll,
    jumpFocused,
    moveFocused,
  } = useMultiSelect(visibleFiles);

  useEffect(() => {
    setFocusedKey(null);
  }, [cwd, section, setFocusedKey]);

  const { folderCounts, setFolderCounts } = useFolderCounts({
    active: route.kind === "folder" && !isGlobalSearch,
    visibleFiles,
  });
  folderCountsSetterRef.current = setFolderCounts;
  clearSelectionRef.current = () => setSelectedKeys([]);

  useEffect(() => {
    if (focusedKey && !visibleFiles.some((file) => file.key === focusedKey)) {
      setFocusedKey(null);
    }
  }, [focusedKey, setFocusedKey, visibleFiles]);

  const navigateFolder = useCallback(
    (path: string) => {
      setDebouncedSearch("");
      const normalized = path && !path.endsWith("/") ? `${path}/` : path;
      navigate({ kind: "folder", path: normalized });
      if (search) onSearchChange("");
    },
    [navigate, onSearchChange, search]
  );

  const openRecent = useCallback(
    (entry: RecentEntry) => {
      if (entry.isDir) {
        navigateFolder(entry.key);
        return;
      }
      navigateFolder(parentKey(entry.key));
      setPendingOpen(entry.key);
    },
    [navigateFolder]
  );

  const rememberFolder = useCallback((key: string) => {
    const file = files.find((item) => item.key === key);
    if (file?.isDir) {
      pushRecent({ key: file.key, name: file.name, isDir: true });
    }
    navigateFolder(key);
  }, [files, navigateFolder]);

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
      pushRecent({ key: file.key, name: file.name, isDir: false });
      if (isPreviewable(file)) {
        setPreviewFile(file);
      } else {
        openFile(key).catch((error) => onNotify(errorMessage(error), "error"));
      }
    },
    [files, onNotify]
  );

  const previewSiblings = useMemo(() => {
    if (!previewFile) return [];
    const parent = parentKey(previewFile.key);
    return visibleFiles.filter(
      (item) =>
        !item.isDir &&
        isPreviewable(item) &&
        parentKey(item.key) === parent
    );
  }, [previewFile, visibleFiles]);

  const enqueueToCwd = useCallback(
    (incoming: File[]) => enqueueToDir(incoming, cwd, takenForCwd),
    [cwd, enqueueToDir, takenForCwd]
  );

  useKeyboardShortcuts({
    route,
    visibleFiles,
    selectedKeys,
    focusedKey,
    setSelectedKeys: clearSelection,
    setFocusedKey,
    moveFocused,
    jumpFocused,
    toggleSelect,
    selectAll,
    navigateFolder,
    onOpen: handleOpen,
    onRename: setRenameTarget,
    onDelete: setConfirmDelete,
  });

  usePasteUpload({
    active: route.kind === "folder",
    enqueueToCwd,
    onNotify,
  });

  const dropActive = useDragDropUpload({
    active: route.kind === "folder",
    enqueueToCwd,
  });

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
          window.setTimeout(() => setRenameTarget(file), 50);
        } else if (action === "move") {
          window.setTimeout(() => setMoveTarget([file.key]), 50);
        } else if (action === "delete") {
          window.setTimeout(() => setConfirmDelete([file.key]), 50);
        } else if (action === "share") {
          window.setTimeout(() => setShareTarget(file), 50);
        } else if (action === "copy") {
          copyToClipboard([file.key]);
          onNotify(translate("copiedToClipboard"), "success");
        } else if (action === "cut") {
          cutToClipboard([file.key]);
          onNotify(translate("cutToClipboard"), "success");
        }
      } catch (error) {
        onNotify(errorMessage(error), "error");
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
    const source = renameTarget.key;
    const runRename = async () => {
      await copyPaste(source, target, true);
    };
    try {
      await runRename();
      onNotify(translate("renameDone"), "success");
    } catch (error) {
      onNotify(errorMessage(error), "error", {
        duration: 8000,
        action: { label: strings.retry, onClick: () => runRename().catch(() => {}) },
      });
    } finally {
      setRenameTarget(null);
      await loadListing();
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    const targets = confirmDelete;
    const runDelete = async () => {
      return moveToTrash(targets);
    };
    try {
      const result = await runDelete();
      const trashIds = result.results.map((item) => item.id);
      onNotify(translate("movedToTrashCount", { count: trashIds.length }), "success", {
        duration: 7000,
        action: trashIds.length
          ? {
              label: strings.undo,
              onClick: () => {
                restoreTrash(trashIds)
                  .then(() => {
                    onNotify(translate("undoDeleteDone"), "success");
                  })
                  .catch((error) =>
                    onNotify(errorMessage(error), "error")
                  )
                  .finally(() => loadListing());
              },
            }
          : undefined,
      });
    } catch (error) {
      onNotify(errorMessage(error), "error", {
        action: {
          label: strings.retry,
          onClick: () => runDelete().then(() => loadListing()).catch(() => {}),
        },
      });
    } finally {
      setConfirmDelete(null);
      setSelectedKeys([]);
      setFocusedKey(null);
      setPreviewFile(null);
      await loadListing();
    }
  };

  const handlePaste = async () => {
    if (!clipboard || route.kind !== "folder") return;
    const runPaste = async () => {
      await transferKeys(clipboard.keys, cwd, clipboard.mode);
      if (clipboard.mode === "cut") clearClipboard();
    };
    try {
      await runPaste();
      onNotify(translate("pasteDone"), "success");
    } catch (error) {
      onNotify(errorMessage(error), "error", {
        duration: 8000,
        action: { label: strings.retry, onClick: () => runPaste().catch(() => {}) },
      });
    } finally {
      await loadListing();
    }
  };

  const handleMove = async (destination: string) => {
    if (!moveTarget?.length) return;
    const keys = moveTarget;
    const runMove = async () => {
      await transferKeys(keys, destination, "cut");
    };
    try {
      await runMove();
      setSelectedKeys([]);
      onNotify(translate("moveDone"), "success");
    } catch (error) {
      onNotify(errorMessage(error), "error", {
        action: {
          label: strings.retry,
          onClick: () => runMove().then(() => loadListing()).catch(() => {}),
        },
      });
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
      // 新格式为选中组 JSON 数组；旧格式为纯 key（解析失败时回退单键）
      let keys: string[] = [internalKey];
      if (internalKey.trim().startsWith("[")) {
        try {
          const parsed = JSON.parse(internalKey) as unknown[];
          keys = parsed.map(String);
        } catch {
          keys = [internalKey];
        }
      }
      // 不能把目标文件夹自身或其子项拖进它自己
      keys = keys.filter(
        (key) => key !== folder.key && !key.startsWith(`${folder.key}/`)
      );
      if (!keys.length) return;
      const destination = `${folder.key}/`;
      const runMove = async () => {
        await transferKeys(keys, destination, "cut");
      };
      try {
        await runMove();
        setSelectedKeys([]);
        await loadListing();
      } catch (error) {
        onNotify(errorMessage(error), "error", {
          action: {
            label: strings.retry,
            onClick: () => runMove().then(() => loadListing()).catch(() => {}),
          },
        });
      }
      return;
    }

    const droppedFiles = await collectFilesFromDataTransfer(dataTransfer);
    if (!droppedFiles.length) return;
    const dest = `${folder.key.replace(/\/$/, "")}/`;
    let taken: Set<string> = new Set();
    try {
      taken = new Set((await fetchPath(dest)).map((item) => item.name));
    } catch {
      taken = new Set();
    }
    enqueueToDir(droppedFiles, dest, taken);
  };

  const openFilePicker = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "*/*";
    input.multiple = true;
    input.value = "";
    input.style.display = "none";
    document.body.appendChild(input);
    input.onchange = () => {
      const picked = input.files ? Array.from(input.files) : [];
      input.value = "";
      input.remove();
      if (picked.length) enqueueToCwd(picked);
    };
    input.click();
  }, [enqueueToCwd]);

  const openFolderPicker = useCallback(async () => {
    const picked = await selectDirectoryFiles();
    if (picked.length) enqueueToCwd(picked);
  }, [enqueueToCwd]);

  const handleDownload = useCallback(
    (file: FileItem) => {
      (file.isDir
        ? downloadArchive([file.key])
        : downloadFile(file.key)
      ).catch((error) => onNotify(errorMessage(error), "error"));
    },
    [onNotify]
  );

  const emptyMessage = useMemo(
    () =>
      debouncedSearch ? (
        <EmptyState
          variant="search"
          icon={<SearchOffIcon />}
          title={strings.noSearchResult}
          description={strings.noSearchResultHint}
          actions={
            <Button variant="outlined" onClick={() => onSearchChange("")}>
              {strings.clearSearch}
            </Button>
          }
        />
      ) : (
        <EmptyState
          variant="folder"
          icon={<FolderOpenIcon />}
          title={strings.noFiles}
          description={strings.noFilesHint}
          actions={
            <>
              <Button variant="contained" onClick={openFilePicker}>
                {strings.upload}
              </Button>
              <Button variant="outlined" onClick={() => setShowCreateFolder(true)}>
                {strings.createFolder}
              </Button>
            </>
          }
        />
      ),
    [debouncedSearch, onSearchChange, openFilePicker]
  );

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

  useEffect(() => {
    if (!pendingOpen || listingPending) return;
    const found = files.find((item) => item.key === pendingOpen);
    if (found) {
      if (isPreviewable(found)) setPreviewFile(found);
      else {
        openFile(found.key).catch((error) =>
          onNotify(errorMessage(error), "error")
        );
      }
    } else {
      onNotify(translate("recentMissing"), "error");
    }
    setPendingOpen(null);
  }, [files, listingPending, onNotify, pendingOpen]);

  return (
    <Box
      sx={{
        flexGrow: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          flexShrink: 0,
          backgroundColor: "background.paper",
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
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
          onOpenApi={onOpenApi}
          typeFilter={typeFilter}
          onTypeFilterChange={setTypeFilter}
          showHidden={showHidden}
          onShowHiddenChange={setShowHidden}
          density={density}
          onDensityChange={setDensity}
          recents={recents}
          onOpenRecent={openRecent}
        />
        {route.kind === "folder" && (
          <PathBar
            cwd={cwd}
            onNavigate={navigateFolder}
            stats={listingStats}
            searchScope={searchScope}
            onSearchScopeChange={setSearchScope}
            searchQuery={debouncedSearch}
            onNotify={onNotify}
          />
        )}
      </Box>

      {route.kind === "trash" && (
        <Box onScroll={handleContentScroll} sx={{ flexGrow: 1, minHeight: 0, overflowY: "auto", pb: { xs: 8, sm: 0 } }}>
          <TrashView
            onNotify={onNotify}
            onGoFiles={() =>
              navigate({ kind: "folder", path: lastFolderPath.current })
            }
          />
        </Box>
      )}
      {route.kind === "shares" && (
        <Box onScroll={handleContentScroll} sx={{ flexGrow: 1, minHeight: 0, overflowY: "auto", pb: { xs: 8, sm: 0 } }}>
          <SharesView
            onNotify={onNotify}
            onGoFiles={() =>
              navigate({ kind: "folder", path: lastFolderPath.current })
            }
          />
        </Box>
      )}
      {route.kind === "sites" && flags.sites && (
        <Box onScroll={handleContentScroll} sx={{ flexGrow: 1, minHeight: 0, overflowY: "auto", pb: { xs: 8, sm: 0 } }}>
          <Suspense fallback={<SectionLoading />}>
            <SitesView
              onNotify={onNotify}
              onGoFiles={() =>
                navigate({ kind: "folder", path: lastFolderPath.current })
              }
              onManageFiles={(slug) =>
                navigate({ kind: "folder", path: `sites/${slug}/` })
              }
            />
          </Suspense>
        </Box>
      )}
      {route.kind === "images" && flags.imageHost && (
        <Box onScroll={handleContentScroll} sx={{ flexGrow: 1, minHeight: 0, overflowY: "auto", pb: { xs: 8, sm: 0 } }}>
          <Suspense fallback={<SectionLoading />}>
            <ImagesView
              onNotify={onNotify}
              onGoFiles={() =>
                navigate({ kind: "folder", path: lastFolderPath.current })
              }
            />
          </Suspense>
        </Box>
      )}
      {route.kind === "settings" && (
        <Box onScroll={handleContentScroll} sx={{ flexGrow: 1, minHeight: 0, overflowY: "auto", pb: { xs: 8, sm: 0 } }}>
          <SettingsView onNotify={onNotify} />
        </Box>
      )}

      {route.kind === "folder" && (
        <>
          {listingPending ? (
            <Box sx={{ flexGrow: 1, overflowY: "auto", minHeight: 220 }}>
              <FileGridSkeleton view={view} density={density} />
            </Box>
          ) : (
            <Box
              onScroll={handleContentScroll}
              sx={{
                flexGrow: 1,
                minHeight: 0,
                overflowY: "auto",
                backgroundColor: "background.default",
                pb: { xs: 8, sm: 0 },
              }}
            >
              <FileGrid
                files={visibleFiles}
                view={view}
                density={density}
                folderCounts={folderCounts}
                selectedKeys={selectedKeys}
                dimmedKeys={cutKeys}
                focusedKey={focusedKey}
                highlight={debouncedSearch}
                onToggleSelect={toggleSelect}
                onNavigate={rememberFolder}
                onOpen={handleOpen}
                onOpenMenu={handleOpenMenu}
                onDropOnFolder={handleDropOnFolder}
                onDownload={handleDownload}
                onShareFile={(file) => setShareTarget(file)}
                onDeleteFile={(file) => setConfirmDelete([file.key])}
                emptyMessage={emptyMessage}
              />
              {searchHasMore && (
                <Stack
                  alignItems="center"
                  ref={loadMoreSentinelRef}
                  sx={{ padding: 2, marginBottom: "48px" }}
                >
                  <CircularProgress size={22} />
                </Stack>
              )}
              {isGlobalSearch && !searchHasMore && files.length > 0 && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  textAlign="center"
                  display="block"
                  sx={{ paddingBottom: 6 }}
                >
                  {strings.allLoaded}
                </Typography>
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
            onNotify(translate("folderCreated"), "success");
            await loadListing();
          } catch (error) {
            onNotify(errorMessage(error), "error");
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

      {dropActive && route.kind === "folder" && (
        <Box
          sx={{
            position: "fixed",
            inset: 0,
            zIndex: Z_INDEX.dragOverlay,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "surface.overlay",
            border: "3px dashed",
            borderColor: "primary.main",
            pointerEvents: "none",
          }}
        >
          <Box
            sx={{
              px: 3,
              py: 2,
              borderRadius: 2,
              backgroundColor: "background.paper",
              boxShadow: (theme) =>
                warmShadow(theme.palette.mode === "dark", "0 8px 24px", 0.12),
            }}
          >
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {strings.dropToUpload}
            </Typography>
          </Box>
        </Box>
      )}

      <Suspense fallback={null}>
        <PreviewDialog
          file={previewFile}
          siblings={previewSiblings}
          onSibling={(file) => {
            pushRecent({ key: file.key, name: file.name, isDir: false });
            setPreviewFile(file);
          }}
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
      </Suspense>

      <MoveDialog
        open={Boolean(moveTarget)}
        sourceKeys={moveTarget ?? []}
        onClose={() => setMoveTarget(null)}
        onMove={handleMove}
        onError={(error) => onNotify(error.message, "error")}
      />

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={translate("confirmDeleteTitle")}
        message={translate("confirmDeleteMsg", { count: confirmDelete?.length ?? 0 })}
        confirmText={translate("confirmAction")}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleConfirmDelete}
      />

      <MobileNav
        visible={selectedKeys.length === 0}
        filesActive={route.kind === "folder"}
        onGoFiles={() =>
          navigate({ kind: "folder", path: lastFolderPath.current })
        }
        onUploadFile={openFilePicker}
        onUploadFolder={openFolderPicker}
        onCreateFolder={() => setShowCreateFolder(true)}
        onOpenTextPad={() => setShowTextPadDrawer(true)}
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
            onNotify(errorMessage(error), "error");
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
          if (file) setShareTarget(file);
        }}
        onCopy={() => {
          copyToClipboard(selectedKeys);
          onNotify(translate("copiedToClipboard"), "success");
        }}
        onCut={() => {
          cutToClipboard(selectedKeys);
          onNotify(translate("cutToClipboard"), "success");
        }}
        onMove={() => setMoveTarget(selectedKeys)}
      />
    </Box>
  );
}

export default Main;
