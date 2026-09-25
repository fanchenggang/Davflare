import { ClipboardState } from "./clipboard";
import { NotifyFn } from "./notify";
import { strings, translate } from "./strings";
import {
  collectFilesFromDataTransfer,
  copyPaste,
  fetchPath,
} from "./transfer";
import { moveToTrash, restoreTrash } from "./trash";
import { transferKeys } from "./useUploadInputs";
import { FileItem } from "./types";
import { errorMessage } from "./utils";

export interface FileOperationsDeps {
  /** 粘贴等操作只在文件视图（route.kind === "folder"）生效 */
  folderActive: boolean;
  cwd: string;
  clipboard: ClipboardState | null;
  renameTarget: FileItem | null;
  confirmDelete: string[] | null;
  moveTarget: string[] | null;
  onNotify: NotifyFn;
  loadListing: () => Promise<void> | void;
  clearClipboard: () => void;
  setSelectedKeys: (keys: string[]) => void;
  setFocusedKey: (key: string | null) => void;
  setPreviewFile: (file: FileItem | null) => void;
  setMoveTarget: (keys: string[] | null) => void;
  setConfirmDelete: (keys: string[] | null) => void;
  setRenameTarget: (file: FileItem | null) => void;
  /** 向指定目录排入上传队列（拖拽外部文件时使用） */
  enqueueToDir: (incoming: File[], dir: string, taken: Set<string>) => void;
}

/** 文件操作提交逻辑（重命名/删除/粘贴/移动/拖放），UI 状态由调用方持有 */
export function useFileOperations(deps: FileOperationsDeps) {
  const {
    folderActive,
    cwd,
    clipboard,
    renameTarget,
    confirmDelete,
    moveTarget,
    onNotify,
    loadListing,
    clearClipboard,
    setSelectedKeys,
    setFocusedKey,
    setPreviewFile,
    setMoveTarget,
    setConfirmDelete,
    setRenameTarget,
    enqueueToDir,
  } = deps;

  const handleRenameSubmit = async (name: string) => {
    if (!renameTarget) return;
    const parent = renameTarget.key.slice(
      0,
      renameTarget.key.length - renameTarget.name.length
    );
    const target = `${parent}${name}`;
    const source = renameTarget.key;
    const runRename = async () => {
      await copyPaste(source, target, true);
    };
    try {
      await runRename();
      onNotify(translate("renameDone"), "success");
    } catch (error) {
      onNotify(errorMessage(error), "error", {
        duration: 8000,
        action: { label: strings.retry, onClick: () => runRename().catch(() => {}) },
      });
    } finally {
      setRenameTarget(null);
      await loadListing();
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    const targets = confirmDelete;
    const runDelete = async () => {
      return moveToTrash(targets);
    };
    try {
      const result = await runDelete();
      const trashIds = result.results.map((item) => item.id);
      onNotify(translate("movedToTrashCount", { count: trashIds.length }), "success", {
        duration: 7000,
        action: trashIds.length
          ? {
              label: strings.undo,
              onClick: () => {
                restoreTrash(trashIds)
                  .then(() => {
                    onNotify(translate("undoDeleteDone"), "success");
                  })
                  .catch((error) =>
                    onNotify(errorMessage(error), "error")
                  )
                  .finally(() => loadListing());
              },
            }
          : undefined,
      });
    } catch (error) {
      onNotify(errorMessage(error), "error", {
        action: {
          label: strings.retry,
          onClick: () => runDelete().then(() => loadListing()).catch(() => {}),
        },
      });
    } finally {
      setConfirmDelete(null);
      setSelectedKeys([]);
      setFocusedKey(null);
      setPreviewFile(null);
      await loadListing();
    }
  };

  const handlePaste = async () => {
    if (!clipboard || !folderActive) return;
    const runPaste = async () => {
      await transferKeys(clipboard.keys, cwd, clipboard.mode);
      if (clipboard.mode === "cut") clearClipboard();
    };
    try {
      await runPaste();
      onNotify(translate("pasteDone"), "success");
    } catch (error) {
      onNotify(errorMessage(error), "error", {
        duration: 8000,
        action: { label: strings.retry, onClick: () => runPaste().catch(() => {}) },
      });
    } finally {
      await loadListing();
    }
  };

  const handleMove = async (destination: string) => {
    if (!moveTarget?.length) return;
    const keys = moveTarget;
    const runMove = async () => {
      await transferKeys(keys, destination, "cut");
    };
    try {
      await runMove();
      setSelectedKeys([]);
      onNotify(translate("moveDone"), "success");
    } catch (error) {
      onNotify(errorMessage(error), "error", {
        action: {
          label: strings.retry,
          onClick: () => runMove().then(() => loadListing()).catch(() => {}),
        },
      });
    } finally {
      setMoveTarget(null);
      await loadListing();
    }
  };

  const handleDropOnFolder = async (
    folder: FileItem,
    dataTransfer: DataTransfer
  ) => {
    const internalKey = dataTransfer.getData("application/x-flaredrive");
    if (internalKey) {
      // 新格式为选中组 JSON 数组；旧格式为纯 key（解析失败时回退单键）
      let keys: string[] = [internalKey];
      if (internalKey.trim().startsWith("[")) {
        try {
          const parsed = JSON.parse(internalKey) as unknown[];
          keys = parsed.map(String);
        } catch {
          keys = [internalKey];
        }
      }
      // 不能把目标文件夹自身或其子项拖进它自己
      keys = keys.filter(
        (key) => key !== folder.key && !key.startsWith(`${folder.key}/`)
      );
      if (!keys.length) return;
      const destination = `${folder.key}/`;
      const runMove = async () => {
        await transferKeys(keys, destination, "cut");
      };
      try {
        await runMove();
        setSelectedKeys([]);
        await loadListing();
      } catch (error) {
        onNotify(errorMessage(error), "error", {
          action: {
            label: strings.retry,
            onClick: () => runMove().then(() => loadListing()).catch(() => {}),
          },
        });
      }
      return;
    }

    const droppedFiles = await collectFilesFromDataTransfer(dataTransfer);
    if (!droppedFiles.length) return;
    const dest = `${folder.key.replace(/\/$/, "")}/`;
    let taken: Set<string> = new Set();
    try {
      taken = new Set((await fetchPath(dest)).map((item) => item.name));
    } catch {
      taken = new Set();
    }
    enqueueToDir(droppedFiles, dest, taken);
  };

  return {
    handleRenameSubmit,
    handleConfirmDelete,
    handlePaste,
    handleMove,
    handleDropOnFolder,
  };
}
