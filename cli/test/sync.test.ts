import { describe, expect, it } from "vitest";

import { conflictBackupKeys, planSync } from "../src/sync.js";

const local = [
  { path: "a.txt", size: 1, mtimeMs: 100 },
  { path: "changed.txt", size: 2, mtimeMs: 100 },
  { path: "same.txt", size: 5, mtimeMs: 100 },
  { path: "sub/b.txt", size: 3, mtimeMs: 100 },
];

const remote = [
  { path: "changed.txt", size: 9, uploadedMs: 200 },
  { path: "same.txt", size: 5, uploadedMs: 200 },
  { path: "remote-only.txt", size: 7, uploadedMs: 200 },
  { path: "sub/b.txt", size: 3, uploadedMs: 200 },
];

describe("planSync", () => {
  it("push：本地新增上传、size 不同 local wins、远端独有进清理候选", () => {
    const plan = planSync("push", local, remote);
    expect(plan.transfer).toEqual(["a.txt", "changed.txt"]);
    expect(plan.changed).toEqual(["changed.txt"]);
    expect(plan.deleteCandidates).toEqual(["remote-only.txt"]);
    expect(plan.upToDate).toEqual(["same.txt", "sub/b.txt"]);
    expect(conflictBackupKeys("push", plan)).toEqual(["changed.txt"]);
  });

  it("pull：远端新增下载、size 不同远端 wins、本地独有进清理候选", () => {
    const plan = planSync("pull", local, remote);
    expect(plan.transfer).toEqual(["changed.txt", "remote-only.txt"]);
    expect(plan.changed).toEqual(["changed.txt"]);
    expect(plan.deleteCandidates).toEqual(["a.txt"]);
    expect(plan.upToDate).toEqual(["same.txt", "sub/b.txt"]);
    expect(conflictBackupKeys("pull", plan)).toEqual([]);
  });

  it("空两侧产出空计划", () => {
    const plan = planSync("push", [], []);
    expect(plan.transfer).toEqual([]);
    expect(plan.deleteCandidates).toEqual([]);
  });

  it("同路径同 size 视为一致（不做 mtime 比较）", () => {
    const plan = planSync("push", [{ path: "x", size: 1, mtimeMs: 999 }], [{ path: "x", size: 1, uploadedMs: 1 }]);
    expect(plan.upToDate).toEqual(["x"]);
    expect(plan.transfer).toEqual([]);
  });
});
