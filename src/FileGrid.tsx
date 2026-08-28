import React, { useRef } from "react";
import {
  Box,
  Checkbox,
  Grid,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from "@mui/material";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";

import MimeIcon from "./MimeIcon";
import { ViewMode } from "./app/prefs";
import { FileItem } from "./app/types";
import {
  formatDateTime,
  humanReadableSize,
  isDirectory,
} from "./app/utils";

interface FileGridProps {
  files: FileItem[];
  view: ViewMode;
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

function FileGrid({
  files,
  view,
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
    const openMenu = (event: React.MouseEvent) => {
      event.stopPropagation();
      onOpenMenu({ clientX: event.clientX, clientY: event.clientY }, file);
    };

    // One 44×44 box is both the visible ⋯ and the hit rect (no inner
    // padding/offset that used to sit the glyph left/up of the click).
    const button = (
      <IconButton
        size="small"
        aria-label={`${file.name} 操作`}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={openMenu}
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
          backgroundColor: "rgba(255,255,255,0.86)",
          borderRadius: 1,
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={openMenu}
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
      onContextMenu={(event) => openMenu(event, file)}
      draggable
      onDragStart={(event) => beginDrag(event, file)}
      {...folderDrop(file)}
      sx={{
        userSelect: "none",
        opacity: dimmedKeys?.has(file.key) ? 0.5 : 1,
      }}
    >
      {checkbox(file)}
      <ListItemIcon>{thumbnail(file, 36)}</ListItemIcon>
      <ListItemText
        primary={file.name}
        primaryTypographyProps={{
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
        secondary={
          <React.Fragment>
            <Box
              component="span"
              sx={{ display: "inline-block", minWidth: "160px", marginRight: 1 }}
            >
              {formatDateTime(file.uploaded)}
            </Box>
            {!isDirectory(file) && humanReadableSize(file.size)}
          </React.Fragment>
        }
      />
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
        minHeight: 128,
        boxSizing: "border-box",
        padding: 1,
        paddingTop: '44px',
        cursor: "pointer",
        border: (theme) =>
          isSelected(file)
            ? `2px solid ${theme.palette.primary.main}`
            : "1px solid transparent",
        borderRadius: 2,
        backgroundColor: (theme) => theme.palette.background.paper,
        opacity: dimmedKeys?.has(file.key) ? 0.5 : 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 0.5,
        userSelect: "none",
        transition: "background-color 0.2s ease, box-shadow 0.2s ease",
        "&:hover": { backgroundColor: "whitesmoke", boxShadow: 1 },
      }}
    >
      {checkbox(file, { position: "absolute", top: 0, left: 0 })}
      <Box
        sx={{
          width: 64,
          height: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {thumbnail(file, 64)}
      </Box>
      <Typography
        variant="body2"
        sx={{
          width: "100%",
          textAlign: "center",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {file.name}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {isDirectory(file) ? "文件夹" : humanReadableSize(file.size)}
      </Typography>
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
      {moreButton(file, "tile")}
    </Box>
  );

  if (files.length === 0) return <>{emptyMessage}</>;

  if (view === "list") {
    return (
      <List sx={{ paddingBottom: "72px" }}>
        {files.map((file) => (
          <React.Fragment key={file.key}>{itemList(file)}</React.Fragment>
        ))}
      </List>
    );
  }

  return (
    <Grid
      container
      spacing={1.5}
      sx={{ padding: 1, paddingBottom: "72px", overflow: "visible" }}
    >
      {files.map((file) => (
        <Grid
          item
          key={file.key}
          xs={6}
          sm={4}
          md={3}
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
    <MimeIcon contentType={file.contentType} />
  );
}

export default FileGrid;
