const MEDIA_EXT_PATTERN =
  "gif|png|jpe?g|webp|bmp|avif|svg|heic|heif|mp4|webm|mov|m4v|mkv|avi|wmv|flv|ogv|3gp|mpeg|mpg";

const MEDIA_RE = new RegExp(`\\.(${MEDIA_EXT_PATTERN})$`, "i");
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
  if (m.startsWith("image/")) return ".jpg";
  if (m.startsWith("video/")) return ".mp4";
  return ".mp4";
}

function mediaTypeFor(filename) {
  return isImageFile(filename) ? "image" : "video";
}

function isAllowedUpload(name, mime) {
  const n = name || "";
  const m = (mime || "").toLowerCase();
  if (isMediaFile(n)) return true;
  if (m.startsWith("video/") || m.startsWith("image/")) return true;
  if (m.includes("heic") || m.includes("heif")) return true;
  return false;
}

module.exports = {
  MEDIA_RE,
  IMAGE_RE,
  VIDEO_RE,
  MEDIA_EXT_PATTERN,
  isMediaFile,
  isImageFile,
  isVideoFile,
  stripMediaExt,
  extFromMime,
  mediaTypeFor,
  isAllowedUpload,
};
