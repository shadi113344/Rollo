(function () {
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

  function mediaTypeFor(filename) {
    return isImageFile(filename) ? "image" : "video";
  }

  window.MediaHelpers = {
    isMediaFile,
    isImageFile,
    isVideoFile,
    stripMediaExt,
    mediaTypeFor,
  };
})();
