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
  Menu,
  MenuItem,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  ContentCopy as ContentCopyIcon,
  ExpandMore as ExpandMoreIcon,
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  SearchOff as SearchOffIcon,
} from "@mui/icons-material";

import ConfirmDialog from "./ConfirmDialog";
import CreateFolderDialog from "./CreateFolderDialog";
import EmptyState from "./EmptyState";
import ExplorerBar, { ExplorerSection } from "./ExplorerBar";
import FileActionSheet, { FileAction } from "./FileActionSheet";
import FileGrid, { FileGridSkeleton } from "./FileGrid";
import MobileNav from "./MobileNav";
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
import { Density, FileTypeFilter, SortPref, usePersistedState, ViewMode } from "./app/prefs";
import { Z_INDEX } from "./app/theme";
import { pushRecent, RecentEntry, useRecent } from "./app/recent";
import { strings } from "./app/strings";
import {
  collectFilesFromDataTransfer,
  copyPaste,
  createFolder,
  downloadArchive,
  downloadFile,
  fetchFolderCounts,
  fetchPath,
  openFile,
  searchFiles,
  selectDirectoryFiles,
} from "./app/transfer";
import { moveToTrash, restoreTrash } from "./app/trash";
import { useAuth } from "./app/auth";
import { useTransferQueue, useUploadEnqueue } from "./app/transferQueue";
import { FileItem } from "./app/types";
import {
  basename,
  fileTypeCategory,
  formatListingSize,
  isDirectory,
  isJunkFileName,
  uniqueName,
  uniquifyUploadFiles,
} from "./app/utils";

export type SearchScope = "folder" | "global";

const FOLDER_COUNT_CACHE_KEY = "flaredrive.folderCounts";
const FOLDER_COUNT_FILL_MAX = 50;

function loadFolderCountCache(): Record<string, number> {
  try {
    return JSON.parse(
      sessionStorage.getItem(FOLDER_COUNT_CACHE_KEY) || "{}"
    ) as Record<string, number>;
  } catch {
    return {};
  }
}

function saveFolderCountCache(counts: Record<string, number>) {
  try {
    sessionStorage.setItem(FOLDER_COUNT_CACHE_KEY, JSON.stringify(counts));
  } catch {
    // 忽略持久化失败
  }
}

