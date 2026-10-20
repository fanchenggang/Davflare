import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DownloadIcon from "@mui/icons-material/Download";
import PhoneIphoneIcon from "@mui/icons-material/PhoneIphone";

import {
  MOBILE_UPLOAD_API_KEY_PLACEHOLDER,
  MOBILE_UPLOAD_DEFAULT_PATH,
  androidRecipeFilename,
  buildAndroidHttpShortcutRecipeJson,
  buildMobileImagesCurl,
  buildMobileUploadCurl,
  buildMobileUploadValuesBlock,
  downloadTextFile,
  imagesApiUrl,
  uploadApiUrl,
} from "./app/mobileUpload";
import { NotifyFn } from "./app/notify";
import { strings, translate } from "./app/strings";

/**
 * Settings card: iOS Shortcuts + Android HTTP Shortcuts recipes for phone upload.
 * Always uses YOUR_API_KEY — never embeds a live key. No new APIs.
 */
function MobileUploadCard({
  origin = typeof window !== "undefined" ? window.location.origin : "",
  onNotify,
}: {
  origin?: string;
  onNotify: NotifyFn;
}) {
  const [folderPath, setFolderPath] = useState(MOBILE_UPLOAD_DEFAULT_PATH);

  const uploadUrl = useMemo(
    () => uploadApiUrl(origin, folderPath),
    [origin, folderPath]
  );
  const imagesUrl = useMemo(() => imagesApiUrl(origin), [origin]);
  const valuesBlock = useMemo(
    () => buildMobileUploadValuesBlock(origin, folderPath),
    [origin, folderPath]
  );
  const uploadCurl = useMemo(
    () => buildMobileUploadCurl(origin, folderPath),
    [origin, folderPath]
  );
  const imagesCurl = useMemo(() => buildMobileImagesCurl(origin), [origin]);
  const androidUploadJson = useMemo(
    () => buildAndroidHttpShortcutRecipeJson(origin, folderPath, "upload"),
    [origin, folderPath]
  );
  const androidImagesJson = useMemo(
    () => buildAndroidHttpShortcutRecipeJson(origin, folderPath, "images"),
    [origin, folderPath]
  );
  const iosRecipe = translate("mobileUploadIosRecipe", {
    uploadUrl,
    imagesUrl,
    placeholder: MOBILE_UPLOAD_API_KEY_PLACEHOLDER,
  });

  const copy = async (text: string, okMessage: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onNotify(okMessage, "success");
    } catch {
      onNotify(strings.mobileUploadCopyFailed, "error");
    }
  };

  const downloadRecipe = (mode: "upload" | "images") => {
    try {
      const content =
        mode === "images" ? androidImagesJson : androidUploadJson;
      downloadTextFile(androidRecipeFilename(mode), content);
      onNotify(strings.mobileUploadDownloaded, "success");
    } catch {
      onNotify(strings.mobileUploadDownloadFailed, "error");
    }
  };

  return (
    <Box
      component="section"
      aria-label={strings.mobileUploadTitle}
      data-testid="mobile-upload-card"
      sx={{
        px: 1.5,
        py: 1.5,
        borderRadius: 2,
        border: "1px solid",
        borderColor: "divider",
        backgroundColor: "background.paper",
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
        <PhoneIphoneIcon fontSize="small" color="primary" aria-hidden />
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {strings.mobileUploadTitle}
        </Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {strings.mobileUploadHint}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {translate("mobileUploadKeyHint", {
          placeholder: MOBILE_UPLOAD_API_KEY_PLACEHOLDER,
        })}
      </Typography>

      <TextField
        size="small"
        fullWidth
        label={strings.mobileUploadPathLabel}
        helperText={strings.mobileUploadPathHint}
        value={folderPath}
        onChange={(event) => setFolderPath(event.target.value)}
        inputProps={{ "data-testid": "mobile-upload-path" }}
        sx={{ mb: 1.5 }}
      />

      <Stack spacing={1.5}>
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
            {strings.mobileUploadValuesTitle}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
            {strings.mobileUploadValuesHint}
          </Typography>
          <Box
            component="pre"
            data-testid="mobile-upload-values-preview"
            sx={{
              m: 0,
              mb: 0.75,
              p: 1,
              borderRadius: 1,
              bgcolor: "surface.code",
              color: "surface.codeText",
              fontSize: 11,
              overflow: "auto",
              maxHeight: 160,
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {valuesBlock}
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button
              size="small"
              startIcon={<ContentCopyIcon />}
              onClick={() =>
                void copy(valuesBlock, strings.mobileUploadValuesCopied)
              }
            >
              {strings.mobileUploadCopyValues}
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<ContentCopyIcon />}
              onClick={() =>
                void copy(uploadUrl, strings.mobileUploadUploadUrlCopied)
              }
            >
              {strings.mobileUploadCopyUploadUrl}
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<ContentCopyIcon />}
              onClick={() =>
                void copy(imagesUrl, strings.mobileUploadImagesUrlCopied)
              }
            >
              {strings.mobileUploadCopyImagesUrl}
            </Button>
          </Stack>
        </Box>

        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
            {strings.mobileUploadIosTitle}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
            {strings.mobileUploadIosHint}
          </Typography>
          <Box
            component="pre"
            data-testid="mobile-upload-ios-preview"
            sx={{
              m: 0,
              mb: 0.75,
              p: 1,
              borderRadius: 1,
              bgcolor: "surface.code",
              color: "surface.codeText",
              fontSize: 11,
              overflow: "auto",
              maxHeight: 220,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {iosRecipe}
          </Box>
          <Button
            size="small"
            startIcon={<ContentCopyIcon />}
            onClick={() => void copy(iosRecipe, strings.mobileUploadIosCopied)}
          >
            {strings.mobileUploadCopyIos}
          </Button>
        </Box>

        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
            {strings.mobileUploadAndroidTitle}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
            {strings.mobileUploadAndroidHint}
          </Typography>
          <Box
            component="pre"
            data-testid="mobile-upload-android-preview"
            sx={{
              m: 0,
              mb: 0.75,
              p: 1,
              borderRadius: 1,
              bgcolor: "surface.code",
              color: "surface.codeText",
              fontSize: 11,
              overflow: "auto",
              maxHeight: 180,
            }}
          >
            {androidUploadJson.trimEnd()}
          </Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mb: 0.75 }}
            data-testid="mobile-upload-curl-preview"
          >
            {uploadCurl}
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button
              size="small"
              startIcon={<ContentCopyIcon />}
              onClick={() =>
                void copy(androidUploadJson, strings.mobileUploadAndroidCopied)
              }
            >
              {strings.mobileUploadCopyAndroid}
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={() => downloadRecipe("upload")}
            >
              {strings.mobileUploadDownloadAndroid}
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<ContentCopyIcon />}
              onClick={() =>
                void copy(uploadCurl, strings.mobileUploadCurlCopied)
              }
            >
              {strings.mobileUploadCopyCurl}
            </Button>
            <Button
              size="small"
              variant="text"
              startIcon={<ContentCopyIcon />}
              onClick={() =>
                void copy(imagesCurl, strings.mobileUploadImagesCurlCopied)
              }
            >
              {strings.mobileUploadCopyImagesCurl}
            </Button>
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
}

export default MobileUploadCard;
