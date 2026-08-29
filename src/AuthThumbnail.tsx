import React, { useEffect, useState } from "react";

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

  if (!url) {
    return <MimeIcon contentType={contentType} name={name} />;
  }

  return (
    <img
      src={url}
      alt={name}
      loading="lazy"
      style={{
        width: size,
        height: size,
        objectFit: "cover",
        borderRadius: size >= 48 ? 8 : 4,
      }}
    />
  );
}
