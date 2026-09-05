import React, { useRef } from "react";
import { keyframes } from "@emotion/react";
import { alpha, useTheme } from "@mui/material/styles";
import {
  Box,
  Checkbox,
  Grid,
  IconButton,
  List,
  ListItemButton,
  Skeleton,
  Tooltip,
  Typography,
} from "@mui/material";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import DownloadIcon from "@mui/icons-material/Download";
import ShareIcon from "@mui/icons-material/Share";
import DeleteIcon from "@mui/icons-material/Delete";

import AuthThumbnail from "./AuthThumbnail";
import MimeIcon from "./MimeIcon";
import { Density, ViewMode } from "./app/prefs";
import { Z_INDEX, warmShadow } from "./app/theme";
import { strings, translate } from "./app/strings";
import { FileItem } from "./app/types";
import {
  formatDateTime,
  formatRelativeDateTime,
  humanReadableSize,
  isDirectory,
} from "./app/utils";

// 卡片/行的进入动效（尊重系统减弱动态偏好）
const itemEnter = keyframes`
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
`;

const itemEnterSx = (index: number) => ({
  animation: `${itemEnter} 0.22s ease both`,
  animationDelay: `${Math.min(index, 24) * 14}ms`,
  "@media (prefers-reduced-motion: reduce)": {
    animation: "none",
  },
});

// 选中态呼吸光效：柔和的橙色外圈明暗脉动（减弱动态时禁用）
const selectionGlow = keyframes`
  0%, 100% { box-shadow: 0 0 0 0 rgba(243, 128, 32, 0.00), 0 1px 2px rgba(26, 23, 20, 0.04); }
  50% { box-shadow: 0 0 0 4px rgba(243, 128, 32, 0.18), 0 1px 2px rgba(26, 23, 20, 0.04); }
`;

const selectionGlowSx = {
  animation: `${selectionGlow} 2.4s ease-in-out infinite`,
  "@media (prefers-reduced-motion: reduce)": {
    animation: "none",
  },
};

// 搜索命中高亮：纯文本拆分（React 转义，天然防 XSS），命中片段用主色加粗
function highlightName(name: string, query?: string): React.ReactNode {
  const q = (query || "").trim().toLowerCase();
  if (!q) return name;
  const lower = name.toLowerCase();
  if (!lower.includes(q)) return name;
  const nodes: React.ReactNode[] = [];
  let pos = 0;
  let index = lower.indexOf(q);
  let key = 0;
  while (index >= 0) {
    if (index > pos) nodes.push(name.slice(pos, index));
    nodes.push(
      <Box
        component="mark"
        key={key}
        sx={{
          backgroundColor: "transparent",
          color: "primary.main",
          fontWeight: 800,
          padding: 0,
        }}
      >
        {name.slice(index, index + q.length)}
      </Box>
    );
    key += 1;
    pos = index + q.length;
    index = lower.indexOf(q, pos);
  }
  if (pos < name.length) nodes.push(name.slice(pos));
  return nodes;
}

interface FileGridProps {
  files: FileItem[];
  view: ViewMode;
  density?: Density;
  folderCounts?: Record<string, number>;
  selectedKeys: string[];
  dimmedKeys?: ReadonlySet<string>;
  focusedKey?: string | null;
  highlight?: string;
  onToggleSelect: (key: string, event?: { shiftKey?: boolean }) => void;
  onNavigate: (key: string) => void;
  onOpen: (key: string) => void;
  onOpenMenu: (
    position: { clientX: number; clientY: number },
    file: FileItem
  ) => void;
  onDropOnFolder?: (folder: FileItem, dataTransfer: DataTransfer) => void;
  onDownload?: (file: FileItem) => void;
  onShareFile?: (file: FileItem) => void;
  onDeleteFile?: (file: FileItem) => void;
  emptyMessage?: React.ReactNode;
}

