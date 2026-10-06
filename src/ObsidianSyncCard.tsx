import { Box, Button, Stack, Typography } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";

import { strings, translate } from "./app/strings";

/**
 * WebDAV 连接面板里的「Obsidian 同步」卡片：给 Remotely Save 插件的推荐填写方式。
 * 只展示/复制服务器地址与用户名，密码永远不展示。建议项均来自对 Remotely Save 0.5.x 请求序列的实测。
 */
function ObsidianSyncCard({
  serverAddress,
  username,
  onCopy,
}: {
  serverAddress: string;
  username: string | undefined;
  onCopy: (text: string, label: string) => void;
}) {
  const tips = [
    strings.obsidianPasswordTip,
    strings.obsidianAuthTip,
    strings.obsidianDepthTip,
    strings.obsidianBaseDirTip,
    strings.obsidianCheckTip,
    strings.obsidianSizeTip,
  ];
  const guide = [
    `${strings.obsidianServerAddress}: ${serverAddress}`,
    translate("obsidianUsernameLine", { username: username || strings.notConfigured }),
    ...tips,
  ].join("\n");

  return (
    <Box
      component="section"
      aria-label={strings.obsidianSyncTitle}
      sx={{
        p: 1.5,
        borderRadius: 2,
        backgroundColor: "background.paper",
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 600 }}>
        {strings.obsidianSyncTitle}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        {strings.obsidianSyncIntro}
      </Typography>
      <Stack spacing={0.5} sx={{ mt: 1 }}>
        <Typography variant="caption" color="text.secondary">
          {strings.obsidianServerAddress}
        </Typography>
        <Typography
          data-testid="obsidian-server-address"
          sx={{ fontFamily: "monospace", fontSize: 13, wordBreak: "break-all" }}
        >
          {serverAddress}
        </Typography>
        <Typography variant="body2">
          {translate("obsidianUsernameLine", { username: username || strings.notConfigured })}
        </Typography>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: "wrap" }}>
        <Button
          size="small"
          startIcon={<ContentCopyIcon />}
          onClick={() => onCopy(serverAddress, strings.obsidianServerAddress)}
        >
          {strings.obsidianCopyServerAddress}
        </Button>
        {username && (
          <Button
            size="small"
            startIcon={<ContentCopyIcon />}
            onClick={() => onCopy(username, strings.username)}
          >
            {strings.obsidianCopyAccount}
          </Button>
        )}
      </Stack>
      <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.5 }}>
        {tips.map((tip) => (
          <Typography key={tip} component="li" variant="body2" sx={{ wordBreak: "break-word" }}>
            {tip}
          </Typography>
        ))}
      </Box>
      <Button
        size="small"
        startIcon={<ContentCopyIcon />}
        onClick={() => onCopy(guide, strings.obsidianGuideLabel)}
        sx={{ mt: 1 }}
      >
        {strings.obsidianCopyGuide}
      </Button>
    </Box>
  );
}

export default ObsidianSyncCard;
