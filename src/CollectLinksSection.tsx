import { useEffect, useState } from "react";
import { Box, Typography } from "@mui/material";

import CollectLinkList from "./CollectLinkList";
import { CollectInfo, listCollects } from "./app/collects";
import { NotifyFn } from "./app/notify";
import { strings } from "./app/strings";

/** 分享管理页里的「文件收集链接」分区；加载失败只在分区内提示，不影响分享列表。 */
function CollectLinksSection({ onNotify }: { onNotify: NotifyFn }) {
  const [items, setItems] = useState<CollectInfo[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    listCollects()
      .then((list) => {
        if (alive) setItems(list);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (items === null && !failed) return null;

  return (
    <Box sx={{ px: 1, pb: 2 }} data-testid="collect-links-section">
      <Typography variant="h6" sx={{ px: 1, pt: 1, pb: 1 }}>
        {strings.collectLinks}
      </Typography>
      {failed ? (
        <Typography variant="body2" color="error" sx={{ px: 1 }}>
          {strings.loadCollectsFailed}
        </Typography>
      ) : items && items.length > 0 ? (
        <CollectLinkList items={items} onChange={setItems} onNotify={onNotify} />
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ px: 1 }}>
          {strings.collectEmptyHint}
        </Typography>
      )}
    </Box>
  );
}

export default CollectLinksSection;
