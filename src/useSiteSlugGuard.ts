import { useCallback, useState } from "react";

import { SitePublishKind, checkSiteSlug, siteSlugConflictMessage } from "./app/sites";

/**
 * 发布前的地址占用检查（#151）。
 * guard(slug) 返回 true 才继续发布：
 * - 地址未占用 / 同一来源的重新发布：直接 true；
 * - 有冲突：记下提示并返回 false，对话框显示警告、提交按钮变成「覆盖发布」；
 *   用户不改地址再点一次即视为确认覆盖（guard 对同一个 slug 返回 true）。
 * - 检查本身失败（网络等）：不拦发布，真正的发布请求会给出错误。
 * 地址输入变化时调用 reset() 清掉提示与确认。
 */
export function useSiteSlugGuard(kind: SitePublishKind, source: string | null) {
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

  return { conflict, guard, reset };
}
