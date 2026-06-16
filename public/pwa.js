(function () {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(function () {
      /* offline shell is optional */
    });
  });
})();

/* Block Safari pinch-zoom / page gestures while radial menu or long-press is active */
(function () {
  function shouldBlockGesture() {
    return (
      document.body.classList.contains("menu-active") ||
      document.body.classList.contains("tag-palette-active") ||
      !!document.querySelector(
        ".press-radial-armed, .press-radial-holding, .tag-palette-armed, .tag-palette-holding"
      )
    );
  }

  function blockTouchMove(e) {
    if (shouldBlockGesture()) e.preventDefault();
  }

  function blockGesture(e) {
    if (shouldBlockGesture()) e.preventDefault();
  }

  ["gesturestart", "gesturechange", "gestureend"].forEach((type) => {
    document.addEventListener(type, blockGesture, { passive: false });
  });

  document.addEventListener("touchmove", blockTouchMove, { passive: false });
})();
