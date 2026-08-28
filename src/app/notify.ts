export type NoticeSeverity = "error" | "success" | "info";

export type NotifyFn = (message: string, severity?: NoticeSeverity) => void;
