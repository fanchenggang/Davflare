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
  Storage as WebDavIcon,
  ViewList as ViewListIcon,
} from "@mui/icons-material";

import { FileTypeFilter, SortField, SortPref, ViewMode } from "./app/prefs";
import { strings } from "./app/strings";

export type ExplorerSection = "folder" | "shares" | "trash";

const TYPE_FILTERS: Array<{ value: FileTypeFilter; label: string }> = [
  { value: "all", label: strings.typeAll },
  { value: "image", label: strings.typeImage },
  { value: "video", label: strings.typeVideo },
  { value: "doc", label: strings.typeDoc },
  { value: "other", label: strings.typeOther },
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
  typeFilter,
  onTypeFilterChange,
  showHidden,
  onShowHiddenChange,
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
  typeFilter: FileTypeFilter;
  onTypeFilterChange: (filter: FileTypeFilter) => void;
  showHidden: boolean;
  onShowHiddenChange: (show: boolean) => void;
}) {
  const [uploadAnchor, setUploadAnchor] = useState<null | HTMLElement>(null);
  const [sortAnchor, setSortAnchor] = useState<null | HTMLElement>(null);

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
          aria-label="页面切换"
          sx={{
            backgroundColor: "#f4f1ec",
            "& .MuiToggleButton-root": {
              border: "none",
              px: 1.5,
              "&.Mui-selected": {
                backgroundColor: "#fff",
                color: "primary.main",
                boxShadow: "0 1px 2px rgba(26, 23, 20, 0.08)",
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
          <ToggleButton value="trash" aria-label={strings.trash}>
            {strings.trash}
          </ToggleButton>
        </ToggleButtonGroup>

        <Button
          size="small"
          variant="text"
          startIcon={<WebDavIcon />}
          onClick={onOpenWebDav}
          sx={{ color: "text.secondary" }}
        >
          {strings.webdav}
        </Button>

        {inFolder && (
          <Box
            sx={{
              display: "flex",
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
                aria-label="更多上传方式"
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
                {clipboardCount > 0 ? ` ${clipboardCount} 项` : ""}
              </Button>
            )}
            {clipboardMode && clipboardCount > 0 && !canPaste && (
              <Typography variant="caption" color="text.secondary">
                已{clipboardMode === "cut" ? "剪切" : "复制"} {clipboardCount} 项
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
            <Tooltip title={view === "grid" ? "切换到列表视图" : "切换到网格视图"}>
              <IconButton
                size="small"
                aria-label="切换视图"
                onClick={() => onViewChange(view === "grid" ? "list" : "grid")}
              >
                {view === "grid" ? <ViewListIcon /> : <GridViewIcon />}
              </IconButton>
            </Tooltip>
            <Tooltip title="排序">
              <IconButton
                size="small"
                aria-label="排序"
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
                按名称排序（
                {sort.field === "name" ? (sort.order === "asc" ? "↑" : "↓") : ""}）
              </MenuItem>
              <MenuItem onClick={() => changeSort("size")}>
                按大小排序（
                {sort.field === "size" ? (sort.order === "asc" ? "↑" : "↓") : ""}）
              </MenuItem>
              <MenuItem onClick={() => changeSort("date")}>
                按日期排序（
                {sort.field === "date" ? (sort.order === "asc" ? "↑" : "↓") : ""}）
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
                升序/降序切换
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
              label={item.label}
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
