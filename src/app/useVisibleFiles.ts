import { useMemo } from "react";
import { SearchScope } from "../PathBar";
import { FileTypeFilter, SortPref } from "./prefs";
import { translate, useLang } from "./strings";
import { FileItem } from "./types";
import {
  fileTypeCategory,
  formatListingSize,
  isDirectory,
  isJunkFileName,
} from "./utils";

/** 列表排序：目录优先，其余按字段/方向（size/date/name） */
export function sortFileItems(files: FileItem[], sort: SortPref): FileItem[] {
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
}

/** 视图过滤：隐藏垃圾文件、类型筛选、文件夹内搜索 */
export function filterVisibleFiles(options: {
  sortedFiles: FileItem[];
  showHidden: boolean;
  typeFilter: FileTypeFilter;
  debouncedSearch: string;
  searchScope: SearchScope;
}): FileItem[] {
  let items = options.sortedFiles;
  if (!options.showHidden) {
    items = items.filter((file) => !isJunkFileName(file.name));
  }
  if (options.typeFilter !== "all") {
    items = items.filter((file) => {
      if (file.isDir) return true;
      return fileTypeCategory(file) === options.typeFilter;
    });
  }
  if (options.debouncedSearch && options.searchScope === "folder") {
    const q = options.debouncedSearch.toLowerCase();
    items = items.filter(
      (file) =>
        file.name.toLowerCase().includes(q) ||
        file.key.toLowerCase().includes(q)
    );
  }
  return items;
}

export function useVisibleFiles(options: {
  files: FileItem[];
  sort: SortPref;
  showHidden: boolean;
  typeFilter: FileTypeFilter;
  debouncedSearch: string;
  searchScope: SearchScope;
}) {
  const { files, sort, showHidden, typeFilter, debouncedSearch, searchScope } =
    options;

  const sortedFiles = useMemo(
    () => sortFileItems(files, sort),
    [files, sort]
  );

  const visibleFiles = useMemo(
    () =>
      filterVisibleFiles({
        sortedFiles,
        showHidden,
        typeFilter,
        debouncedSearch,
        searchScope,
      }),
    [debouncedSearch, searchScope, showHidden, sortedFiles, typeFilter]
  );

  return { sortedFiles, visibleFiles };
}

/** 列表统计文案：N 个文件夹、M 个文件、总大小 */
export function listingStatsText(visibleFiles: FileItem[]): string {
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
}

export function useListingStats(visibleFiles: FileItem[]): string {
  const lang = useLang();
  return useMemo(
    () => listingStatsText(visibleFiles),
    // lang 入参让语言切换时重算翻译结果（useMemo 否则缓存旧语言文案）
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleFiles, lang]
  );
}
