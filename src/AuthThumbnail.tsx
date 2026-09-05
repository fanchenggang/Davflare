import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import { alpha, useTheme } from "@mui/material/styles";

import MimeIcon from "./MimeIcon";
import { authFetch } from "./app/auth";

// 缩略图经 /webdav/ 下发，需要 Basic 认证头，普通 <img> 拿不到（私有模式 401）。
// 这里统一用 authFetch 取 blob，按 digest 缓存 objectURL，失败回退到类型图标。
const thumbnailUrlCache = new Map<string, Promise<string | null>>();

function loadThumbnailUrl(digest: string): Promise<string | null> {
  let cached = thumbnailUrlCache.get(digest);
  if (!cached) {
    cached = (async () => {
      try {
        const response = await authFetch(
          `/webdav/_$flaredrive$/thumbnails/${digest}.png`
        );
        if (!response.ok) return null;
        const blob = await response.blob();
        return URL.createObjectURL(blob);
      } catch {
        return null;
      }
    })();
    thumbnailUrlCache.set(digest, cached);
  }
  return cached;
}

interface AuthThumbnailProps {
  digest: string;
  name: string;
  contentType: string;
  size: number;
}

export default function AuthThumbnail({
  digest,
  name,
  contentType,
  size,
}: AuthThumbnailProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const mode = useTheme().palette.mode;

  useEffect(() => {
    let active = true;
    setUrl(null);
    setLoaded(false);
    loadThumbnailUrl(digest).then((objectUrl) => {
      if (active) setUrl(objectUrl);
    });
    return () => {
      active = false;
    };
  }, [digest]);

  return (
    <Box
      sx={{
        position: "relative",
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {!loaded && <MimeIcon contentType={contentType} name={name} />}
      {url && (
        <img
          src={url}
          alt={name}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          style={{
            position: "absolute",
            inset: 0,
            width: size,
            height: size,
            objectFit: "cover",
            borderRadius: size >= 48 ? 8 : 4,
            // 透明 PNG 缩略图的棋盘格衬底，与预览大图一致（暗色用亮格）
            backgroundImage:
              mode === "dark"
                ? "conic-gradient(rgba(255,255,255,0.14) 25%, transparent 0 50%, rgba(255,255,255,0.14) 0 75%, transparent 0)"
                : `conic-gradient(${alpha("#1c1610", 0.12)} 25%, transparent 0 50%, ${alpha("#1c1610", 0.12)} 0 75%, transparent 0)`,
            backgroundSize: "12px 12px",
            // blur-up：blob 就绪后从类型图标占位淡入
            opacity: loaded ? 1 : 0,
            transition: "opacity 180ms ease",
          }}
        />
      )}
    </Box>
  );
}
