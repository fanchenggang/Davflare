import React, { useState } from "react";
import {
  Box,
  Button,
  ButtonGroup,
  Chip,
  FormControlLabel,
  IconButton,
  Menu,
  MenuItem,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  ArrowDropDown as ArrowDropDownIcon,
  CloudUpload as CloudUploadIcon,
  ContentPaste as PasteIcon,
  CreateNewFolder as CreateNewFolderIcon,
  GridView as GridViewIcon,
  NoteAdd as NoteAddIcon,
  Sort as SortIcon,
  DensityMedium as DensityMediumIcon,
  DensitySmall as DensitySmallIcon,
  History as HistoryIcon,
  Storage as WebDavIcon,
  VpnKey as ApiIcon,
  ViewList as ViewListIcon,
} from "@mui/icons-material";

import { Density, FileTypeFilter, SortField, SortPref, ViewMode } from "./app/prefs";
import { RecentEntry } from "./app/recent";
import { strings, translate } from "./app/strings";
import { warmShadow } from "./app/theme";

export type ExplorerSection = "folder" | "shares" | "trash" | "sites";

// labelKey 延迟到渲染时取 strings，避免模块级快照导致语言切换后标签不变。
const TYPE_FILTERS: Array<{ value: FileTypeFilter; labelKey: string }> = [
  { value: "all", labelKey: "typeAll" },
  { value: "image", labelKey: "typeImage" },
  { value: "video", labelKey: "typeVideo" },
  { value: "doc", labelKey: "typeDoc" },
  { value: "other", labelKey: "typeOther" },
];

