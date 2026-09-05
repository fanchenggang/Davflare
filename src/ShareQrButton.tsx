import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Box, IconButton, Popover, Skeleton, Typography } from "@mui/material";
import QrCode2Icon from "@mui/icons-material/QrCode2";
import { strings } from "./app/strings";

/** 分享链接二维码入口：点击弹出零依赖弹层，dataURL 由 qrcode 前端生成 */
function ShareQrButton({ url }: { url: string }) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [dataUrl, setDataUrl] = useState("");
  const open = Boolean(anchorEl);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setDataUrl("");
    QRCode.toDataURL(url, { width: 240, margin: 1 })
      .then((value) => {
        if (alive) setDataUrl(value);
      })
      .catch(() => {
        // 二维码生成失败时弹层内停留在骨架屏，不影响复制/关闭等主流程
      });
    return () => {
      alive = false;
    };
  }, [open, url]);

  return (
    <>
      <IconButton
        size="small"
        aria-label={strings.shareQrTitle}
        title={strings.shareQrTitle}
        onClick={(event) => setAnchorEl(event.currentTarget)}
      >
        <QrCode2Icon fontSize="small" />
      </IconButton>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <Box
          sx={{
            p: 2,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 1,
          }}
        >
          <Typography variant="subtitle2">{strings.shareQrTitle}</Typography>
          {dataUrl ? (
            <Box
              component="img"
              src={dataUrl}
              alt={strings.shareQrTitle}
              width={200}
              height={200}
              sx={{ display: "block", borderRadius: 1 }}
            />
          ) : (
            <Skeleton variant="rectangular" width={200} height={200} />
          )}
        </Box>
      </Popover>
    </>
  );
}

export default ShareQrButton;
