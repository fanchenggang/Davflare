/**
 * 双向同步 diff 引擎（纯函数，便于单测）。
 * 对比本地条目与远端条目（按相对路径），产出各自动作清单。
 * 冲突定义：同一路径本地与远端都存在且 size 不一致 —— 按「local wins」处理，
 * 上传前可先对远端做 conflict backup（由调用方决定）。
 */

export interface LocalEntry {
  /** 相对路径，/ 分隔 */
  path: string;
  size: number;
  mtimeMs: number;
}

export interface RemoteEntryLite {
  /** 相对路径（相对同步根），/ 分隔 */
  path: string;
  size: number;
  uploadedMs: number;
}

export type SyncDirection = "push" | "pull";

export interface SyncPlan {
  /** push=待上传；pull=待下载 */
  transfer: string[];
  /** 对端独有；push 时为远端多出的，pull 时为本地多出的 */
  missingOnSource: string[];
  /** push 时本地较新（或远端缺失）；pull 时远端较新（或本地缺失） */
  upToDate: string[];
  /** 双侧都有且 size 不同（可能冲突） */
  changed: string[];
  /** push=远端独有；pull=本地独有 —— 仅 --delete 时清理 */
  deleteCandidates: string[];
}

function buildMaps(local: LocalEntry[], remote: RemoteEntryLite[]) {
  const localMap = new Map(local.map((entry) => [entry.path, entry]));
  const remoteMap = new Map(remote.map((entry) => [entry.path, entry]));
  const paths = new Set<string>([...localMap.keys(), ...remoteMap.keys()]);
  return { localMap, remoteMap, paths };
}

export function planSync(direction: SyncDirection, local: LocalEntry[], remote: RemoteEntryLite[]): SyncPlan {
  const { localMap, remoteMap, paths } = buildMaps(local, remote);
  const plan: SyncPlan = { transfer: [], missingOnSource: [], upToDate: [], changed: [], deleteCandidates: [] };

  for (const p of paths) {
    const l = localMap.get(p);
    const r = remoteMap.get(p);
    if (direction === "push") {
      if (!r) {
        plan.transfer.push(p);
      } else if (!l) {
        plan.deleteCandidates.push(p);
      } else if (l.size !== r.size) {
        plan.changed.push(p);
        plan.transfer.push(p); // local wins
      } else {
        plan.upToDate.push(p);
      }
    } else {
      if (!l) {
        plan.transfer.push(p);
      } else if (!r) {
        plan.deleteCandidates.push(p);
      } else if (l.size !== r.size) {
        plan.changed.push(p);
        plan.transfer.push(p); // remote wins（pull 时以远端为准）
      } else {
        plan.upToDate.push(p);
      }
    }
  }

  plan.transfer.sort();
  plan.changed.sort();
  plan.deleteCandidates.sort();
  plan.upToDate.sort();
  plan.missingOnSource.sort();
  return plan;
}

/**
 * push 冲突保护：changed 且远端存在时，先把远端改名备份（name.conflict-<UTC>）。
 * 由调用方对 plan.changed 中仍在远端的路径逐个调用；返回需要备份的键。
 */
export function conflictBackupKeys(direction: SyncDirection, plan: SyncPlan): string[] {
  // pull 方向的冲突以远端覆盖本地，本地文件无需服务端备份；
  // push 方向 local wins，远端旧内容先备份再覆盖。
  return direction === "push" ? [...plan.changed] : [];
}
