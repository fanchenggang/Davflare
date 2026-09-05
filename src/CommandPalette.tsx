import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Box,
  CircularProgress,
  Dialog,
  InputBase,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import {
  DarkMode as DarkModeIcon,
  Delete as DeleteIcon,
  Image as ImageIcon,
  Language as LanguageIcon,
  Search as SearchIcon,
  Share as ShareIcon,
  Storage as StorageIcon,
  SwapVert as SwapVertIcon,
} from "@mui/icons-material";

import MimeIcon from "./MimeIcon";
import { useFeatures } from "./app/features";
import { NotifyFn } from "./app/notify";
import { Route } from "./app/route";
import { strings } from "./app/strings";
import { MOTION, warmShadow } from "./app/theme";
import { openFile, searchFiles } from "./app/transfer";
import { FileItem } from "./app/types";
import { errorMessage } from "./app/utils";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  /** 路由跳转：文件夹结果与「前往xx」类命令共用 */
  onNavigate: (route: Route) => void;
  onNotify: NotifyFn;
  onOpenTransfers: () => void;
  onThemeToggle: () => void;
  /** WebDAV 信息面板入口在 Main 内部，App 层暂无法触发；不传则不显示该命令 */
  onOpenWebDav?: () => void;
}

interface PaletteCommand {
  id: string;
  icon: React.ReactNode;
  /** strings 字典里的文案键 */
  labelKey: string;
  handler: () => void;
}

type PaletteItem =
  | { type: "file"; file: FileItem }
  | { type: "command"; command: PaletteCommand; label: string };

const SEARCH_DEBOUNCE_MS = 300;