function ExplorerBar({
  section,
  onSectionChange,
  onUploadFile,
  onUploadFolder,
  onCreateFolder,
  onOpenTextPad,
  onPaste,
  canPaste,
  clipboardCount,
  clipboardMode,
  view,
  onViewChange,
  sort,
  onSortChange,
  onOpenWebDav,
  onOpenApi,
  typeFilter,
  onTypeFilterChange,
  showHidden,
  onShowHiddenChange,
  density,
  onDensityChange,
  recents,
  onOpenRecent,
}: {
  section: ExplorerSection;
  onSectionChange: (section: ExplorerSection) => void;
  onUploadFile: () => void;
  onUploadFolder: () => void;
  onCreateFolder: () => void;
  onOpenTextPad: () => void;
  onPaste: () => void;
  canPaste: boolean;
  clipboardCount: number;
  clipboardMode: "copy" | "cut" | null;
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  sort: SortPref;
  onSortChange: (sort: SortPref) => void;
  onOpenWebDav: () => void;
  onOpenApi: () => void;
  typeFilter: FileTypeFilter;
  onTypeFilterChange: (filter: FileTypeFilter) => void;
  showHidden: boolean;
  onShowHiddenChange: (show: boolean) => void;
  density: Density;
  onDensityChange: (density: Density) => void;
  recents: RecentEntry[];
  onOpenRecent: (entry: RecentEntry) => void;
}) {
  const [uploadAnchor, setUploadAnchor] = useState<null | HTMLElement>(null);
  const [sortAnchor, setSortAnchor] = useState<null | HTMLElement>(null);
  const [recentAnchor, setRecentAnchor] = useState<null | HTMLElement>(null);

  const changeSort = (field: SortField) => {
    onSortChange({
      field,
      order: sort.field === field && sort.order === "asc" ? "desc" : "asc",
    });
    setSortAnchor(null);
  };

  const inFolder = section === "folder";

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 1,
        px: 1.5,
        py: 1,
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 1,
        }}
      >
        <ToggleButtonGroup
          exclusive
          size="small"
          value={section}
          onChange={(_, value: ExplorerSection | null) => {
            if (value) onSectionChange(value);
          }}
          aria-label={strings.pageSwitch}
          sx={{
            backgroundColor: "background.default",
            "& .MuiToggleButton-root": {
              border: "none",
              px: 1.5,
              "&.Mui-selected": {
                backgroundColor: "background.paper",
                color: "primary.main",
                boxShadow: (theme) =>
                  warmShadow(theme.palette.mode === "dark", "0 1px 2px", 0.08),
              },
            },
          }}
        >
          <ToggleButton value="folder" aria-label={strings.files}>
            {strings.files}
          </ToggleButton>
          <ToggleButton value="shares" aria-label={strings.shares}>
            {strings.shares}
          </ToggleButton>
          <ToggleButton value="sites" aria-label={strings.sitesSection}>
            {strings.sitesSection}
          </ToggleButton>
          <ToggleButton value="trash" aria-label={strings.trash}>
            {strings.trash}
          </ToggleButton>
        </ToggleButtonGroup>

        <Button
          size="small"
          variant="text"
          startIcon={<HistoryIcon />}
          onClick={(event) => setRecentAnchor(event.currentTarget)}
          sx={{ color: "text.secondary" }}
        >
          {strings.recent}
        </Button>
        <Menu
          anchorEl={recentAnchor}
          open={Boolean(recentAnchor)}
          onClose={() => setRecentAnchor(null)}
          PaperProps={{ sx: { minWidth: 240, maxWidth: 360 } }}
        >
          {recents.length === 0 ? (
            <MenuItem disabled>{strings.noRecent}</MenuItem>
          ) : (
            recents.map((entry) => (
              <MenuItem
                key={entry.key}
                onClick={() => {
                  setRecentAnchor(null);
                  onOpenRecent(entry);
                }}
              >
                <Typography noWrap title={entry.key} sx={{ maxWidth: 320 }}>
                  {entry.name}
                  {entry.isDir ? " /" : ""}
                </Typography>
              </MenuItem>
            ))
          )}
        </Menu>
        <Button
          size="small"
          variant="text"
          startIcon={<WebDavIcon />}
          onClick={onOpenWebDav}
          sx={{ color: "text.secondary" }}
        >
          {strings.webdav}
        </Button>
        <Button
          size="small"
          variant="text"
          startIcon={<ApiIcon />}
          onClick={onOpenApi}
          sx={{ color: "text.secondary" }}
        >
          {strings.api}
        </Button>

        {inFolder && (
          <Box
            sx={{
              display: { xs: "none", sm: "flex" },
              alignItems: "center",
              gap: 0.75,
              flexGrow: 1,
              minWidth: 0,
              overflowX: "auto",
            }}
          >
            <ButtonGroup variant="contained" size="small">
              <Button
                startIcon={<CloudUploadIcon />}
                onClick={onUploadFile}
                aria-label={strings.uploadFile}
              >
                {strings.upload}
              </Button>
              <Button
                size="small"
                aria-label={strings.moreUploadWays}
                onClick={(event) => setUploadAnchor(event.currentTarget)}
                sx={{ minWidth: 32, paddingX: 0.5 }}
              >
                <ArrowDropDownIcon />
              </Button>
            </ButtonGroup>
            <Menu
              anchorEl={uploadAnchor}
              open={Boolean(uploadAnchor)}
              onClose={() => setUploadAnchor(null)}
            >
              <MenuItem
                onClick={() => {
                  setUploadAnchor(null);
                  onUploadFile();
                }}
              >
                {strings.uploadFile}
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setUploadAnchor(null);
                  onUploadFolder();
                }}
              >
                {strings.uploadFolder}
              </MenuItem>
            </Menu>

            <Button
              size="small"
              startIcon={<CreateNewFolderIcon />}
              onClick={onCreateFolder}
            >
              {strings.createFolder}
            </Button>
            <Button
              size="small"
              startIcon={<NoteAddIcon />}
              onClick={onOpenTextPad}
            >
              {strings.openTextPad}
            </Button>
            {canPaste && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<PasteIcon />}
                onClick={onPaste}
              >
                {strings.paste}
                {clipboardCount > 0
                  ? translate("itemsSuffix", { count: clipboardCount })
                  : ""}
              </Button>
            )}
            {clipboardMode && clipboardCount > 0 && !canPaste && (
              <Typography variant="caption" color="text.secondary">
                {translate("pastedItems", {
                  mode: clipboardMode === "cut" ? translate("pastedCut") : translate("pastedCopy"),
                  count: clipboardCount,
                })}
              </Typography>
            )}
          </Box>
        )}

        {inFolder && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              marginLeft: "auto",
              gap: 0.5,
            }}
          >
            <Tooltip title={view === "grid" ? strings.switchToList : strings.switchToGrid}>
              <IconButton
                size="small"
                aria-label={strings.switchView}
                onClick={() => onViewChange(view === "grid" ? "list" : "grid")}
              >
                {view === "grid" ? <ViewListIcon /> : <GridViewIcon />}
              </IconButton>
            </Tooltip>
            <Tooltip
              title={
                density === "compact"
                  ? strings.densityStandard
                  : strings.densityCompact
              }
            >
              <IconButton
                size="small"
                aria-label={strings.density}
                onClick={() =>
                  onDensityChange(density === "compact" ? "standard" : "compact")
                }
              >
                {density === "compact" ? (
                  <DensityMediumIcon />
                ) : (
                  <DensitySmallIcon />
                )}
              </IconButton>
            </Tooltip>
            <Tooltip title={strings.sort}>
              <IconButton
                size="small"
                aria-label={strings.sort}
                color={sortAnchor ? "primary" : "default"}
                onClick={(event) => setSortAnchor(event.currentTarget)}
              >
                <SortIcon />
              </IconButton>
            </Tooltip>
            <Menu
              anchorEl={sortAnchor}
              open={Boolean(sortAnchor)}
              onClose={() => setSortAnchor(null)}
            >
              <MenuItem onClick={() => changeSort("name")}>
                {translate("sortByName")}
                （{sort.field === "name" ? (sort.order === "asc" ? "↑" : "↓") : ""}）
              </MenuItem>
              <MenuItem onClick={() => changeSort("size")}>
                {translate("sortBySize")}
                （{sort.field === "size" ? (sort.order === "asc" ? "↑" : "↓") : ""}）
              </MenuItem>
              <MenuItem onClick={() => changeSort("date")}>
                {translate("sortByDate")}
                （{sort.field === "date" ? (sort.order === "asc" ? "↑" : "↓") : ""}）
              </MenuItem>
              <MenuItem
                onClick={() => {
                  onSortChange({
                    ...sort,
                    order: sort.order === "asc" ? "desc" : "asc",
                  });
                  setSortAnchor(null);
                }}
              >
                {strings.toggleAscDesc}
              </MenuItem>
            </Menu>
          </Box>
        )}
      </Box>

      {inFolder && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            flexWrap: "wrap",
          }}
        >
          {TYPE_FILTERS.map((item) => {
            const active = typeFilter === item.value;
            const filtering = typeFilter !== "all";
            return (
            <Chip
              key={item.value}
              size="small"
              label={strings[item.labelKey]}
              clickable
              color={active ? "primary" : "default"}
              variant={active ? "filled" : "outlined"}
              onClick={() => onTypeFilterChange(item.value)}
              sx={{
                borderRadius: "999px",
                height: 28,
                fontWeight: 700,
                boxShadow:
                  active && filtering
                    ? "0 0 0 2px rgba(243, 128, 32, 0.45)"
                    : "none",
                "& .MuiChip-label": { px: 1.25 },
              }}
            />
            );
          })}
          <FormControlLabel
            sx={{ marginLeft: 0.5, marginRight: 0, whiteSpace: "nowrap" }}
            control={
              <Switch
                size="small"
                checked={showHidden}
                onChange={(event) => onShowHiddenChange(event.target.checked)}
                inputProps={{ "aria-label": strings.showHidden }}
              />
            }
            label={
              <Typography variant="caption">{strings.showHidden}</Typography>
            }
          />
        </Box>
      )}
    </Box>
  );
}

export default ExplorerBar;
