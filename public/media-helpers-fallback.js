(function () {
  if (window.MediaHelpers) return;
  const MEDIA_EXT =
    "gif|png|jpe?g|webp|bmp|avif|svg|heic|heif|mp4|webm|mov|m4v|mkv|avi|wmv|flv|ogv|3gp|mpeg|mpg";
  const MEDIA_RE = new RegExp(`\\.(${MEDIA_EXT})$`, "i");
  const IMAGE_RE = /\.(gif|png|jpe?g|webp|bmp|avif|svg|heic|heif)$/i;
  const VIDEO_RE = /\.(mp4|webm|mov|m4v|mkv|avi|wmv|flv|ogv|3gp|mpeg|mpg)$/i;
  window.MediaHelpers = {
    isMediaFile(name) {
      return MEDIA_RE.test(name || "");
    },
    isImageFile(name) {
      return IMAGE_RE.test(name || "");
    },
    isVideoFile(name) {
      return VIDEO_RE.test(name || "");
    },
    stripMediaExt(filename) {
      return String(filename).replace(new RegExp(`\\.(${MEDIA_EXT})$`, "i"), "");
    },
    mediaTypeFor(filename) {
      return IMAGE_RE.test(filename || "") ? "image" : "video";
    },
  };
})();