function CommandPalette({
  open,
  onClose,
  onNavigate,
  onNotify,
  onOpenTransfers,
  onThemeToggle,
  onOpenWebDav,
}: CommandPaletteProps) {
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";
  const { flags } = useFeatures();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FileItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // 命令注册表：结构化数组，App 能真实接线的命令才进表
  const commands = useMemo<PaletteCommand[]>(() => {
    const list: PaletteCommand[] = [
      {
        id: "toggle-theme",
        icon: <DarkModeIcon />,
        labelKey: "commandToggleTheme",
        handler: onThemeToggle,
      },
      {
        id: "goto-shares",
        icon: <ShareIcon />,
        labelKey: "commandGotoShares",
        handler: () => onNavigate({ kind: "shares" }),
      },
      {
        id: "goto-trash",
        icon: <DeleteIcon />,
        labelKey: "commandGotoTrash",
        handler: () => onNavigate({ kind: "trash" }),
      },
      {
        id: "goto-sites",
        icon: <LanguageIcon />,
        labelKey: "commandGotoSites",
        handler: () => onNavigate({ kind: "sites" }),
      },
      {
        id: "goto-images",
        icon: <ImageIcon />,
        labelKey: "commandGotoImages",
        handler: () => onNavigate({ kind: "images" }),
      },
      {
        id: "open-transfers",
        icon: <SwapVertIcon />,
        labelKey: "commandOpenTransfers",
        handler: onOpenTransfers,
      },
    ];
    if (onOpenWebDav) {
      list.push({
        id: "open-webdav",
        icon: <StorageIcon />,
        labelKey: "commandOpenWebDav",
        handler: onOpenWebDav,
      });
    }
    return list;
  }, [onNavigate, onOpenTransfers, onOpenWebDav, onThemeToggle]);

  // 站点/图床命令跟随功能开关
  const commandItems = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return commands
      .filter((command) => {
        if (command.id === "goto-sites") return flags.sites;
        if (command.id === "goto-images") return flags.imageHost;
        return true;
      })
      .map((command) => ({ command, label: strings[command.labelKey] }))
      .filter(
        (item) => !keyword || item.label.toLowerCase().includes(keyword)
      );
  }, [commands, flags.sites, flags.imageHost, query]);

  const fileItems = useMemo(
    () => (query.trim() ? results : []),
    [query, results]
  );

  const flatItems = useMemo<PaletteItem[]>(
    () => [
      ...fileItems.map((file): PaletteItem => ({ type: "file", file })),
      ...commandItems.map(
        ({ command, label }): PaletteItem => ({ type: "command", command, label })
      ),
    ],
    [fileItems, commandItems]
  );

  // 每次打开清空上次的关键词与结果
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSearching(false);
      setActiveIndex(0);
    }
  }, [open]);

  // 300ms 防抖搜索；自增标记丢弃过期响应，避免慢请求覆盖新结果
  useEffect(() => {
    const keyword = query.trim();
    if (!open || !keyword) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let stale = false;
    const timer = window.setTimeout(() => {
      searchFiles(keyword)
        .then((res) => {
          if (!stale) setResults(res.items);
        })
        .catch((error: unknown) => {
          if (!stale) onNotify(errorMessage(error), "error");
        })
        .finally(() => {
          if (!stale) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [open, query, onNotify]);

  // 列表内容变化时重置 roving 索引并滚回顶部
  useEffect(() => {
    setActiveIndex(0);
  }, [flatItems]);

  // roving 索引滚动跟随
  useEffect(() => {
    const el = scrollRef.current?.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, flatItems]);

  const activateItem = useCallback(
    (item: PaletteItem) => {
      onClose();
      if (item.type === "command") {
        item.command.handler();
        return;
      }
      const { file } = item;
      if (file.isDir) {
        onNavigate({ kind: "folder", path: file.key });
        return;
      }
      openFile(file.key).catch((error: unknown) =>
        onNotify(errorMessage(error), "error")
      );
    },
    [onClose, onNavigate, onNotify]
  );

  const handleInputKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (flatItems.length === 0) return;
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex(
        (i) => (i + delta + flatItems.length) % flatItems.length
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = flatItems[activeIndex];
      if (item) activateItem(item);
    }
  };

  const itemSx = {
    "&.Mui-selected": { backgroundColor: "action.selected" },
    transition: `background-color ${MOTION.fast}ms ease`,
  } as const;

  const renderSectionHeader = (text: string) => (
    <Typography
      variant="caption"
      sx={{
        display: "block",
        px: 2,
        pt: 1.25,
        pb: 0.5,
        color: "text.secondary",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}
    >
      {text}
    </Typography>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{
        sx: {
          alignSelf: "flex-start",
          mt: { xs: "6vh", sm: "8vh" },
          bgcolor: "background.paper",
          overflow: "hidden",
          boxShadow: `${warmShadow(dark, "0 12px 32px", 0.22)}, ${warmShadow(
            dark,
            "0 2px 8px",
            0.14
          )}`,
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 2,
          py: 1.25,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <SearchIcon sx={{ fontSize: 20, color: "text.secondary" }} />
        <InputBase
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder={strings.commandPalettePlaceholder}
          sx={{ flex: 1, minWidth: 0, fontSize: "1rem" }}
          inputProps={{ "aria-label": strings.commandPalettePlaceholder }}
        />
        {searching && <CircularProgress size={16} sx={{ mr: 0.5 }} />}
      </Box>
      <Box ref={scrollRef} sx={{ maxHeight: 320, overflowY: "auto", py: 0.5 }}>
        {flatItems.length === 0 ? (
          <Typography
            color="text.secondary"
            sx={{ px: 2, py: 3, textAlign: "center" }}
          >
            {strings.commandNoResults}
          </Typography>
        ) : (
          <List disablePadding>
            {fileItems.length > 0 && renderSectionHeader(strings.commandFiles)}
            {fileItems.map((file, index) => (
              <ListItemButton
                key={`file-${file.key}`}
                data-index={index}
                selected={index === activeIndex}
                onClick={() => activateItem({ type: "file", file })}
                sx={itemSx}
              >
                <ListItemIcon sx={{ minWidth: 40 }}>
                  <MimeIcon
                    contentType={file.contentType}
                    name={file.name}
                    fontSize="small"
                  />
                </ListItemIcon>
                <ListItemText
                  primary={file.name}
                  secondary={file.key}
                  primaryTypographyProps={{ noWrap: true }}
                  secondaryTypographyProps={{ noWrap: true }}
                />
              </ListItemButton>
            ))}
            {commandItems.length > 0 &&
              renderSectionHeader(strings.commandActions)}
            {commandItems.map((item, index) => {
              const flatIndex = fileItems.length + index;
              return (
                <ListItemButton
                  key={`command-${item.command.id}`}
                  data-index={flatIndex}
                  selected={flatIndex === activeIndex}
                  onClick={() =>
                    activateItem({ type: "command", command: item.command, label: item.label })
                  }
                  sx={itemSx}
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    {item.command.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{ noWrap: true }}
                  />
                </ListItemButton>
              );
            })}
          </List>
        )}
      </Box>
    </Dialog>
  );
}

export default CommandPalette;
