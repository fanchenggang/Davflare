import { useCallback, useEffect, useRef, useState } from "react";

import { NotifyFn } from "./notify";
import { Route } from "./route";
import { fetchPath, searchFiles } from "./transfer";
import { useAuth } from "./auth";
import { FileItem } from "./types";
import { errorMessage } from "./utils";
import { strings } from "./strings";
import type { SearchScope } from "../PathBar";

// 目录列表 / 全盘搜索的加载模型：防抖后的关键词、静默刷新、
// 触底自动加载（IntersectionObserver + scroll 捕获兜底）都在这里收口。
export function useFolderListing(options: {
  route: Route;
  cwd: string;
  debouncedSearch: string;
  searchScope: SearchScope;
  onNotify: NotifyFn;
  /** 目录加载成功后回报条目数（用于父目录卡片计数缓存） */
  onListingLoaded: (path: string, count: number) => void;
  /** listingKey 变化导致数据刷新时清空选中 */
  onListingChanged: () => void;
}) {
  const { route, cwd, debouncedSearch, searchScope, onNotify } = options;
  const { username } = useAuth();

  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchCursor, setSearchCursor] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const loadedListingKey = useRef<string | null>(null);

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
        options.onListingLoaded(cwd.replace(/\/$/, ""), items.length);
        setSearchHasMore(false);
        setSearchCursor(undefined);
      }
      const listingChanged = loadedListingKey.current !== listingKey;
      loadedListingKey.current = listingKey;
      if (listingChanged) options.onListingChanged();
    } catch (error) {
      const alreadyLoaded = loadedListingKey.current === listingKey;
      loadedListingKey.current = listingKey;
      if (!alreadyLoaded) setFiles([]);
      onNotify(errorMessage(error), "error", {
        duration: 8000,
        action: { label: strings.retry, onClick: () => loadListing() },
      });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    cwd,
    debouncedSearch,
    isGlobalSearch,
    listingKey,
    onNotify,
    route.kind,
    username,
  ]);

  useEffect(() => {
    loadListing();
  }, [loadListing]);

  const loadMore = useCallback(async () => {
    if (!isGlobalSearch || !searchCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await searchFiles(debouncedSearch, searchCursor);
      setFiles((prev) => [...prev, ...result.items]);
      setSearchHasMore(result.hasMore);
      setSearchCursor(result.nextCursor);
    } catch (error) {
      onNotify(errorMessage(error), "error");
    } finally {
      setLoadingMore(false);
    }
  }, [debouncedSearch, isGlobalSearch, loadingMore, onNotify, searchCursor]);

  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);

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

  const listingPending =
    loading || (route.kind === "folder" && loadedListingKey.current !== listingKey);

  return {
    files,
    setFiles,
    listingKey,
    listingPending,
    isGlobalSearch,
    loadListing,
    loadMore,
    loadingMore,
    loadMoreSentinelRef,
    searchHasMore,
  };
}
