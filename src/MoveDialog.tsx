/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from "react";
import { strings } from "./app/strings";
import {
  Box,
  Breadcrumbs,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from "@mui/material";
import HomeIcon from "@mui/icons-material/Home";
import FolderIcon from "@mui/icons-material/Folder";

import { fetchPath } from "./app/transfer";
import { FileItem } from "./app/types";
import { isDirectory } from "./app/utils";

function MoveDialog({
  open,
  sourceKeys,
  onClose,
  onMove,
  onError,
}: {
  open: boolean;
  sourceKeys: string[];
  onClose: () => void;
  onMove: (destination: string) => void;
  onError: (error: Error) => void;
}) {
  const [cwd, setCwd] = useState("");
  const [folders, setFolders] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async (path: string) => {
    setLoading(true);
    try {
      const items = await fetchPath(path);
      setFolders(items.filter((item) => isDirectory(item)));
    } catch (error) {
      onError(error as Error);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (open) {
      setCwd("");
      load("");
    }
  }, [open]);

  const navigate = (path: string) => {
    setCwd(path);
    load(path);
  };

  const parts = cwd.replace(/\/$/, "").split("/").filter(Boolean);
  const isSourceDir = sourceKeys.some((key) => {
    const name = key.replace(/\/$/, "").split("/").pop() ?? "";
    const parent = key.slice(0, key.length - name.length);
    return parent === cwd;
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{strings.chooseTargetFolder}</DialogTitle>
      <DialogContent>
        <Breadcrumbs separator="›" sx={{ paddingY: 1 }}>
          <Button size="small" onClick={() => navigate("")}>
            <HomeIcon fontSize="small" />
          </Button>
          {parts.map((part, index) =>
            index === parts.length - 1 ? (
              <Typography key={index} color="text.primary">
                {part}
              </Typography>
            ) : (
              <Link
                key={index}
                component="button"
                onClick={() =>
                  navigate(parts.slice(0, index + 1).join("/") + "/")
                }
              >
                {part}
              </Link>
            )
          )}
        </Breadcrumbs>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", padding: 3 }}>
            <CircularProgress />
          </Box>
        ) : folders.length === 0 ? (
          <Typography sx={{ textAlign: "center" }} color="text.secondary">
            {strings.noSubFolders}
          </Typography>
        ) : (
          <List>
            {folders.map((folder) => (
              <ListItemButton
                key={folder.key}
                onClick={() => navigate(folder.key + "/")}
              >
                <ListItemIcon>
                  <FolderIcon />
                </ListItemIcon>
                <ListItemText primary={folder.name} />
              </ListItemButton>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{strings.cancel}</Button>
        <Button
          variant="contained"
          disabled={isSourceDir}
          onClick={() => onMove(cwd)}
        >
          {strings.moveHere}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default MoveDialog;
