(function () {
  // iOS standalone PWA only: position:fixed; bottom:0 (and innerHeight/dvh/svh/100%) report a
  // too-short viewport at first paint and don't reach the physical screen bottom until a swipe
  // forces a recompute. Only `lvh` knows the true height immediately. The fix (in bottom-nav.css,
  // watch.html, index.html) re-anchors fixed bottom bars from the TOP using lvh — but ONLY in the
  // installed iOS PWA. In Safari's browser mode bottom:0 already works and an lvh anchor would push
  // those bars behind the browser toolbar, so we gate the override behind this class.
  if (window.navigator && window.navigator.standalone === true) {
    document.documentElement.classList.add("ios-standalone");
  }

  // Dock height / bottom UI inset are derived in pure CSS now (calc with env()), so no runtime
  // measurement is needed. Kept as a no-op so existing callers of syncLayoutMetrics don't break.
  window.syncLayoutMetrics = function () {};
})();
