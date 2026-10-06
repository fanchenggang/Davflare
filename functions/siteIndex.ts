/**
 * 站点根 index.html 的「回收站兜底」（#177）。
 *
 * 生成型站点（公开目录 / 相册 / 文档站 / 导航页）会写入、清理时会删除 sites/{slug}/index.html。
 * 这个路径也可能是用户自己的文件：手动上传的首页、发布计划进行中上传的首页、普通站复制进来的首页。
 * 清单和发布计划只能尽量区分（#169 / #172），仍有边角情况会把用户文件覆盖或删掉。
 *
 * 规则：本服务写入的首页带 customMetadata `davflareGenerated: "1"`。要覆盖或删除首页时，
 * 现有对象没有这个标记就先移进回收站（与网页删除同一套软删除），有标记照旧直接覆盖 / 删除。
 * 只处理首页这一个路径：其它生成文件是网盘文件的副本或可重新生成的页面，逐个软删除也会超出
 * 单次请求的子请求预算。旧版本生成、还没有标记的首页会在下一次重新发布时进一次回收站（无害）。
 */
import { isCollectionObject } from "./api/_apikey";
import { softDeleteKeys } from "./api/trash";

export const SITE_GENERATED_META_KEY = "davflareGenerated";
const GENERATED_META = { [SITE_GENERATED_META_KEY]: "1" } as const;

export function siteIndexKey(prefix: string): string {
  return `${prefix}index.html`;
}

export function isGeneratedSiteObject(object: Pick<R2Object, "customMetadata"> | null | undefined): boolean {
  return object?.customMetadata?.[SITE_GENERATED_META_KEY] === "1";
}

/**
 * 首页存在且不是本服务生成的：移进回收站。返回 "trashed" / "generated"（带标记，未动）/ "none"（不存在）。
 */
export async function trashUserSiteIndex(
  bucket: R2Bucket,
  prefix: string
): Promise<"trashed" | "generated" | "none"> {
  const key = siteIndexKey(prefix);
  const head = await bucket.head(key);
  if (!head || isCollectionObject(head)) return "none";
  if (isGeneratedSiteObject(head)) return "generated";
  await softDeleteKeys(bucket, [key]);
  return "trashed";
}

/** 写入生成的首页：先把用户的首页移进回收站，再带标记写入 */
export async function putGeneratedSiteIndex(
  bucket: R2Bucket,
  prefix: string,
  html: string
): Promise<void> {
  await trashUserSiteIndex(bucket, prefix);
  await bucket.put(siteIndexKey(prefix), html, {
    httpMetadata: { contentType: "text/html; charset=utf-8" },
    customMetadata: { ...GENERATED_META },
  });
}

/** 按清单删除一批站点文件：首页走回收站兜底，其余直接删 */
export async function deleteSiteKeys(bucket: R2Bucket, prefix: string, keys: string[]): Promise<void> {
  const indexKey = siteIndexKey(prefix);
  const rest = keys.filter((key) => key !== indexKey);
  if (rest.length !== keys.length) {
    // 生成的首页：trashUserSiteIndex 不动它，这里删；用户的首页已经进了回收站
    if ((await trashUserSiteIndex(bucket, prefix)) === "generated") rest.push(indexKey);
  }
  for (let start = 0; start < rest.length; start += 1000) {
    const chunk = rest.slice(start, start + 1000);
    if (chunk.length) await bucket.delete(chunk);
  }
}
