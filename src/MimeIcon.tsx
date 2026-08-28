import ArticleIcon from "@mui/icons-material/Article";
import AudioFileIcon from "@mui/icons-material/AudioFile";
import CodeIcon from "@mui/icons-material/Code";
import CssIcon from "@mui/icons-material/Css";
import DataObjectIcon from "@mui/icons-material/DataObject";
import FolderIcon from "@mui/icons-material/Folder";
import FolderZipOutlinedIcon from "@mui/icons-material/FolderZipOutlined";
import HtmlIcon from "@mui/icons-material/Html";
import ImageIcon from "@mui/icons-material/Image";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import JavascriptIcon from "@mui/icons-material/Javascript";
import PdfIcon from "@mui/icons-material/PictureAsPdf";
import TableChartIcon from "@mui/icons-material/TableChart";
import TerminalIcon from "@mui/icons-material/Terminal";
import VideoFileIcon from "@mui/icons-material/VideoFile";

import { fileIconKind } from "./app/preview";

const KIND_COLOR: Record<string, string> = {
  folder: "#f38020",
  json: "#c47b1a",
  html: "#d35426",
  css: "#3b6ea8",
  js: "#b8860b",
  code: "#3d6b99",
  text: "#5c6b7a",
  csv: "#3d7a4a",
  shell: "#4a5560",
};

function MimeIcon({ contentType, name, fontSize = "large" }: { contentType: string; name?: string; fontSize?: "inherit" | "large" | "medium" | "small"; }) {
  const kind = fileIconKind({ contentType, name });
  const color = KIND_COLOR[kind];
  const sx = color ? { color } : undefined;
  if (kind === "folder") return <FolderIcon fontSize={fontSize} sx={sx} />;
  if (kind === "image") return <ImageIcon fontSize={fontSize} sx={sx} />;
  if (kind === "audio") return <AudioFileIcon fontSize={fontSize} sx={sx} />;
  if (kind === "video") return <VideoFileIcon fontSize={fontSize} sx={sx} />;
  if (kind === "pdf") return <PdfIcon fontSize={fontSize} sx={sx} />;
  if (kind === "zip") return <FolderZipOutlinedIcon fontSize={fontSize} sx={sx} />;
  if (kind === "json") return <DataObjectIcon fontSize={fontSize} sx={sx} />;
  if (kind === "html") return <HtmlIcon fontSize={fontSize} sx={sx} />;
  if (kind === "css") return <CssIcon fontSize={fontSize} sx={sx} />;
  if (kind === "js") return <JavascriptIcon fontSize={fontSize} sx={sx} />;
  if (kind === "csv") return <TableChartIcon fontSize={fontSize} sx={sx} />;
  if (kind === "shell") return <TerminalIcon fontSize={fontSize} sx={sx} />;
  if (kind === "text") return <ArticleIcon fontSize={fontSize} sx={sx} />;
  if (kind === "code") return <CodeIcon fontSize={fontSize} sx={sx} />;
  return <InsertDriveFileOutlinedIcon fontSize={fontSize} />;
}

export default MimeIcon;
