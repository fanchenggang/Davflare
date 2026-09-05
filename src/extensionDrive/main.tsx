import { useEffect, useState } from "react";
import { createRoot, Root } from "react-dom/client";
import { Box, Button, Typography } from "@mui/material";
import App from "../App";
import {
  clearCredentials,
  getCredentials,
  setApiBase,
  setCredentials,
  subscribeAuth,
} from "../app/auth";
import { credentialsToExtRecord, extRecordToCredentials } from "./credentials";

// 扩展网盘视图:把 Web 端 App 直接挂进 bookmarks.html 的 #driveRoot,
// 取代原先的 iframe(实例 _headers 下发 X-Frame-Options: DENY,无法内嵌)。
// 挂载前完成三件事:API base 指向实例、chrome.storage 凭据播种进 App、
// 检查实例 origin 的可选 host 权限(/api/* 没有 CORS,必须授权后才能调用)。

const COPY = {
  en: {
    grantTitle: "Grant access to your instance",
    grantBody:
      "The drive view calls your instance's API directly, so Chrome needs permission to reach it.",
    grantButton: "Grant access",
    invalidInstance: "Invalid instance URL",
  },
  zh: {
    grantTitle: "授权访问你的网盘实例",
    grantBody: "网盘视图需要直接调用实例 API,请允许 Chrome 访问该地址。",
    grantButton: "授权访问",
    invalidInstance: "实例地址无效",
  },
} as const;

const lang: keyof typeof COPY = navigator.language
  .toLowerCase()
  .startsWith("zh")
  ? "zh"
  : "en";

function instanceOrigin(instanceUrl: string): string | null {
  try {
    return new URL(instanceUrl).origin;
  } catch {
    return null;
  }
}

function DriveGate({ origin }: { origin: string }) {
  const [state, setState] = useState<"checking" | "need" | "ready">("checking");
  const pattern = `${origin}/*`;

  useEffect(() => {
    let alive = true;
    chrome.permissions
      .contains({ origins: [pattern] })
      .then((granted) => {
        if (alive) setState(granted ? "ready" : "need");
      })
      .catch(() => {
        if (alive) setState("need");
      });
    return () => {
      alive = false;
    };
  }, [pattern]);

  if (state === "ready") return <App />;
  const copy = COPY[lang];
  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 3,
      }}
    >
      <Box sx={{ maxWidth: 420, textAlign: "center" }}>
        <Typography variant="h6" gutterBottom>
          {state === "checking" ? "…" : copy.grantTitle}
        </Typography>
        {state === "need" && (
          <>
            <Typography variant="body2" color="text.secondary" paragraph>
              {copy.grantBody}
            </Typography>
            <Button
              variant="contained"
              onClick={() => {
                // chrome.permissions.request 必须由用户手势触发,只能放在点击里
                chrome.permissions
                  .request({ origins: [pattern] })
                  .then((granted) => setState(granted ? "ready" : "need"))
                  .catch(() => {});
              }}
            >
              {copy.grantButton}
            </Button>
          </>
        )}
      </Box>
    </Box>
  );
}

let mirrorWired = false;

/** App 内登录/登出 → 写回 chrome.storage.local,background 的 dav.js 共用同一份凭据 */
function wireCredentialMirror() {
  if (mirrorWired) return;
  mirrorWired = true;
  subscribeAuth(() => {
    const record = credentialsToExtRecord(getCredentials());
    if (record.davUsername && record.davPassword) {
      void chrome.storage.local.set(record);
    } else {
      void chrome.storage.local.remove(["davUsername", "davPassword"]);
    }
  });
}

/** chrome.storage 是扩展侧凭据的权威来源,每次挂载都覆盖 App 侧(含清空) */
async function seedCredentials() {
  const record = await chrome.storage.local.get(["davUsername", "davPassword"]);
  const creds = extRecordToCredentials(record);
  if (creds) setCredentials(creds);
  else clearCredentials();
}

let root: Root | null = null;
let rootContainer: HTMLElement | null = null;
let lastTarget: HTMLElement | null = null;
let lastInstanceUrl = "";
let lastOrigin = "";

function mount(target: HTMLElement, instanceUrl: string) {
  lastTarget = target;
  lastInstanceUrl = instanceUrl;
  setApiBase(instanceUrl);
  const origin = instanceOrigin(instanceUrl);
  if (!origin) {
    target.textContent = COPY[lang].invalidInstance;
    return;
  }
  wireCredentialMirror();
  if (origin !== lastOrigin) {
    // 换实例必须重挂:App 里残留的目录路由/列表属于旧实例
    lastOrigin = origin;
    if (root) {
      root.unmount();
      root = null;
      rootContainer = null;
    }
  }
  void seedCredentials().then(() => {
    if (!root || rootContainer !== target) {
      if (root) root.unmount();
      root = createRoot(target);
      rootContainer = target;
    }
    root.render(<DriveGate origin={origin} />);
  });
}

/** 刷新 = 整树重挂,App 状态归零后重新拉取列表 */
function reload() {
  if (!lastTarget || !lastInstanceUrl) return;
  if (root) {
    root.unmount();
    root = null;
    rootContainer = null;
  }
  mount(lastTarget, lastInstanceUrl);
}

declare global {
  interface Window {
    DavflareDrive?: {
      mount(target: HTMLElement, instanceUrl: string): void;
      reload(): void;
    };
  }
}

window.DavflareDrive = { mount, reload };
