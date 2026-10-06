import { useCallback, useEffect, useState } from "react";

import { SitePublishKind, checkSiteSlug, isValidSiteSlug, siteSlugConflictMessage } from "./app/sites";

/** 地址输入停下多久后自动查一次占用（#152）。 */
export const SITE_SLUG_CHECK_DEBOUNCE_MS = 500;

/**
 * 发布前的地址占用检查（#151）。
 * guard(slug) 返回 true 才继续发布：
 * - 地址未占用 / 同一来源的重新发布：直接 true；
 * - 有冲突：记下提示并返回 false，对话框显示警告、提交按钮变成「覆盖发布」；
 *   用户不改地址再点一次即视为确认覆盖（guard 对同一个 slug 返回 true）。
 * - 检查本身失败（网络等）：不拦发布，真正的发布请求会给出错误。
 * 地址输入变化时调用 reset() 清掉提示与确认。
 *
 * watch：传入当前输入的地址后，输入停下 500ms 自动查一次（#152），不用等点「发布」才看到警告；
 * 提交时的检查照旧保留。自动检查发现冲突时同样显示警告、按钮变成「覆盖发布」，
 * 用户看到警告后点「覆盖发布」即确认。过期的结果（地址已经又改了）直接丢弃。
 */
export function useSiteSlugGuard(
  kind: SitePublishKind,
  source: string | null,
  watch?: { slug: string; enabled: boolean }
) {
  const [conflict, setConflict] = useState<{ slug: string; message: string } | null>(null);

  const reset = useCallback(() => setConflict(null), []);

  const guard = useCallback(
    async (slug: string): Promise<boolean> => {
      if (conflict && conflict.slug === slug) return true;
      let message: string | null = null;
      try {
        message = siteSlugConflictMessage(await checkSiteSlug(slug), kind, source);
      } catch {
        return true;
      }
      if (!message) return true;
      setConflict({ slug, message });
      return false;
    },
    [conflict, kind, source]
  );

  const watched = watch?.enabled ? watch.slug.trim().toLowerCase() : "";
  useEffect(() => {
    if (!watched || !isValidSiteSlug(watched)) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      checkSiteSlug(watched)
        .then((check) => {
          if (cancelled) return;
          const message = siteSlugConflictMessage(check, kind, source);
          if (message) setConflict((current) => (current?.slug === watched ? current : { slug: watched, message }));
        })
        .catch(() => undefined);
    }, SITE_SLUG_CHECK_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [watched, kind, source]);

  return { conflict, guard, reset };
}
