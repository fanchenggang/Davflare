import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  ContentCopy as ContentCopyIcon,
  Delete as DeleteIcon,
  Image as ImageIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";

import ConfirmDialog from "./ConfirmDialog";
import EmptyState from "./EmptyState";
import { useFeatures } from "./app/features";
import { HostedImage, deleteImage, listImages, uploadImage } from "./app/images";
import { NotifyFn } from "./app/notify";
import { strings, translate } from "./app/strings";
import { errorMessage, humanReadableSize } from "./app/utils";

function isImageFile(file: File) {
  if (file.type.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i.test(file.name);
}

function ImagesView({
  onNotify,
  onGoFiles,
}: {
  onNotify: NotifyFn;
  onGoFiles?: () => void;
}) {
  const { sitesHost, flags } = useFeatures();
  const [images, setImages] = useState<HostedImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [dropActive, setDropActive] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<HostedImage | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await listImages();
      setImages(data.images);
    } catch (error) {
      onNotify(errorMessage(error), "error");
    }
  }, [onNotify]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const uploadFiles = async (files: File[]) => {
    const imagesOnly = files.filter(isImageFile);
    if (imagesOnly.length === 0) {
      onNotify(strings.notAnImage, "error");
      return;
    }
    if (imagesOnly.length < files.length) {
      onNotify(strings.notAnImage, "error");
    }
    for (const file of imagesOnly) {
      try {
        const created = await uploadImage(file);
        setImages((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
        onNotify(translate("uploadedToast", { name: created.name }), "success");
      } catch (error) {
        onNotify(errorMessage(error), "error");
      }
    }
  };

  const copy = async (text: string, ok: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onNotify(ok, "success");
    } catch {
      onNotify(strings.copyFailed2, "error");
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    try {
      await deleteImage(target.id);
      setImages((prev) => prev.filter((item) => item.id !== target.id));
      onNotify(strings.imageDeleted, "success");
    } catch (error) {
      onNotify(errorMessage(error), "error");
    }
  };

  if (!flags.imageHost) return null;

  if (loading) {
    return (
      <Box sx={{ px: 2, py: 2 }}>
        {Array.from({ length: 3 }).map((_, index) => (
          <Box key={index} sx={{ py: 1.25 }}>
            <Skeleton variant="text" width="30%" height={28} />
            <Skeleton variant="text" width="70%" />
          </Box>
        ))}
      </Box>
    );
  }

  return (
    <Box
      onDragEnter={(event) => {
        if (event.dataTransfer?.types && Array.from(event.dataTransfer.types).includes("Files")) {
          event.preventDefault();
          setDropActive(true);
        }
      }}
      onDragOver={(event) => {
        if (event.dataTransfer?.types && Array.from(event.dataTransfer.types).includes("Files")) {
          event.preventDefault();
          setDropActive(true);
        }
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDropActive(false);
        const files = Array.from(event.dataTransfer?.files || []);
        if (files.length) void uploadFiles(files);
      }}
      sx={{ position: "relative", minHeight: 280 }}
    >
      <Box sx={{ px: 2, py: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
          <Typography variant="h6">{strings.imagesTitle}</Typography>
          <IconButton size="small" onClick={() => load()} aria-label={strings.refresh}>
            <RefreshIcon fontSize="small" />
          </IconButton>
          <Button
            size="small"
            variant="contained"
            onClick={() => fileInputRef.current?.click()}
          >
            {strings.uploadImages}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(event) => {
              const files = Array.from(event.target.files || []);
              event.target.value = "";
              if (files.length) void uploadFiles(files);
            }}
          />
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {strings.imagesHint}
        </Typography>
      </Box>
      {!sitesHost && (
        <Alert severity="warning" sx={{ mx: 2, mb: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {strings.imagesHostMissing}
          </Typography>
          <Typography variant="body2">{strings.imagesHostMissingHint}</Typography>
        </Alert>
      )}
      {images.length === 0 ? (
        <EmptyState
          variant="folder"
          icon={<ImageIcon />}
          title={strings.emptyImages}
          description={strings.emptyImagesHint}
          actions={
            onGoFiles ? (
              <Button variant="contained" onClick={onGoFiles}>
                {strings.goToFiles}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <List>
          {images.map((image) => (
            <ListItem
              key={image.id}
              sx={{
                mx: 1,
                mb: 0.5,
                borderRadius: 2,
                border: "1px solid",
                borderColor: "divider",
                backgroundColor: "background.paper",
              }}
              secondaryAction={
                <Stack direction="row" spacing={0.5}>
                  <Tooltip title={strings.copyImageUrl}>
                    <span>
                      <IconButton
                        size="small"
                        disabled={!image.url}
                        aria-label={strings.copyImageUrl}
                        onClick={() => image.url && copy(image.url, strings.imageUrlCopied)}
                      >
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title={strings.copyImageMarkdown}>
                    <span>
                      <IconButton
                        size="small"
                        disabled={!image.markdown}
                        aria-label={strings.copyImageMarkdown}
                        onClick={() =>
                          image.markdown && copy(image.markdown, strings.imageMarkdownCopied)
                        }
                      >
                        <Typography variant="caption" sx={{ fontWeight: 700 }}>
                          MD
                        </Typography>
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title={strings.deleteImage}>
                    <IconButton
                      size="small"
                      aria-label={strings.deleteImage}
                      onClick={() => setPendingDelete(image)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              }
            >
              <ListItemText
                primary={image.name}
                secondary={[
                  image.url || strings.imagesHostMissing,
                  humanReadableSize(image.size),
                  new Date(image.uploaded).toLocaleString(),
                ].join(" · ")}
                primaryTypographyProps={{ noWrap: true, title: image.name }}
                secondaryTypographyProps={{ sx: { wordBreak: "break-all" } }}
              />
            </ListItem>
          ))}
        </List>
      )}
      {dropActive && (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(243, 128, 32, 0.12)",
            border: "2px dashed",
            borderColor: "primary.main",
            zIndex: 2,
            pointerEvents: "none",
          }}
        >
          <Typography variant="h6" color="primary.main">
            {strings.dropToUploadImage}
          </Typography>
        </Box>
      )}
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={strings.deleteImage}
        message={strings.deleteImageConfirm}
        confirmText={strings.deleteImage}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => void handleDelete()}
      />
    </Box>
  );
}

export default ImagesView;
