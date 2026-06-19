const TEXT_EXT_PATTERN = "txt|md|markdown|csv|tsv|json|log|yaml|yml|xml|rtf|ini|cfg|conf|toml";
const HTML_EXT_PATTERN = "html?";
const PDF_EXT_PATTERN = "pdf";
const MEDIA_EXT_PATTERN =
  `${TEXT_EXT_PATTERN}|${HTML_EXT_PATTERN}|${PDF_EXT_PATTERN}|gif|png|jpe?g|webp|bmp|avif|svg|heic|heif|mp4|webm|mov|m4v|mkv|avi|wmv|flv|ogv|3gp|mpeg|mpg`;

const MEDIA_RE = new RegExp(`\\.(${MEDIA_EXT_PATTERN})$`, "i");
const TEXT_RE = new RegExp(`\\.(${TEXT_EXT_PATTERN})$`, "i");
const HTML_RE = new RegExp(`\\.(${HTML_EXT_PATTERN})$`, "i");
const PDF_RE = new RegExp(`\\.(${PDF_EXT_PATTERN})$`, "i");
const IMAGE_RE = /\.(gif|png|jpe?g|webp|bmp|avif|svg|heic|heif)$/i;
const VIDEO_RE = /\.(mp4|webm|mov|m4v|mkv|avi|wmv|flv|ogv|3gp|mpeg|mpg)$/i;

function isMediaFile(name) {
  return MEDIA_RE.test(name || "");
}

function isImageFile(name) {
  return IMAGE_RE.test(name || "");
}

function isVideoFile(name) {
  return VIDEO_RE.test(name || "");
}

function isTextFile(name) {
  return TEXT_RE.test(name || "");
}

function isPdfFile(name) {
  return PDF_RE.test(name || "");
}

function isHtmlFile(name) {
  return HTML_RE.test(name || "");
}

function stripMediaExt(filename) {
  return String(filename).replace(new RegExp(`\\.(${MEDIA_EXT_PATTERN})$`, "i"), "");
}

function extFromMime(mime) {
  if (!mime) return ".mp4";
  const m = mime.toLowerCase();
  if (m.includes("gif")) return ".gif";
  if (m.includes("png")) return ".png";
  if (m.includes("jpeg") || m.includes("jpg")) return ".jpg";
  if (m.includes("webp")) return ".webp";
  if (m.includes("bmp")) return ".bmp";
  if (m.includes("avif")) return ".avif";
  if (m.includes("svg")) return ".svg";
  if (m.includes("heic")) return ".heic";
  if (m.includes("heif")) return ".heif";
  if (m.includes("webm")) return ".webm";
  if (m.includes("quicktime") || m.includes("mov")) return ".mov";
  if (m.includes("m4v")) return ".m4v";
  if (m.includes("matroska") || m.includes("mkv")) return ".mkv";
  if (m.includes("x-msvideo") || m.includes("avi")) return ".avi";
  if (m.includes("x-flv") || m.includes("flv")) return ".flv";
  if (m.includes("ogg")) return ".ogv";
  if (m.includes("3gpp")) return ".3gp";
  if (m.includes("mpeg")) return ".mpg";
  if (m.includes("markdown")) return ".md";
  if (m.includes("csv")) return ".csv";
  if (m.includes("json")) return ".json";
  if (m.includes("xml")) return ".xml";
  if (m.includes("yaml")) return ".yml";
  if (m.includes("pdf")) return ".pdf";
  if (m.includes("html")) return ".html";
  if (m.startsWith("text/")) return ".txt";
  if (m.startsWith("image/")) return ".jpg";
  if (m.startsWith("video/")) return ".mp4";
  return ".mp4";
}

function mediaTypeFor(filename) {
  if (isImageFile(filename)) return "image";
  if (isPdfFile(filename)) return "pdf";
  if (isHtmlFile(filename)) return "html";
  if (isTextFile(filename)) return "text";
  return "video";
}

function isAllowedUpload(name, mime) {
  const n = name || "";
  const m = (mime || "").toLowerCase();
  if (isMediaFile(n)) return true;
  if (m.startsWith("video/") || m.startsWith("image/") || m.startsWith("text/")) return true;
  if (m.includes("heic") || m.includes("heif")) return true;
  if (m.includes("json") || m.includes("csv") || m.includes("xml") || m.includes("pdf") || m.includes("html")) return true;
  return false;
}

module.exports = {
  MEDIA_RE,
  TEXT_RE,
  HTML_RE,
  PDF_RE,
  IMAGE_RE,
  VIDEO_RE,
  MEDIA_EXT_PATTERN,
  TEXT_EXT_PATTERN,
  HTML_EXT_PATTERN,
  PDF_EXT_PATTERN,
  isMediaFile,
  isImageFile,
  isVideoFile,
  isTextFile,
  isHtmlFile,
  isPdfFile,
  stripMediaExt,
  extFromMime,
  mediaTypeFor,
  isAllowedUpload,
};
