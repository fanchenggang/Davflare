import { HostedImage, uploadImage } from "./images";
import { stampPastedName } from "./interaction";
import { NotifyFn } from "./notify";
import { strings, translate } from "./strings";
import { errorMessage } from "./utils";

/** 剪贴板/拖放里算不算「图片」（含截图常见的 image/png + 无名 image.png） */
export function isPasteImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i.test(file.name);
}

/** 截图等无名图片盖时间戳文件名，与 usePasteUpload 旧行为一致 */
export function namePastedFile(file: File): File {
  const generic =
    file.type.startsWith("image/") &&
    (!file.name || /^image\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name));
  if (!generic) return file;
  return new File([file], stampPastedName(file), {
    type: file.type,
    lastModified: file.lastModified,
  });
}

export function collectClipboardFiles(items: DataTransferItemList | undefined): File[] {
  if (!items) return [];
  const pasted: File[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (file) pasted.push(file);
  }
  return pasted;
}

export function partitionPasteFiles(files: File[]): {
  images: File[];
  others: File[];
} {
  const images: File[] = [];
  const others: File[] = [];
  for (const file of files) {
    if (isPasteImageFile(file)) images.push(file);
    else others.push(file);
  }
  return { images, others };
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * 把图片上传到现有 POST /api/images；成功后尽量自动复制公开 URL，
 * toast 上保留「复制链接」动作（与图床页一致）。
 */
export async function uploadPastedImagesToHost(options: {
  files: File[];
  onNotify: NotifyFn;
  onUploaded?: (image: HostedImage) => void;
}): Promise<HostedImage[]> {
  const { files, onNotify, onUploaded } = options;
  const created: HostedImage[] = [];
  for (const raw of files) {
    const file = namePastedFile(raw);
    try {
      const image = await uploadImage(file);
      created.push(image);
      onUploaded?.(image);
      const url = image.url;
      if (url) {
        const copied = await copyText(url);
        onNotify(
          copied
            ? translate("pasteImageHostUploadedCopied", { name: image.name })
            : translate("pasteImageHostUploaded", { name: image.name }),
          "success",
          {
            duration: 8000,
            action: {
              label: strings.copyImageUrl,
              onClick: () => {
                void copyText(url).then((ok) => {
                  onNotify(
                    ok ? strings.imageUrlCopied : strings.copyFailed2,
                    ok ? "success" : "error"
                  );
                });
              },
            },
          }
        );
      } else {
        onNotify(translate("pasteImageHostUploadedNoUrl", { name: image.name }), "info", {
          duration: 8000,
        });
      }
    } catch (error) {
      onNotify(errorMessage(error), "error");
    }
  }
  return created;
}
