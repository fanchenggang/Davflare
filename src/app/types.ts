export interface FileItem {
  key: string;
  name: string;
  isDir: boolean;
  size: number;
  uploaded: string;
  contentType: string;
  thumbnail?: string;
}

export type TransferType = "upload" | "download";

export type TransferStatus =
  | "pending"
  | "in-progress"
  | "paused"
  | "completed"
  | "failed"
  | "canceled";

export interface UploadPart {
  partNumber: number;
  etag: string;
}

export interface TransferTask {
  id: string;
  type: TransferType;
  status: TransferStatus;
  file?: File;
  name: string;
  basedir: string;
  remoteKey: string;
  loaded: number;
  total: number;
  uploadId?: string;
  uploadedParts?: UploadPart[];
  error?: string;
}

export interface ShareInfo {
  token: string;
  key: string;
  name: string;
  expiresAt: string | null;
  createdAt: string;
  url: string;
  extractCode?: string | null;
  hasExtractCode?: boolean;
}

export interface TrashItem {
  trashKey: string;
  originalKey: string;
  name: string;
  deletedAt: string;
  size: number;
}

export interface ApiKeyInfo {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  expiresAt: string | null;
  createdBy?: string | null;
  lastUsedAt?: string | null;
  key?: string;
}

