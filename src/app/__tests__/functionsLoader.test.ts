/**
 * functions 覆盖率收集专用套件。
 *
 * 显式把 functions/ 下全部模块 import 一遍（只触发模块初始化，不执行
 * handler）：v8 覆盖率对「从未被加载的模块」只能给 0% 占位报告，
 * 这样能保证「后端 functions 直测」始终从真实基线开始棘轮。
 */

import * as shareRoute from "../../../functions/share/[[token]]";
import * as webdavRoute from "../../../functions/webdav/[[path]]";
import * as mcpRoute from "../../../functions/mcp";

// 通用 helper / 常量模块
import "../../../functions/_flags";
import "../../../functions/_images";
import "../../../functions/_mcp";
import "../../../functions/_middleware";
import "../../../functions/_sites";
import "../../../functions/api/_apikey";
import "../../../functions/api/_zip";
import "../../../functions/webdav/protocol";

// Pages Functions 入口（api/*）
import "../../../functions/api/archive";
import "../../../functions/api/backup";
import "../../../functions/api/config";
import "../../../functions/api/copy";
import "../../../functions/api/counts";
import "../../../functions/api/delete";
import "../../../functions/api/download";
import "../../../functions/api/images";
import "../../../functions/api/keys";
import "../../../functions/api/list";
import "../../../functions/api/mkdir";
import "../../../functions/api/rename";
import "../../../functions/api/search";
import "../../../functions/api/shares";
import "../../../functions/api/sites";
import "../../../functions/api/stat";
import "../../../functions/api/trash";
import "../../../functions/api/upload";

function isHandler(value: unknown): boolean {
  return typeof value === "function";
}

describe("functions modules load", () => {
  test("route entrypoints export PagesFunction handlers", () => {
    const handlers = [
      [mcpRoute, "mcp.ts"],
      [shareRoute, "share/[[token]].ts"],
      [webdavRoute, "webdav/[[path]].ts"],
    ] as Array<[Record<string, unknown>, string]>;

    for (const [mod, name] of handlers) {
      const hasHandler = Object.keys(mod).some(
        (key) => key.startsWith("onRequest") && isHandler(mod[key])
      );
      expect({ name, hasHandler }).toEqual({ name, hasHandler: true });
    }
  });

  test("webdav protocol re-exports a single onRequest entry", () => {
    // functions/webdav/[[path]].ts 转发到 ./protocol
    expect(typeof (webdavRoute as unknown as Record<string, unknown>).onRequest).toBe(
      "function"
    );
  });
});
