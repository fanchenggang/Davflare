import { forwardRef, useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import { alpha, useTheme } from "@mui/material/styles";

import MimeIcon from "./MimeIcon";
import { authFetch } from "./app/auth";
import { loadLazyThumbnail } from "./app/lazyThumbnail";
import { FileItem } from "./app/types";

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

  useEffect(() => {
    let active = true;
    setUrl(null);
    loadThumbnailUrl(digest).then((objectUrl) => {
      if (active) setUrl(objectUrl);
    });
    return () => {
      active = false;
    };
  }, [digest]);

  return <ThumbnailFrame url={url} name={name} contentType={contentType} size={size} />;
}

interface LazyThumbnailProps {
  file: Pick<FileItem, "key" | "name" | "size" | "uploaded" | "contentType">;
  size: number;
}

/**
 * 没有预生成缩略图的小图（WebDAV 上传等，#149）：进入视口（含 200px 预读）才去下载原图、
 * 在浏览器里缩成小图；之前和失败时都显示类型图标。
 */
export function LazyThumbnail({ file, size }: LazyThumbnailProps) {
  const holder = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const { key, size: bytes, uploaded } = file;

  useEffect(() => {
    if (visible) return undefined;
    const node = holder.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return undefined;
    let active = true;
    setUrl(null);
    loadLazyThumbnail({ key, size: bytes, uploaded }).then((objectUrl) => {
      if (active) setUrl(objectUrl);
    });
    return () => {
      active = false;
    };
  }, [visible, key, bytes, uploaded]);

  return (
    <ThumbnailFrame
      ref={holder}
      url={url}
      name={file.name}
      contentType={file.contentType}
      size={size}
    />
  );
}

interface ThumbnailFrameProps {
  url: string | null;
  name: string;
  contentType: string;
  size: number;
}

const ThumbnailFrame = forwardRef<HTMLDivElement, ThumbnailFrameProps>(function ThumbnailFrame(
  { url, name, contentType, size },
  ref
) {
  const [loaded, setLoaded] = useState(false);
  const mode = useTheme().palette.mode;

  useEffect(() => {
    setLoaded(false);
  }, [url]);

  return (
    <Box
      ref={ref}
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
});