export function FileGridSkeleton({
  view,
  density = "standard",
}: {
  view: ViewMode;
  density?: Density;
}) {
  const compact = density === "compact";
  if (view === "list") {
    return (
      <Box sx={{ px: 1.5, py: 1 }}>
        {Array.from({ length: 10 }).map((_, index) => (
          <Box
            key={index}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              py: compact ? 0.4 : 0.85,
              px: 1,
            }}
          >
            <Skeleton variant="rounded" width={20} height={20} />
            <Skeleton variant="rounded" width={28} height={28} />
            <Skeleton variant="text" sx={{ flex: 1 }} height={22} />
            <Skeleton variant="text" width={72} height={18} />
            <Skeleton variant="text" width={140} height={18} />
          </Box>
        ))}
      </Box>
    );
  }

  return (
    <Grid container spacing={2} sx={{ padding: 1.5 }}>
      {Array.from({ length: 12 }).map((_, index) => (
        <Grid item key={index} xs={compact ? 4 : 6} sm={compact ? 3 : 4} md={compact ? 2 : 3} lg={2}>
          <Box
            sx={{
              height: compact ? 128 : 168,
              borderRadius: 2,
              border: "1px solid",
              borderColor: "divider",
              backgroundColor: "background.paper",
              p: 1.5,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 1,
            }}
          >
            <Skeleton variant="rounded" width={64} height={64} />
            <Skeleton variant="text" width="80%" />
            <Skeleton variant="text" width="50%" />
          </Box>
        </Grid>
      ))}
    </Grid>
  );
}

