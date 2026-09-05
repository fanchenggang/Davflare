import { Credentials } from "../app/auth";

// 扩展侧凭据存在 chrome.storage.local 的 davUsername/davPassword(background
// 的 dav.js 也读同一份);Web 端 App 的 auth 模块用 localStorage。桥接层在
// 两者间镜像:挂载时 chrome.storage → App,App 内登录/登出 → chrome.storage。

export interface ExtCredentialRecord {
  davUsername?: string;
  davPassword?: string;
}

/** chrome.storage 记录 → App 凭据;任一字段缺失即视为未登录 */
export function extRecordToCredentials(
  record: ExtCredentialRecord | undefined
): Credentials | null {
  const username = record?.davUsername;
  const password = record?.davPassword;
  if (!username || !password) return null;
  return { username, password };
}

export function credentialsToExtRecord(
  creds: Credentials | null
): ExtCredentialRecord {
  if (!creds) return {};
  return { davUsername: creds.username, davPassword: creds.password };
}
