export type NoticeSeverity = "error" | "success" | "info";

export interface NoticeAction {
  label: string;
  onClick: () => void;
}

export interface NoticeOptions {
  /** Snackbar 上的动作按钮（如「撤销」「重试」） */
  action?: NoticeAction;
  /** 自动关闭毫秒数，默认 5000 */
  duration?: number;
}

export type NotifyFn = (
  message: string,
  severity?: NoticeSeverity,
  options?: NoticeOptions
) => void;