function FileGrid({
  files,
  view,
  density = "standard",
  folderCounts,
  selectedKeys,
  dimmedKeys,
  focusedKey,
  highlight,
  onToggleSelect,
  onNavigate,
  onOpen,
  onOpenMenu,
  onDropOnFolder,
  onDownload,
  onShareFile,
  onDeleteFile,
  emptyMessage,
}: FileGridProps) {
  const theme = useTheme();
  const isSelected = (file: FileItem) => selectedKeys.includes(file.key);
  const folderMeta = (file: FileItem) => {
    const count = folderCounts?.[file.key];
    if (typeof count === "number") return `${count} ${strings.folderItems}`;
    return strings.folderLabel;
  };

  const openMenu = (
    event: { clientX: number; clientY: number; preventDefault?: () => void },
    file: FileItem
  ) => {
    event.preventDefault?.();
    onOpenMenu({ clientX: event.clientX, clientY: event.clientY }, file);
  };

  const pointer = useRef({ x: 0, y: 0, dragging: false });

  const markPointer = (event: { clientX: number; clientY: number }) => {
    pointer.current = { x: event.clientX, y: event.clientY, dragging: false };
  };

  const beginDrag = (event: React.DragEvent, file: FileItem) => {
    pointer.current.dragging = true;
    // 多选状态下拖动任一选中项 = 整组移动；单拖为旧格式（纯 key）
    const group =
      selectedKeys.includes(file.key) && selectedKeys.length > 1
        ? selectedKeys
        : [file.key];
    event.dataTransfer.setData("application/x-flaredrive", JSON.stringify(group));
    event.dataTransfer.effectAllowed = "move";
  };

  const clickItem = (
    file: FileItem,
    event?: React.MouseEvent
  ) => {
    if (pointer.current.dragging) return;
    // Ctrl/Cmd+Click 切换选择，Shift+Click 范围选择（不触发打开/进入）
    if (event && (event.shiftKey || event.metaKey || event.ctrlKey)) {
      onToggleSelect(file.key, event);
      return;
    }
    if (isDirectory(file)) onNavigate(file.key);
    else onOpen(file.key);
  };

  const checkbox = (file: FileItem, sx?: object) => (
    <Checkbox
      size="small"
      checked={isSelected(file)}
      inputProps={{ "aria-label": translate("selectFileLabel", { name: file.name }) }}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onToggleSelect(file.key, event);
      }}
      sx={sx}
    />
  );

  const moreButton = (file: FileItem, corner?: "tile") => {
    const handle = (event: React.MouseEvent) => {
      event.stopPropagation();
      event.preventDefault();
      onOpenMenu({ clientX: event.clientX, clientY: event.clientY }, file);
    };

    const button = (
      <IconButton
        size="small"
        aria-label={translate("fileActionsLabel", { name: file.name })}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={handle}
        sx={{
          width: "100%",
          height: "100%",
          minWidth: 0,
          padding: 0,
          margin: 0,
          borderRadius: 1,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          "& .MuiSvgIcon-root": {
            fontSize: 22,
            display: "block",
            margin: 0,
          },
        }}
      >
        <MoreHorizIcon />
      </IconButton>
    );

    if (corner !== "tile") {
      return (
        <Box
          sx={{
            width: 44,
            height: 44,
            flexShrink: 0,
            position: "relative",
            zIndex: Z_INDEX.cardOverlay,
            pointerEvents: "auto",
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={handle}
        >
          {button}
        </Box>
      );
    }

    return (
      <Box
        sx={{
          position: "absolute",
          top: 0,
          right: 0,
          zIndex: Z_INDEX.cardOverlay,
          width: 44,
          height: 44,
          boxSizing: "border-box",
          pointerEvents: "auto",
          backgroundColor: alpha(theme.palette.background.paper, 0.92),
          borderRadius: 1,
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={handle}
      >
        {button}
      </Box>
    );
  };

  const folderDrop = (file: FileItem) =>
    isDirectory(file) && onDropOnFolder
      ? {
          onDragOver: (event: React.DragEvent) => {
            event.preventDefault();
            event.stopPropagation();
          },
          onDrop: (event: React.DragEvent) => {
            event.preventDefault();
            event.stopPropagation();
            onDropOnFolder(file, event.dataTransfer);
          },
        }
      : {};

  // 网格卡片 hover/focus 浮现的快捷操作（触屏设备隐藏，走 ⋯ 菜单）
  const quickActions = (file: FileItem) => {
    if (!onDownload && !onShareFile && !onDeleteFile) return null;
    const stop = (event: React.SyntheticEvent) => event.stopPropagation();
    const actionButton = (
      label: string,
      icon: React.ReactNode,
      handler: ((file: FileItem) => void) | undefined,
      color?: "error"
    ) =>
      handler ? (
        <Tooltip title={label} key={label}>
          <IconButton
            size="small"
            aria-label={`${file.name} ${label}`}
            color={color}
            onPointerDown={stop}
            onMouseDown={stop}
            onClick={(event) => {
              stop(event);
              handler(file);
            }}
            sx={{ "& .MuiSvgIcon-root": { fontSize: 17 } }}
          >
            {icon}
          </IconButton>
        </Tooltip>
      ) : null;

    return (
      <Box
        className="quick-actions-bar"
        sx={{
          position: "absolute",
          bottom: 8,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          zIndex: Z_INDEX.cardOverlay,
          backgroundColor: alpha(theme.palette.background.paper, 0.95),
          borderRadius: 999,
          padding: "1px 4px",
          boxShadow: (theme) =>
            warmShadow(theme.palette.mode === "dark", "0 2px 10px", 0.16),
          opacity: 0,
          pointerEvents: "none",
          ".file-card:hover &, .file-card:focus-within &": {
            opacity: 1,
            pointerEvents: "auto",
          },
          transition: "opacity 0.15s ease",
        }}
        onPointerDown={stop}
        onClick={stop}
      >
        {actionButton(strings.download, <DownloadIcon />, onDownload)}
        {actionButton(strings.share, <ShareIcon />, onShareFile)}
        {actionButton(strings.delete, <DeleteIcon />, onDeleteFile, "error")}
      </Box>
    );
  };

  const itemList = (file: FileItem, index: number) => (
    <ListItemButton
      component="div"
      className="file-card"
      selected={isSelected(file)}
      data-file-key={file.key}
      onPointerDown={markPointer}
      onClick={(event) => clickItem(file, event)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter") clickItem(file);
        if (event.key === " ") event.preventDefault();
      }}
      onContextMenu={(event) => openMenu(event, file)}
      draggable
      onDragStart={(event) => beginDrag(event, file)}
      {...folderDrop(file)}
      sx={{
        ...itemEnterSx(index),
        userSelect: "none",
        py: density === "compact" ? 0.15 : 0.5,
        px: 1,
        mx: 0.75,
        minHeight: density === "compact" ? 36 : 44,
        borderRadius: 1.5,
        gap: 0.5,
        opacity: dimmedKeys?.has(file.key) ? 0.5 : 1,
        ...(isSelected(file) ? selectionGlowSx : {}),
        "&.Mui-selected": {
          backgroundColor: "action.selected",
        },
        "&.Mui-selected:hover": {
          backgroundColor: "action.selected",
        },
        ...(focusedKey === file.key
          ? {
              outline: "2px solid",
              outlineColor: "primary.main",
              outlineOffset: -1,
            }
          : {}),
      }}
    >
      {checkbox(file)}
      <Box
        sx={{
          width: density === "compact" ? 24 : 32,
          height: density === "compact" ? 24 : 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {thumbnail(file, density === "compact" ? 22 : 28)}
      </Box>
      <Typography
        noWrap
        title={file.name}
        sx={{
          flex: 1,
          minWidth: 0,
          fontWeight: 600,
          fontSize: "0.875rem",
          userSelect: "none",
          pointerEvents: "auto",
        }}
      >
        {highlightName(file.name, highlight)}
      </Typography>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          width: 88,
          flexShrink: 0,
          textAlign: "right",
          display: { xs: "none", sm: "block" },
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {isDirectory(file) ? folderMeta(file) : humanReadableSize(file.size)}
      </Typography>
      <Typography
        variant="caption"
        color="text.secondary"
        title={formatDateTime(file.uploaded)}
        sx={{
          width: 168,
          flexShrink: 0,
          textAlign: "right",
          display: { xs: "none", md: "block" },
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {formatRelativeDateTime(file.uploaded)}
      </Typography>
      {moreButton(file)}
    </ListItemButton>
  );

  const itemTile = (file: FileItem, index: number) => (
    <Box
      className="file-card"
      role="button"
      tabIndex={0}
      data-file-key={file.key}
      onPointerDown={markPointer}
      onClick={(event) => clickItem(file, event)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter") clickItem(file);
      }}
      onContextMenu={(event) => openMenu(event, file)}
      draggable
      onDragStart={(event) => beginDrag(event, file)}
      {...folderDrop(file)}
      sx={{
        ...itemEnterSx(index),
        position: "relative",
        isolation: "isolate",
        overflow: "visible",
        width: "100%",
        height: "100%",
        minHeight: density === "compact" ? 128 : 168,
        boxSizing: "border-box",
        padding: density === "compact" ? 1 : 1.5,
        paddingTop: "44px",
        paddingBottom: density === "compact" ? 6 : 10,
        cursor: "pointer",
        border: (theme) =>
          isSelected(file)
            ? `2px solid ${theme.palette.primary.main}`
            : `1px solid ${theme.palette.divider}`,
        borderRadius: 2,
        backgroundColor: isSelected(file)
          ? "action.selected"
          : "background.paper",
        opacity: dimmedKeys?.has(file.key) ? 0.5 : 1,
        ...(isSelected(file) ? selectionGlowSx : {}),
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 0.75,
        userSelect: "none",
        boxShadow: (theme) =>
          warmShadow(theme.palette.mode === "dark", "0 1px 2px", 0.04),
        transition: "background-color 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease, transform 0.15s ease",
        "&:hover": {
          backgroundColor: "action.selected",
          boxShadow: (theme) =>
            warmShadow(theme.palette.mode === "dark", "0 6px 16px", 0.08),
          borderColor: (theme) => `${theme.palette.primary.main}59`,
          "& .quick-actions-bar": {
            opacity: 1,
            pointerEvents: "auto",
          },
          "& .tile-thumb": {
            transform: "scale(1.06)",
          },
        },
        "@media (prefers-reduced-motion: reduce)": {
          "& .tile-thumb": { transition: "none" },
          "&:hover .tile-thumb": { transform: "none" },
        },
        "&:focus-within .quick-actions-bar": {
          opacity: 1,
          pointerEvents: "auto",
        },
        "@media (hover: none)": {
          "& .quick-actions-bar": {
            display: "none",
          },
        },
        "&:focus": {
          outline: "none",
        },
        "&:focus-visible": {
          outline: "2px solid",
          outlineColor: "primary.main",
          outlineOffset: 2,
        },
        ...(focusedKey === file.key
          ? {
              outline: "2px solid",
              outlineColor: "primary.main",
              outlineOffset: 2,
            }
          : {}),
      }}
    >
      {checkbox(file, { position: "absolute", top: 0, left: 0 })}
      <Box
        className="tile-thumb"
        sx={{
          width: density === "compact" ? 48 : 64,
          height: density === "compact" ? 48 : 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "transform 0.18s ease",
        }}
      >
        {thumbnail(file, density === "compact" ? 48 : 64)}
      </Box>
      <Typography
        variant="body2"
        sx={{
          fontWeight: 600,
          width: "100%",
          textAlign: "center",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          lineHeight: 1.35,
          height: "2.7em",
          minHeight: "2.7em",
          wordBreak: "break-word",
        }}
        title={file.name}
      >
        {highlightName(file.name, highlight)}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {isDirectory(file) ? folderMeta(file) : humanReadableSize(file.size)}
      </Typography>
      {density !== "compact" && (
      <Tooltip title={formatDateTime(file.uploaded)} enterDelay={400}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          fontSize: 11,
          width: "100%",
          textAlign: "center",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {formatRelativeDateTime(file.uploaded)}
      </Typography>
      </Tooltip>
      )}
      {moreButton(file, "tile")}
      {quickActions(file)}
    </Box>
  );

  if (files.length === 0) return <>{emptyMessage}</>;

  if (view === "list") {
    return (
      <Box sx={{ pb: { xs: "136px", sm: "72px" } }}>
        <Box
          sx={{
            display: { xs: "none", sm: "flex" },
            alignItems: "center",
            gap: 0.5,
            px: 2.25,
            py: 0.75,
            position: "sticky",
            top: 0,
            zIndex: Z_INDEX.listHeader,
            backgroundColor: "background.default",
            borderBottom: "1px solid",
            borderColor: "divider",
            color: "text.secondary",
          }}
        >
          <Box sx={{ width: 42 }} />
          <Box sx={{ width: 32 }} />
          <Typography variant="caption" sx={{ flex: 1, fontWeight: 700 }}>
            {strings.colName}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              width: 88,
              textAlign: "right",
              fontWeight: 700,
              display: { xs: "none", sm: "block" },
            }}
          >
            {strings.colSize}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              width: 168,
              textAlign: "right",
              fontWeight: 700,
              display: { xs: "none", md: "block" },
            }}
          >
            {strings.colDate}
          </Typography>
          <Box sx={{ width: 44 }} />
        </Box>
        <List disablePadding sx={{ pt: 0.5 }}>
          {files.map((file, index) => (
            <React.Fragment key={file.key}>{itemList(file, index)}</React.Fragment>
          ))}
        </List>
      </Box>
    );
  }

  return (
    <Grid
      container
      spacing={density === "compact" ? 1 : 2}
      sx={{ padding: density === "compact" ? 1 : 2, paddingBottom: { xs: "136px", sm: "72px" }, overflow: "visible" }}
    >
      {files.map((file, index) => (
        <Grid
          item
          key={file.key}
          xs={density === "compact" ? 4 : 6}
          sm={density === "compact" ? 3 : 4}
          md={density === "compact" ? 2 : 3}
          lg={2}
          sx={{ display: "flex", overflow: "visible" }}
        >
          {itemTile(file, index)}
        </Grid>
      ))}
    </Grid>
  );
}

function thumbnail(file: FileItem, size: number) {
  return file.thumbnail ? (
    <AuthThumbnail
      digest={file.thumbnail}
      name={file.name}
      contentType={file.contentType}
      size={size}
    />
  ) : (
    <MimeIcon contentType={file.contentType} name={file.name} />
  );
}

// 浅比较 props：Main 侧回调均为 useCallback、emptyMessage 已 useMemo，
// 对话框/菜单等无关状态更新时跳过整表重渲染。
export default React.memo(FileGrid);
