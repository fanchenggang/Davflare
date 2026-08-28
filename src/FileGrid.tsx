import React, { useRef } from "react";
import {
  Box,
  Checkbox,
  Grid,
  IconButton,
  List,
  ListItemButton,
  Skeleton,
  Typography,
} from "@mui/material";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";

import MimeIcon from "./MimeIcon";
import { Density, ViewMode } from "./app/prefs";
import { strings } from "./app/strings";
import { FileItem } from "./app/types";
import {
  formatDateTime,
  humanReadableSize,
  isDirectory,
} from "./app/utils";

interface FileGridProps {
  files: FileItem[];
  view: ViewMode;
  density?: Density;
  selectedKeys: string[];
  dimmedKeys?: ReadonlySet<string>;
  onToggleSelect: (key: string) => void;
  onNavigate: (key: string) => void;
  onOpen: (key: string) => void;
  onOpenMenu: (
    position: { clientX: number; clientY: number },
    file: FileItem
  ) => void;
  onDropOnFolder?: (folder: FileItem, dataTransfer: DataTransfer) => void;
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
  selectedKeys,
  dimmedKeys,
  onToggleSelect,
  onNavigate,
  onOpen,
  onOpenMenu,
  onDropOnFolder,
  emptyMessage,
}: FileGridProps) {
  const isSelected = (file: FileItem) => selectedKeys.includes(file.key);

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
    event.dataTransfer.setData("application/x-flaredrive", file.key);
    event.dataTransfer.effectAllowed = "move";
  };

  const clickItem = (file: FileItem) => {
    if (pointer.current.dragging) return;
    if (isDirectory(file)) onNavigate(file.key);
    else onOpen(file.key);
  };

  const checkbox = (file: FileItem, sx?: object) => (
    <Checkbox
      size="small"
      checked={isSelected(file)}
      inputProps={{ "aria-label": `选择 ${file.name}` }}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onToggleSelect(file.key);
      }}
      sx={sx}
    />
  );

  const moreButton = (file: FileItem, corner?: "tile") => {
    const handle = (event: React.MouseEvent) => {
      event.stopPropagation();
      onOpenMenu({ clientX: event.clientX, clientY: event.clientY }, file);
    };

    const button = (
      <IconButton
        size="small"
        aria-label={`${file.name} 操作`}
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
        <Box sx={{ width: 44, height: 44, flexShrink: 0 }}>{button}</Box>
      );
    }

    return (
      <Box
        sx={{
          position: "absolute",
          top: 0,
          right: 0,
          zIndex: 3,
          width: 44,
          height: 44,
          boxSizing: "border-box",
          pointerEvents: "auto",
          backgroundColor: "rgba(255,255,255,0.92)",
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

  const itemList = (file: FileItem) => (
    <ListItemButton
      selected={isSelected(file)}
      onPointerDown={markPointer}
      onClick={() => clickItem(file)}
      onKeyDown={(event) => {
        if (event.key === "Enter") clickItem(file);
      }}
      onContextMenu={(event) => openMenu(event, file)}
      draggable
      onDragStart={(event) => beginDrag(event, file)}
      {...folderDrop(file)}
      sx={{
        userSelect: "none",
        py: density === "compact" ? 0.15 : 0.5,
        px: 1,
        mx: 0.75,
        minHeight: density === "compact" ? 36 : 44,
        borderRadius: 1.5,
        gap: 0.5,
        opacity: dimmedKeys?.has(file.key) ? 0.5 : 1,
        "&.Mui-selected": {
          backgroundColor: "action.selected",
        },
        "&.Mui-selected:hover": {
          backgroundColor: "action.selected",
        },
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
        }}
      >
        {file.name}
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
        {isDirectory(file) ? "—" : humanReadableSize(file.size)}
      </Typography>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          width: 168,
          flexShrink: 0,
          textAlign: "right",
          display: { xs: "none", md: "block" },
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {formatDateTime(file.uploaded)}
      </Typography>
      {moreButton(file)}
    </ListItemButton>
  );

  const itemTile = (file: FileItem) => (
    <Box
      role="button"
      tabIndex={0}
      onPointerDown={markPointer}
      onClick={() => clickItem(file)}
      onKeyDown={(event) => {
        if (event.key === "Enter") clickItem(file);
      }}
      onContextMenu={(event) => openMenu(event, file)}
      draggable
      onDragStart={(event) => beginDrag(event, file)}
      {...folderDrop(file)}
      sx={{
        position: "relative",
        isolation: "isolate",
        overflow: "visible",
        width: "100%",
        height: "100%",
        minHeight: density === "compact" ? 128 : 168,
        boxSizing: "border-box",
        padding: density === "compact" ? 1 : 1.5,
        paddingTop: "44px",
        cursor: "pointer",
        border: (theme) =>
          isSelected(file)
            ? `2px solid ${theme.palette.primary.main}`
            : "1px solid rgba(28, 22, 16, 0.08)",
        borderRadius: 2,
        backgroundColor: isSelected(file)
          ? "rgba(243, 128, 32, 0.08)"
          : "background.paper",
        opacity: dimmedKeys?.has(file.key) ? 0.5 : 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 0.75,
        userSelect: "none",
        boxShadow: "0 1px 2px rgba(26, 23, 20, 0.04)",
        transition: "background-color 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease",
        "&:hover": {
          backgroundColor: isSelected(file)
            ? "rgba(243, 128, 32, 0.12)"
            : "#faf8f5",
          boxShadow: "0 6px 16px rgba(26, 23, 20, 0.08)",
          borderColor: "rgba(243, 128, 32, 0.35)",
        },
        "&:focus": {
          outline: "none",
        },
        "&:focus-visible": {
          outline: "2px solid",
          outlineColor: "primary.main",
          outlineOffset: 2,
        },
      }}
    >
      {checkbox(file, { position: "absolute", top: 0, left: 0 })}
      <Box
        sx={{
          width: density === "compact" ? 48 : 64,
          height: density === "compact" ? 48 : 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
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
        {file.name}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {isDirectory(file) ? strings.folderLabel : humanReadableSize(file.size)}
      </Typography>
      {density !== "compact" && (
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
        {formatDateTime(file.uploaded)}
      </Typography>
      )}
      {moreButton(file, "tile")}
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
            zIndex: 1,
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
          {files.map((file) => (
            <React.Fragment key={file.key}>{itemList(file)}</React.Fragment>
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
      {files.map((file) => (
        <Grid
          item
          key={file.key}
          xs={density === "compact" ? 4 : 6}
          sm={density === "compact" ? 3 : 4}
          md={density === "compact" ? 2 : 3}
          lg={2}
          sx={{ display: "flex", overflow: "visible" }}
        >
          {itemTile(file)}
        </Grid>
      ))}
    </Grid>
  );
}

function thumbnail(file: FileItem, size: number) {
  return file.thumbnail ? (
    <img
      src={`/webdav/_$flaredrive$/thumbnails/${file.thumbnail}.png`}
      alt={file.name}
      style={{
        width: size,
        height: size,
        objectFit: "cover",
        borderRadius: size >= 48 ? 8 : 4,
      }}
    />
  ) : (
    <MimeIcon contentType={file.contentType} name={file.name} />
  );
}

export default FileGrid;
