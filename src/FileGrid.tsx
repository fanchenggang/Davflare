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
import { humanReadableSize, isDirectory } from "./app/utils";

interface FileGridProps {
  files: FileItem[];
  view: ViewMode;
  multiSelected: string[] | null;
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
  multiSelected,
  dimmedKeys,
  onToggleSelect,
  onNavigate,
  onOpen,
  onOpenMenu,
  onDropOnFolder,
  emptyMessage,
}: FileGridProps) {
  const longPressTimer = useRef<number | null>(null);

  const cancelLongPress = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const startLongPress = (
    event: React.TouchEvent,
    file: FileItem
  ) => {
    cancelLongPress();
    const touch = event.touches[0];
    longPressTimer.current = window.setTimeout(() => {
      onOpenMenu(
        { clientX: touch.clientX, clientY: touch.clientY },
        file
      );
      longPressTimer.current = null;
    }, 550);
  };

  const selectionControls = (file: FileItem) => {
    if (multiSelected === null) return null;
    return (
      <Checkbox
        size="small"
        checked={multiSelected.includes(file.key)}
        onClick={(event) => {
          event.stopPropagation();
          onToggleSelect(file.key);
        }}
      />
    );
  };

  const thumbnail = (file: FileItem) =>
    file.thumbnail ? (
      <img
        src={`/webdav/_$flaredrive$/thumbnails/${file.thumbnail}.png`}
        alt={file.name}
        style={{
          width: 36,
          height: 36,
          objectFit: "cover",
          borderRadius: 4,
        }}
      />
    ) : (
      <MimeIcon contentType={file.contentType} />
    );

  const clickItem = (file: FileItem) => {
    if (multiSelected !== null) {
      onToggleSelect(file.key);
    } else if (isDirectory(file)) {
      onNavigate(file.key);
    } else {
      onOpen(file.key);
    }
  };

  const itemList = (file: FileItem) => (
    <ListItemButton
      selected={multiSelected?.includes(file.key)}
      onClick={() => clickItem(file)}
      onContextMenu={(event) => {
        event.preventDefault();
        onOpenMenu(
          { clientX: event.clientX, clientY: event.clientY },
          file
        );
      }}
      onTouchStart={(event) => startLongPress(event, file)}
      onTouchEnd={cancelLongPress}
      onTouchMove={cancelLongPress}
      draggable={multiSelected === null}
      onDragStart={(event) => {
        event.dataTransfer.setData("application/x-flaredrive", file.key);
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={
        isDirectory(file) && onDropOnFolder
          ? (event) => {
              event.preventDefault();
              event.stopPropagation();
            }
          : undefined
      }
      onDrop={
        isDirectory(file) && onDropOnFolder
          ? (event) => {
              event.preventDefault();
              event.stopPropagation();
              onDropOnFolder?.(file, event.dataTransfer);
            }
          : undefined
      }
      sx={{
        userSelect: "none",
        opacity: dimmedKeys?.has(file.key) ? 0.5 : 1,
      }}
    >
      {selectionControls(file)}
      <ListItemIcon>{thumbnail(file)}</ListItemIcon>
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
              {new Date(file.uploaded).toLocaleString()}
            </Box>
            {!isDirectory(file) && humanReadableSize(file.size)}
          </React.Fragment>
        }
      />
      {multiSelected === null && (
        <IconButton
          size="small"
          aria-label={`${file.name} 操作`}
          onClick={(event) => {
            event.stopPropagation();
            onOpenMenu(
              { clientX: event.clientX, clientY: event.clientY },
              file
            );
          }}
        >
          <MoreHorizIcon />
        </IconButton>
      )}
    </ListItemButton>
  );

  const itemTile = (file: FileItem) => (
    <Box
      role="button"
      tabIndex={0}
      onClick={() => clickItem(file)}
      onKeyDown={(event) => {
        if (event.key === "Enter") clickItem(file);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onOpenMenu(
          { clientX: event.clientX, clientY: event.clientY },
          file
        );
      }}
      onTouchStart={(event) => startLongPress(event, file)}
      onTouchEnd={cancelLongPress}
      onTouchMove={cancelLongPress}
      draggable={multiSelected === null}
      onDragStart={(event) => {
        event.dataTransfer.setData("application/x-flaredrive", file.key);
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={
        isDirectory(file) && onDropOnFolder
          ? (event) => {
              event.preventDefault();
              event.stopPropagation();
            }
          : undefined
      }
      onDrop={
        isDirectory(file) && onDropOnFolder
          ? (event) => {
              event.preventDefault();
              event.stopPropagation();
              onDropOnFolder?.(file, event.dataTransfer);
            }
          : undefined
      }
      sx={{
        position: "relative",
        height: "100%",
        minHeight: 128,
        padding: 1,
        cursor: "pointer",
        border: (theme) =>
          multiSelected?.includes(file.key)
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
        "&:hover": { backgroundColor: "whitesmoke" },
      }}
    >
      {multiSelected !== null && (
        <Checkbox
          size="small"
          checked={multiSelected.includes(file.key)}
          onClick={(event) => {
            event.stopPropagation();
            onToggleSelect(file.key);
          }}
          sx={{ position: "absolute", top: 0, left: 0 }}
        />
      )}
      <Box
        sx={{
          width: 64,
          height: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {file.thumbnail ? (
          <img
            src={`/webdav/_$flaredrive$/thumbnails/${file.thumbnail}.png`}
            alt={file.name}
            style={{
              width: 64,
              height: 64,
              objectFit: "cover",
              borderRadius: 8,
            }}
          />
        ) : (
          <MimeIcon contentType={file.contentType} />
        )}
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
      {multiSelected === null && (
        <IconButton
          size="small"
          aria-label={`${file.name} 操作`}
          sx={{ position: "absolute", top: 0, right: 0 }}
          onClick={(event) => {
            event.stopPropagation();
            onOpenMenu(
              { clientX: event.clientX, clientY: event.clientY },
              file
            );
          }}
        >
          <MoreHorizIcon />
        </IconButton>
      )}
    </Box>
  );

  if (files.length === 0) return <>{emptyMessage}</>;

  if (view === "list") {
    return (
      <List sx={{ paddingBottom: "48px" }}>
        {files.map((file) => (
          <React.Fragment key={file.key}>{itemList(file)}</React.Fragment>
        ))}
      </List>
    );
  }

  return (
    <Grid container spacing={1.5} sx={{ paddingBottom: "48px", padding: 1 }}>
      {files.map((file) => (
        <Grid item key={file.key} xs={6} sm={4} md={3} lg={2}>
          {itemTile(file)}
        </Grid>
      ))}
    </Grid>
  );
}

export default FileGrid;
