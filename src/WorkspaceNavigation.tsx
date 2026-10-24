import {
  Box,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from "@mui/material";
import {
  Close,
  FolderOutlined,
  ShareOutlined,
  Language,
  ImageOutlined,
  DeleteOutline,
  SettingsOutlined,
  PushPinOutlined,
  AutoAwesomeOutlined,
} from "@mui/icons-material";
import { useFeatures } from "./app/features";
import { Route } from "./app/route";
import { FolderShortcut, useFolderShortcuts } from "./app/shortcuts";
import { strings } from "./app/strings";

export default function WorkspaceNavigation({
  route,
  navigate,
  onOpenShortcut,
}: {
  route: Route;
  navigate: (route: Route) => void;
  onOpenShortcut: (item: FolderShortcut) => void;
}) {
  const { flags } = useFeatures();
  const { items, remove } = useFolderShortcuts();
  const links: Array<{
    kind: "folder" | "shares" | "sites" | "images" | "trash";
    label: string;
    icon: JSX.Element;
  }> = [
    { kind: "folder", label: strings.files, icon: <FolderOutlined /> },
    { kind: "shares", label: strings.shares, icon: <ShareOutlined /> },
    ...(flags.sites
      ? [
          {
            kind: "sites" as const,
            label: strings.sitesSection,
            icon: <Language />,
          },
        ]
      : []),
    ...(flags.imageHost
      ? [
          {
            kind: "images" as const,
            label: strings.imagesSection,
            icon: <ImageOutlined />,
          },
        ]
      : []),
    { kind: "trash", label: strings.trash, icon: <DeleteOutline /> },
  ];
  return (
    <Box
      component="nav"
      aria-label={strings.navigation}
      sx={{
        width: 232,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        px: 1.5,
        py: 2.5,
        gap: 1,
        bgcolor: "background.paper",
        borderRight: "1px solid",
        borderColor: "divider",
        overflowY: "auto",
      }}
    >
      <Typography
        variant="overline"
        color="text.secondary"
        sx={{ px: 1.5, letterSpacing: 1.5 }}
      >
        {strings.workspace}
      </Typography>
      <List disablePadding>
        {links.map((link) => (
          <ListItemButton
            key={link.kind}
            selected={route.kind === link.kind}
            onClick={() =>
              navigate(
                link.kind === "folder"
                  ? { kind: "folder", path: "" }
                  : { kind: link.kind },
              )
            }
            sx={{
              borderRadius: 2,
              mb: 0.5,
              minHeight: 44,
              "&.Mui-selected": {
                color: "primary.main",
                "& .MuiListItemIcon-root": { color: "primary.main" },
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>{link.icon}</ListItemIcon>
            <ListItemText
              primary={link.label}
              primaryTypographyProps={{
                fontSize: 14,
                fontWeight: route.kind === link.kind ? 700 : 500,
              }}
            />
          </ListItemButton>
        ))}
      </List>
      <Divider sx={{ my: 1 }} />
      <Typography
        variant="overline"
        color="text.secondary"
        sx={{ px: 1.5, letterSpacing: 1.5 }}
      >
        {strings.shortcuts}
      </Typography>
      {!items.length && (
        <Typography variant="caption" sx={{ px: 1.5, lineHeight: 1.8 }}>
          {strings.shortcutsHint}
        </Typography>
      )}
      <List disablePadding sx={{ flexGrow: 1 }}>
        {items.map((item) => (
          <Box
            key={item.path}
            sx={{ display: "flex", alignItems: "center", minWidth: 0 }}
          >
            <ListItemButton
              onClick={() => onOpenShortcut(item)}
              title={item.path || "/"}
              sx={{ minWidth: 0, borderRadius: 2 }}
            >
              <ListItemIcon sx={{ minWidth: 30 }}>
                <PushPinOutlined sx={{ fontSize: 17 }} />
              </ListItemIcon>
              <ListItemText
                primary={item.name}
                primaryTypographyProps={{ noWrap: true, fontSize: 13 }}
              />
            </ListItemButton>
            <IconButton
              size="small"
              aria-label={`${strings.removeShortcut}: ${item.name}`}
              onClick={() => remove(item.path)}
            >
              <Close sx={{ fontSize: 15 }} />
            </IconButton>
          </Box>
        ))}
      </List>
      <Divider />
      {flags.mcp && flags.apiKey && (
        <ListItemButton
          sx={{ borderRadius: 2, flex: "0 0 auto" }}
          selected={route.kind === "mcp"}
          onClick={() => navigate({ kind: "mcp" })}
        >
          <ListItemIcon sx={{ minWidth: 36 }}>
            <AutoAwesomeOutlined />
          </ListItemIcon>
          <ListItemText
            primary={strings.mcpPlayTitle}
            primaryTypographyProps={{ fontSize: 13 }}
          />
        </ListItemButton>
      )}
      <ListItemButton
        sx={{ borderRadius: 2, flex: "0 0 auto" }}
        selected={route.kind === "settings"}
        onClick={() => navigate({ kind: "settings" })}
      >
        <ListItemIcon sx={{ minWidth: 36 }}>
          <SettingsOutlined />
        </ListItemIcon>
        <ListItemText
          primary={strings.settings}
          primaryTypographyProps={{ fontSize: 14 }}
        />
      </ListItemButton>
    </Box>
  );
}
