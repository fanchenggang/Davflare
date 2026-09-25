// 传输类工具：大文件自动三段式分块上传、download 分页读取、zip 分页。
import {
  MCP_DOWNLOAD_PART_SIZE,
  MCP_MAX_BYTES,
  MCP_MAX_UPLOAD_BYTES,
  MCP_UPLOAD_PART_SIZE,
  type McpToolResult,
  type ToolCallApis,
} from "./_mcpShared";
import { encodeBase64 } from "./_mcpBytes";
import { readJsonBody, toolError, toolText, wrapApiResponse } from "./_mcpRpc";

/** 大于 1MiB 的上传自动改走三段式分块（create → parts → complete），任一分块失败即 abort 清理并返回错误。 */
export async function multipartUploadTool(
  apis: ToolCallApis,
  key: string,
  bytes: Uint8Array
): Promise<McpToolResult> {
  const startResponse = await apis.uploadStart({ key });
  if (!startResponse.ok) return wrapApiResponse(startResponse);
  const start = await readJsonBody(startResponse);
  const uploadId =
    start && typeof start.uploadId === "string" ? start.uploadId : null;
  if (!uploadId) return toolError("分块上传创建失败：缺少 uploadId");

  const parts: Array<{ partNumber: number; etag: string }> = [];
  const fail = async (
    result: McpToolResult | Promise<McpToolResult>
  ): Promise<McpToolResult> => {
    try {
      await apis.uploadAbort({ key, uploadId });
    } catch {
      // abort 失败不影响错误上报
    }
    return await result;
  };
  try {
    let partNumber = 1;
    for (let offset = 0; offset < bytes.byteLength; partNumber += 1) {
      const chunk = bytes.subarray(
        offset,
        Math.min(offset + MCP_UPLOAD_PART_SIZE, bytes.byteLength)
      );
      const partResponse = await apis.uploadPart({
        key,
        uploadId,
        partNumber,
        body: chunk,
      });
      if (!partResponse.ok) {
        return await fail(wrapApiResponse(partResponse));
      }
      const part = await readJsonBody(partResponse);
      const etag = part && typeof part.etag === "string" ? part.etag : null;
      if (!etag) {
        return await fail(toolError(`分块 ${partNumber} 上传失败：缺少 etag`));
      }
      parts.push({ partNumber, etag });
      offset += chunk.byteLength;
    }
    const completeResponse = await apis.uploadComplete({
      key,
      uploadId,
      parts,
    });
    if (!completeResponse.ok) {
      return await fail(wrapApiResponse(completeResponse));
    }
    return wrapApiResponse(completeResponse);
  } catch (error) {
    return await fail(toolError((error as Error)?.message || "分块上传失败"));
  }
}

/** 大文件分页下载：stat 取大小 → Range 读指定分片 → base64 */
export async function downloadPartTool(
  apis: ToolCallApis,
  path: string,
  part?: number,
  partSize?: number
): Promise<McpToolResult> {
  const statResponse = await apis.stat({ path });
  if (!statResponse.ok) return wrapApiResponse(statResponse);
  const stat = await readJsonBody(statResponse);
  const size = stat && typeof stat.size === "number" ? stat.size : NaN;
  if (!Number.isFinite(size) || size <= 0) {
    return toolError("无法确定文件大小（目录或空文件不支持分页下载）");
  }
  const chunkSize = Math.min(
    Math.max(Math.floor(partSize ?? MCP_DOWNLOAD_PART_SIZE), 1),
    MCP_DOWNLOAD_PART_SIZE
  );
  const totalParts = Math.ceil(size / chunkSize);
  const index = Math.floor(part ?? 1);
  if (index < 1 || index > totalParts) {
    return toolError(`part 需在 1-${totalParts}（共 ${totalParts} 片）`);
  }
  const offset = (index - 1) * chunkSize;
  const length = Math.min(chunkSize, size - offset);
  const response = await apis.downloadRange({ path, offset, length });
  if (!response.ok) return wrapApiResponse(response);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MCP_MAX_BYTES) {
    return toolError("分片超出内联上限，请减小 partSize");
  }
  return toolText(
    JSON.stringify({
      path,
      size,
      part: index,
      totalParts,
      offset,
      length: bytes.byteLength,
      encoding: "base64",
      content: encodeBase64(bytes),
    })
  );
}

/**
 * Zip 流无 Content-Length / Range：整包缓冲后按 part 分页返回 base64。
 * 超过 MCP_MAX_UPLOAD_BYTES 时建议改走 HTTP /api/archive。
 */
export async function zipTool(
  apis: ToolCallApis,
  path: string,
  part?: number,
  partSize?: number
): Promise<McpToolResult> {
  const response = await apis.zip({ path });
  if (response.status >= 400) return wrapApiResponse(response);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType =
    response.headers.get("Content-Type") || "application/zip";
  const filename = (() => {
    const disposition = response.headers.get("Content-Disposition") || "";
    const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
    if (star?.[1]) {
      try {
        return decodeURIComponent(star[1]);
      } catch {
        return star[1];
      }
    }
    const plain = /filename="([^"]+)"/i.exec(disposition);
    return plain?.[1] || `${path.split("/").filter(Boolean).pop() || "archive"}.zip`;
  })();

  if (bytes.byteLength > MCP_MAX_UPLOAD_BYTES) {
    return toolError(
      `Zip larger than ${Math.floor(MCP_MAX_UPLOAD_BYTES / 1000000)} MB (${bytes.byteLength} bytes). Use GET /api/archive?path= with an API key (curl -o), or zip a smaller folder.`
    );
  }

  const wantsPaging = part !== undefined || partSize !== undefined;
  if (!wantsPaging) {
    if (bytes.byteLength > MCP_MAX_BYTES) {
      return toolError(
        `Zip larger than 1 MiB (${bytes.byteLength} bytes). Pass part=1 to page through it, or curl GET /api/archive?path=.`
      );
    }
    return toolText(
      JSON.stringify({
        path,
        filename,
        size: bytes.byteLength,
        contentType,
        encoding: "base64",
        content: encodeBase64(bytes),
        note: "zip archive encoded as base64",
      })
    );
  }

  const chunkSize = Math.min(
    Math.max(Math.floor(partSize ?? MCP_DOWNLOAD_PART_SIZE), 1),
    MCP_DOWNLOAD_PART_SIZE
  );
  if (bytes.byteLength === 0) {
    return toolError("空压缩包，无法分页");
  }
  const totalParts = Math.ceil(bytes.byteLength / chunkSize);
  const index = Math.floor(part ?? 1);
  if (index < 1 || index > totalParts) {
    return toolError(`part 需在 1-${totalParts}（共 ${totalParts} 片）`);
  }
  const offset = (index - 1) * chunkSize;
  const slice = bytes.subarray(offset, offset + chunkSize);
  if (slice.byteLength > MCP_MAX_BYTES) {
    return toolError("分片超出内联上限，请减小 partSize");
  }
  return toolText(
    JSON.stringify({
      path,
      filename,
      size: bytes.byteLength,
      contentType,
      part: index,
      totalParts,
      offset,
      length: slice.byteLength,
      encoding: "base64",
      content: encodeBase64(slice),
    })
  );
}
