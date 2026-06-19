(function () {
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

  function isHtmlFile(name) {
    return HTML_RE.test(name || "");
  }

  function isPdfFile(name) {
    return PDF_RE.test(name || "");
  }

  function stripMediaExt(filename) {
    return String(filename).replace(new RegExp(`\\.(${MEDIA_EXT_PATTERN})$`, "i"), "");
  }

  function mediaTypeFor(filename) {
    if (isImageFile(filename)) return "image";
    if (isPdfFile(filename)) return "pdf";
    if (isHtmlFile(filename)) return "html";
    if (isTextFile(filename)) return "text";
    return "video";
  }

  window.MediaHelpers = {
    isMediaFile,
    isImageFile,
    isVideoFile,
    isTextFile,
    isHtmlFile,
    isPdfFile,
    stripMediaExt,
    mediaTypeFor,
  };
})();