function isTypingTarget(target: EventTarget | null) {
  if (target instanceof HTMLInputElement) {
    // 复选框/单选/按钮不是文本输入，键盘导航应继续生效
    return !["checkbox", "radio", "button", "submit"].includes(target.type);
  }
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

function parentKey(key: string) {
  const trimmed = key.replace(/\/$/, "");
  const index = trimmed.lastIndexOf("/");
  return index >= 0 ? trimmed.slice(0, index + 1) : "";
}

function stampPastedName(file: File) {
  const subtype = (file.type.split("/")[1] || "png").replace("jpeg", "jpg");
  const ext = subtype.split("+")[0] || "png";
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${strings.pastedImage} ${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
    now.getDate()
  )}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.${ext}`;
}

function dragHasFiles(event: DragEvent | React.DragEvent) {
  const types = event.dataTransfer?.types;
  if (!types) return false;
  const list = Array.from(types as ArrayLike<string>);
  if (list.includes("application/x-flaredrive")) return false;
  return list.includes("Files");
}

function hasOpenOverlay() {
  const nodes = document.querySelectorAll(".MuiModal-root");
  for (let i = 0; i < nodes.length; i++) { const node = nodes[i];
    if (node.getAttribute("aria-hidden") !== "true") return true;
  }
  return false;
}

function PathBar({
  cwd,
  onNavigate,
  stats,
  searchScope,
  onSearchScopeChange,
  searchQuery,
  onNotify,
}: {
  cwd: string;
  onNavigate: (path: string) => void;
  stats: string;
  searchScope: SearchScope;
  onSearchScopeChange: (scope: SearchScope) => void;
  searchQuery: string;
  onNotify: NotifyFn;
}) {
  const parts = cwd.replace(/\/$/, "").split("/").filter(Boolean);
  const atRoot = parts.length === 0;
  const pathText = atRoot ? "/" : `/${parts.join("/")}/`;
  const parentPath =
    atRoot || parts.length === 1 ? "" : `${parts.slice(0, -1).join("/")}/`;
  const [siblingsAnchor, setSiblingsAnchor] = useState<null | HTMLElement>(null);
  const [siblings, setSiblings] = useState<FileItem[] | null>(null);
  const openSiblings = async (event: React.MouseEvent<HTMLButtonElement>) => {
    setSiblingsAnchor(event.currentTarget);
    setSiblings(null);
    try {
      const items = await fetchPath(parentPath);
      setSiblings(items.filter((item) => item.isDir));
    } catch {
      setSiblings([]);
    }
  };
  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(pathText);
      onNotify("路径已复制", "success");
    } catch {
      onNotify("复制失败", "error");
    }
  };

  return (
    <Box sx={{ px: 1.5, pb: 1.25, pt: 0.25 }}>
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
        <Breadcrumbs
          separator="›"
          sx={{
            flexGrow: 1,
            "& .MuiTypography-root": { fontWeight: 600, fontSize: "0.9rem" },
            "& .MuiLink-root": { fontWeight: 500, fontSize: "0.9rem" },
          }}
        >
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
        <IconButton
          size="small"
          aria-label={strings.copyPath}
          onClick={copyPath}
          sx={{ flexShrink: 0 }}
        >
          <ContentCopyIcon fontSize="small" />
        </IconButton>
        {!atRoot && (
          <Tooltip title={strings.siblingFolders}>
            <IconButton
              size="small"
              aria-label={strings.siblingFolders}
              onClick={openSiblings}
              sx={{ flexShrink: 0, mr: -0.5 }}
            >
              <ExpandMoreIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <Menu
          anchorEl={siblingsAnchor}
          open={Boolean(siblingsAnchor)}
          onClose={() => setSiblingsAnchor(null)}
        >
          {siblings === null && (
            <MenuItem disabled>{strings.loading}</MenuItem>
          )}
          {siblings !== null && siblings.length === 0 && (
            <MenuItem disabled>{strings.noSiblingFolder}</MenuItem>
          )}
          {siblings !== null &&
            siblings.map((item) => (
              <MenuItem
                key={item.key}
                selected={item.key === cwd.replace(/\/$/, "")}
                onClick={() => {
                  setSiblingsAnchor(null);
                  onNavigate(item.key);
                }}
              >
                <FolderIcon fontSize="small" sx={{ mr: 1, color: "primary.main" }} />
                {item.name}
              </MenuItem>
            ))}
        </Menu>
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
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            px: 1,
            py: 0.25,
            borderRadius: "999px",
            backgroundColor: "background.default",
            fontVariantNumeric: "tabular-nums",
          }}
        >
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
          sx={{
            backgroundColor: "background.default",
            "& .MuiToggleButton-root": {
              border: "none",
              px: 1.25,
              py: 0.25,
              fontSize: "0.75rem",
              "&.Mui-selected": {
                backgroundColor: "background.paper",
                color: "primary.main",
                boxShadow: "0 1px 2px rgba(26, 23, 20, 0.08)",
              },
            },
          }}
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
  const [density, setDensity] = usePersistedState<Density>(
    "flaredrive.density",
    "standard"
  );
  const [pendingOpen, setPendingOpen] = useState<string | null>(null);
  const [folderCounts, setFolderCounts] = useState<Record<string, number>>(
    loadFolderCountCache
  );
  const folderCountInFlight = useRef(new Set<string>());
  const recents = useRecent();
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
  const [dropActive, setDropActive] = useState(false);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const selectionAnchor = useRef<string | null>(null);
  const lastFolderPath = useRef("");
  const loadedListingKey = useRef<string | null>(null);
  const dropDepth = useRef(0);

  const cwd = route.kind === "folder" ? route.path : lastFolderPath.current;
  const section: ExplorerSection =
    route.kind === "shares" || route.kind === "trash" ? route.kind : "folder";

  useEffect(() => {
    if (route.kind === "folder") lastFolderPath.current = route.path;
  }, [route]);

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
    setFocusedKey(null);
  }, [cwd, section]);

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

    const silent = loadedListingKey.current === listingKey;
    if (!silent) setLoading(true);
    try {
      if (isGlobalSearch) {
        const result = await searchFiles(debouncedSearch);
        setFiles(result.items);
        setSearchHasMore(result.hasMore);
        setSearchCursor(result.nextCursor);
      } else {
        const items = await fetchPath(cwd);
        setFiles(items);
        setFolderCounts((prev) => ({
          ...prev,
          [cwd.replace(/\/$/, "")]: items.length,
        }));
        setSearchHasMore(false);
        setSearchCursor(undefined);
      }
      loadedListingKey.current = listingKey;
      setSelectedKeys([]);
    } catch (error) {
      onNotify((error as Error).message, "error", {
        duration: 8000,
        action: { label: strings.retry, onClick: () => loadListing() },
      });
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

  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const loadMore = useCallback(async () => {
    if (!isGlobalSearch || !searchCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await searchFiles(debouncedSearch, searchCursor);
      setFiles((prev) => [...prev, ...result.items]);
      setSearchHasMore(result.hasMore);
      setSearchCursor(result.nextCursor);
    } catch (error) {
      onNotify((error as Error).message, "error");
    } finally {
      setLoadingMore(false);
    }
  }, [
    debouncedSearch,
    isGlobalSearch,
    loadingMore,
    onNotify,
    searchCursor,
  ]);

  // 全盘搜索触底自动加载：IO 为主，scroll 捕获阶段兜底（部分嵌入环境 IO 不发回调）
  useEffect(() => {
    if (!searchHasMore) return;
    const node = loadMoreSentinelRef.current;
    if (!node) return;

    const maybeLoad = () => {
      const rect = node.getBoundingClientRect();
      if (rect.top < window.innerHeight + 200 && rect.bottom > -200) {
        loadMore();
      }
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { rootMargin: "200px" }
    );
    observer.observe(node);

    let lastCheck = 0;
    const onScroll = () => {
      // rAF 在部分嵌入环境会被暂停，直接用时间戳节流
      const now = Date.now();
      if (now - lastCheck < 150) return;
      lastCheck = now;
      maybeLoad();
    };
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    const initial = window.setTimeout(maybeLoad, 0);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.clearTimeout(initial);
    };
  }, [loadMore, searchHasMore]);

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

  useEffect(() => {
    if (focusedKey && !visibleFiles.some((file) => file.key === focusedKey)) {
      setFocusedKey(null);
    }
  }, [focusedKey, visibleFiles]);

  const scrollFocusedIntoView = useCallback((key: string) => {
    const nodes = document.querySelectorAll<HTMLElement>("[data-file-key]");
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.dataset.fileKey === key) {
        node.scrollIntoView({ block: "nearest" });
        return;
      }
    }
  }, []);

  const jumpFocused = useCallback(
    (index: number, extendSelection: boolean) => {
      if (!visibleFiles.length) return;
      const clamped = Math.max(0, Math.min(index, visibleFiles.length - 1));
      const next = visibleFiles[clamped];
      setFocusedKey(next.key);
      if (extendSelection) {
        setSelectedKeys((prev) =>
          prev.includes(next.key) ? prev : [...prev, next.key]
        );
      }
      scrollFocusedIntoView(next.key);
    },
    [scrollFocusedIntoView, visibleFiles]
  );

  const moveFocused = useCallback(
    (delta: number, extendSelection: boolean) => {
      if (!visibleFiles.length) return;
      const currentIndex = focusedKey
        ? visibleFiles.findIndex((file) => file.key === focusedKey)
        : -1;
      jumpFocused(currentIndex + delta, extendSelection);
    },
    [focusedKey, jumpFocused, visibleFiles]
  );

  // 惰性补全可见文件夹的子项计数（缓存到 sessionStorage，重复进入不重复请求）
  useEffect(() => {
    if (route.kind !== "folder" || isGlobalSearch) return;
    const targets = visibleFiles
      .filter(
        (file) =>
          file.isDir &&
          folderCounts[file.key] === undefined &&
          !folderCountInFlight.current.has(file.key)
      )
      .slice(0, FOLDER_COUNT_FILL_MAX);
    if (!targets.length) return;
    for (const target of targets) folderCountInFlight.current.add(target.key);
    let cancelled = false;
    fetchFolderCounts(targets.map((target) => target.key)).then((counts) => {
      for (const target of targets) {
        folderCountInFlight.current.delete(target.key);
      }
      if (cancelled) return;
      if (Object.keys(counts).length === 0) return;
      setFolderCounts((prev) => {
        const next = { ...prev, ...counts };
        saveFolderCountCache(next);
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [folderCounts, isGlobalSearch, route.kind, visibleFiles]);

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

  const toggleSelect = useCallback(
    (key: string, event?: { shiftKey?: boolean }) => {
      setSelectedKeys((prev) => {
        if (event?.shiftKey && selectionAnchor.current) {
          const anchorIndex = visibleFiles.findIndex(
            (file) => file.key === selectionAnchor.current
          );
          const targetIndex = visibleFiles.findIndex(
            (file) => file.key === key
          );
          if (anchorIndex >= 0 && targetIndex >= 0) {
            const [start, end] =
              anchorIndex <= targetIndex
                ? [anchorIndex, targetIndex]
                : [targetIndex, anchorIndex];
            const merged = new Set(prev);
            for (const file of visibleFiles.slice(start, end + 1)) {
              merged.add(file.key);
            }
            return [...merged];
          }
        }
        return prev.includes(key)
          ? prev.filter((item) => item !== key)
          : [...prev, key];
      });
      selectionAnchor.current = key;
    },
    [visibleFiles]
  );

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
      pushRecent({ key: file.key, name: file.name, isDir: false });
      if (isPreviewable(file)) {
        setPreviewFile(file);
      } else {
        openFile(key).catch((error) => onNotify((error as Error).message, "error"));
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

  const takenForCwd = useMemo(() => {
    const taken = new Set(files.map((item) => item.name));
    for (const task of transferQueue) {
      if (task.type !== "upload") continue;
      if (task.basedir !== cwd) continue;
      if (task.status === "canceled" || task.status === "completed") continue;
      const rest = task.remoteKey.startsWith(cwd)
        ? task.remoteKey.slice(cwd.length)
        : task.name;
      taken.add(rest.split("/").filter(Boolean)[0] || task.name);
    }
    return taken;
  }, [cwd, files, transferQueue]);

  const enqueueToDir = useCallback(
    (incoming: File[], basedir: string, taken: Iterable<string>) => {
      if (!incoming.length) return;
      const unique = uniquifyUploadFiles(incoming, taken);
      uploadEnqueue(...unique.map((file) => ({ file, basedir })));
    },
    [uploadEnqueue]
  );

  const enqueueToCwd = useCallback(
    (incoming: File[]) => enqueueToDir(incoming, cwd, takenForCwd),
    [cwd, enqueueToDir, takenForCwd]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.key === "Escape") {
        if (hasOpenOverlay()) return;
        if (selectedKeys.length || focusedKey) {
          event.preventDefault();
          setSelectedKeys([]);
          setFocusedKey(null);
        }
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (hasOpenOverlay()) return;
        event.preventDefault();
        moveFocused(event.key === "ArrowDown" ? 1 : -1, event.shiftKey);
        return;
      }
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        if (hasOpenOverlay()) return;
        event.preventDefault();
        moveFocused(event.key === "ArrowRight" ? 1 : -1, event.shiftKey);
        return;
      }
      if (event.key === "Home" || event.key === "End") {
        if (hasOpenOverlay()) return;
        event.preventDefault();
        jumpFocused(
          event.key === "Home" ? 0 : visibleFiles.length - 1,
          event.shiftKey
        );
        return;
      }
      if (event.key === " " && focusedKey) {
        if (hasOpenOverlay()) return;
        event.preventDefault();
        toggleSelect(focusedKey);
        return;
      }
      if ((event.key === "a" || event.key === "A") && (event.metaKey || event.ctrlKey)) {
        if (hasOpenOverlay()) return;
        event.preventDefault();
        selectAll();
        return;
      }
      if (event.key === "F2") {
        if (hasOpenOverlay()) return;
        const activeKey = focusedKey ?? (selectedKeys.length === 1 ? selectedKeys[0] : null);
        if (!activeKey) return;
        const file = visibleFiles.find((item) => item.key === activeKey);
        if (!file) return;
        event.preventDefault();
        setRenameTarget(file);
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (hasOpenOverlay()) return;
        const targets =
          selectedKeys.length > 0
            ? selectedKeys
            : focusedKey
            ? [focusedKey]
            : [];
        if (!targets.length) return;
        event.preventDefault();
        setConfirmDelete(targets);
        return;
      }
      if (event.key === "Enter") {
        if (hasOpenOverlay()) return;
        const activeKey = focusedKey ?? (selectedKeys.length === 1 ? selectedKeys[0] : null);
        if (!activeKey) return;
        const file = visibleFiles.find((item) => item.key === activeKey);
        if (!file) return;
        event.preventDefault();
        if (file.isDir) navigateFolder(file.key);
        else handleOpen(file.key);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    focusedKey,
    handleOpen,
    jumpFocused,
    moveFocused,
    navigateFolder,
    selectAll,
    selectedKeys,
    toggleSelect,
    visibleFiles,
  ]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (route.kind !== "folder") return;
      if (isTypingTarget(event.target)) return;
      if (hasOpenOverlay()) return;
      const items = event.clipboardData?.items;
      if (!items) return;
      const pasted: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind !== "file") continue;
        const file = item.getAsFile();
        if (file) pasted.push(file);
      }
      if (!pasted.length) return;
      event.preventDefault();
      const named = pasted.map((file) => {
        const generic =
          file.type.startsWith("image/") &&
          (!file.name || /^image\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name));
        if (!generic) return file;
        return new File([file], stampPastedName(file), {
          type: file.type,
          lastModified: file.lastModified,
        });
      });
      enqueueToCwd(named);
      onNotify(`已加入 ${named.length} 个上传任务`, "success");
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [enqueueToCwd, onNotify, route.kind]);

  useEffect(() => {
    if (route.kind !== "folder") {
      dropDepth.current = 0;
      setDropActive(false);
      return;
    }
    const onEnter = (event: DragEvent) => {
      if (!dragHasFiles(event)) return;
      dropDepth.current += 1;
      setDropActive(true);
    };
    const onLeave = () => {
      dropDepth.current = Math.max(0, dropDepth.current - 1);
      if (dropDepth.current === 0) setDropActive(false);
    };
    const onOver = (event: DragEvent) => {
      if (!dragHasFiles(event)) return;
      event.preventDefault();
    };
    const onDrop = async (event: DragEvent) => {
      const wasFiles = dragHasFiles(event);
      dropDepth.current = 0;
      setDropActive(false);
      if (!wasFiles || !event.dataTransfer) return;
      event.preventDefault();
      const dropped = await collectFilesFromDataTransfer(event.dataTransfer);
      if (dropped.length) enqueueToCwd(dropped);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [enqueueToCwd, route.kind]);

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
    const source = renameTarget.key;
    const runRename = async () => {
      await copyPaste(source, target, true);
    };
    try {
      await runRename();
      onNotify("重命名成功", "success");
    } catch (error) {
      onNotify((error as Error).message, "error", {
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
    try {
      const result = await moveToTrash(confirmDelete);
      const trashIds = result.results.map((item) => item.id);
      onNotify(`已移入回收站 ${trashIds.length} 项`, "success", {
        duration: 7000,
        action: trashIds.length
          ? {
              label: strings.undo,
              onClick: () => {
                restoreTrash(trashIds)
                  .then(() => {
                    onNotify("已撤销删除", "success");
                  })
                  .catch((error) =>
                    onNotify((error as Error).message, "error")
                  )
                  .finally(() => loadListing());
              },
            }
          : undefined,
      });
    } catch (error) {
      onNotify((error as Error).message, "error");
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
      onNotify("粘贴完成", "success");
    } catch (error) {
      onNotify((error as Error).message, "error", {
        duration: 8000,
        action: { label: strings.retry, onClick: () => runPaste().catch(() => {}) },
      });
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
      try {
        await transferKeys(keys, `${folder.key}/`, "cut");
        setSelectedKeys([]);
        await loadListing();
      } catch (error) {
        onNotify((error as Error).message, "error");
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

  const openFilePicker = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "*/*";
    input.multiple = true;
    input.onchange = async () => {
      if (!input.files) return;
      enqueueToCwd(Array.from(input.files));
    };
    input.click();
  };

  const openFolderPicker = async () => {
    const picked = await selectDirectoryFiles();
    if (picked.length) enqueueToCwd(picked);
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

  const listingPending =
    loading ||
    (route.kind === "folder" && loadedListingKey.current !== listingKey);

  useEffect(() => {
    if (!pendingOpen || listingPending) return;
    const found = files.find((item) => item.key === pendingOpen);
    if (found) {
      if (isPreviewable(found)) setPreviewFile(found);
      else {
        openFile(found.key).catch((error) =>
          onNotify((error as Error).message, "error")
        );
      }
    } else {
      onNotify("最近项目不存在或已移动", "error");
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
        <Box onScroll={handleContentScroll} sx={{ flexGrow: 1, overflowY: "auto", pb: { xs: 8, sm: 0 } }}>
          <TrashView
            onNotify={onNotify}
            onGoFiles={() =>
              navigate({ kind: "folder", path: lastFolderPath.current })
            }
          />
        </Box>
      )}
      {route.kind === "shares" && (
        <Box onScroll={handleContentScroll} sx={{ flexGrow: 1, overflowY: "auto", pb: { xs: 8, sm: 0 } }}>
          <SharesView
            onNotify={onNotify}
            onGoFiles={() =>
              navigate({ kind: "folder", path: lastFolderPath.current })
            }
          />
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
                onDownload={(file) => {
                  (file.isDir
                    ? downloadArchive([file.key])
                    : downloadFile(file.key)
                  ).catch((error) =>
                    onNotify((error as Error).message, "error")
                  );
                }}
                onShareFile={(file) => setShareTarget(file)}
                onDeleteFile={(file) => setConfirmDelete([file.key])}
                emptyMessage={
                  debouncedSearch ? (
                    <EmptyState
                      icon={<SearchOffIcon />}
                      title={strings.noSearchResult}
                      description={strings.noSearchResultHint}
                      actions={
                        <Button
                          variant="outlined"
                          onClick={() => onSearchChange("")}
                        >
                          {strings.clearSearch}
                        </Button>
                      }
                    />
                  ) : (
                    <EmptyState
                      icon={<FolderOpenIcon />}
                      title={strings.noFiles}
                      description={strings.noFilesHint}
                      actions={
                        <>
                          <Button variant="contained" onClick={openFilePicker}>
                            {strings.upload}
                          </Button>
                          <Button
                            variant="outlined"
                            onClick={() => setShowCreateFolder(true)}
                          >
                            {strings.createFolder}
                          </Button>
                        </>
                      }
                    />
                  )
                }
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
                  已全部加载
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
              boxShadow: "0 8px 24px rgba(26,23,20,0.12)",
            }}
          >
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {strings.dropToUpload}
            </Typography>
          </Box>
        </Box>
      )}

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
    </Box>
  );
}

export default Main;
