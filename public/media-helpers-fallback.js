(function () {
  const TEXT_EXT = "txt|md|markdown|csv|tsv|json|log|yaml|yml|xml|rtf|ini|cfg|conf|toml";
  const HTML_EXT = "html?";
  const PDF_EXT = "pdf";
  const MEDIA_EXT =
    `${TEXT_EXT}|${HTML_EXT}|${PDF_EXT}|gif|png|jpe?g|webp|bmp|avif|svg|heic|heif|mp4|webm|mov|m4v|mkv|avi|wmv|flv|ogv|3gp|mpeg|mpg`;
  const MEDIA_RE = new RegExp(`\\.(${MEDIA_EXT})$`, "i");
  const TEXT_RE = new RegExp(`\\.(${TEXT_EXT})$`, "i");
  const HTML_RE = new RegExp(`\\.(${HTML_EXT})$`, "i");
  const PDF_RE = new RegExp(`\\.(${PDF_EXT})$`, "i");
  const IMAGE_RE = /\.(gif|png|jpe?g|webp|bmp|avif|svg|heic|heif)$/i;
  const VIDEO_RE = /\.(mp4|webm|mov|m4v|mkv|avi|wmv|flv|ogv|3gp|mpeg|mpg)$/i;

  const defaults = {
    isMediaFile(name) {
      return MEDIA_RE.test(name || "");
    },
    isImageFile(name) {
      return IMAGE_RE.test(name || "");
    },
    isVideoFile(name) {
      return VIDEO_RE.test(name || "");
    },
    isTextFile(name) {
      return TEXT_RE.test(name || "");
    },
    isHtmlFile(name) {
      return HTML_RE.test(name || "");
    },
    isPdfFile(name) {
      return PDF_RE.test(name || "");
    },
    stripMediaExt(filename) {
      return String(filename).replace(new RegExp(`\\.(${MEDIA_EXT})$`, "i"), "");
    },
    mediaTypeFor(filename) {
      if (IMAGE_RE.test(filename || "")) return "image";
      if (PDF_RE.test(filename || "")) return "pdf";
      if (HTML_RE.test(filename || "")) return "html";
      if (TEXT_RE.test(filename || "")) return "text";
      return "video";
    },
  };

  const existing = window.MediaHelpers || {};
  window.MediaHelpers = { ...defaults, ...existing };
  Object.keys(defaults).forEach((key) => {
    if (typeof window.MediaHelpers[key] !== "function") {
      window.MediaHelpers[key] = defaults[key];
    }
  });
})();
