import React, { useState } from "react";
import {
  Box,
  Breadcrumbs,
  IconButton,
  Link,
  Menu,
  MenuItem,
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
} from "@mui/icons-material";

import { NotifyFn } from "./app/notify";
import { warmShadow } from "./app/theme";
import { strings, translate } from "./app/strings";
import { fetchPath } from "./app/transfer";
import { FileItem } from "./app/types";

export type SearchScope = "folder" | "global";

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
      onNotify(translate("pathCopied"), "success");
    } catch {
      onNotify(translate("copyFailed"), "error");
    }
  };

  return (
    <Box sx={{ px: 1.5, pb: 1.25, pt: 0.25 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <IconButton
          size="small"
          aria-label={strings.goUp}
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
          aria-label={strings.searchScope}
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
                boxShadow: (theme) =>
                  warmShadow(theme.palette.mode === "dark", "0 1px 2px", 0.08),
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

export default PathBar;
