import React from "react";

import dictionaryEntries from "./stringsDictionary";

export type Lang = "zh" | "en";

export const APP_NAME = "Davflare";

let currentLang: Lang = detectLang();
const listeners = new Set<() => void>();

/** 同步 <html lang>，浏览器据此选择字体/断行与朗读、翻译行为 */
function syncDocumentLang(lang: Lang) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
}

syncDocumentLang(currentLang);

/** 暴露字典本体：单测校验每个 key 的 zh/en 都非空，防止漏译 */
export const dictionary = dictionaryEntries;

function detectLang(): Lang {
  try {
    const saved = localStorage.getItem("flaredrive.lang");
    if (saved === "zh" || saved === "en") return saved;
  } catch {
    // ignore persistence failures
  }
  return typeof navigator !== "undefined" &&
    navigator.language?.toLowerCase().startsWith("zh")
    ? "zh"
    : "en";
}

export function getLang(): Lang {
  return currentLang;
}

export function setLang(lang: Lang) {
  currentLang = lang;
  syncDocumentLang(lang);
  try {
    localStorage.setItem("flaredrive.lang", lang);
  } catch {
    // ignore persistence failures
  }
  for (const listener of listeners) listener();
}

export function subscribeLang(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 参数化翻译：translate("listingStats", { folders: 2, files: 5, size: "1 KB" }) */
export function translate(
  key: string,
  params?: Record<string, string | number>
): string {
  const entry = dictionaryEntries[key];
  const text = entry ? entry[currentLang] : key;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (_match, name: string) =>
    params[name] !== undefined ? String(params[name]) : `{${name}}`
  );
}

// Proxy 让现有 strings.xxx 用法在语言切换后自然返回对应语言（组件重渲染时读取）。
// 开发期 key 拼错会原样返回 key 名，便于发现。
export const strings = new Proxy(
  {},
  {
    get(_target, key: string) {
      if (typeof key !== "string") return "";
      return translate(key);
    },
  }
) as { [key: string]: string };

/** 订阅语言变化（App 根部用于触发整树重渲染） */
export function useLang(): Lang {
  const [lang, setLangState] = React.useState<Lang>(currentLang);
  React.useEffect(
    () =>
      subscribeLang(() => {
        setLangState(currentLang);
      }),
    []
  );
  return lang;
}

export default strings;
