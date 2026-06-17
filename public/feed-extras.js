/**
 * Feed UX: PiP, swipe-down to profile, double-tap like, earlier preload, captions.
 */
window.RolloFeedExtras = (function () {
  let hooks = null;
  let touchStartY = 0;
  let touchStartX = 0;
  let lastTapAt = 0;
  let lastTapIndex = -1;

  function addPipButton() {
    /* PiP is created inline in watch.html createCard for correct control-stack alignment. */
  }

  function addCaption() {
    /* Caption lives on #seek-bar in watch.html */
  }

  function setupSwipeDown() {
    const feed = document.getElementById("feed");
    if (!feed) return;
    feed.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length !== 1) return;
        touchStartY = e.touches[0].clientY;
        touchStartX = e.touches[0].clientX;
      },
      { passive: true }
    );
    feed.addEventListener(
      "touchend",
      (e) => {
        if (e.changedTouches.length !== 1) return;
        const dy = e.changedTouches[0].clientY - touchStartY;
        const dx = e.changedTouches[0].clientX - touchStartX;
        const atTop = feed.scrollTop <= 4;
        if (atTop && dy > 90 && Math.abs(dx) < 60) {
          hooks?.goProfile?.();
        }
      },
      { passive: true }
    );
  }

  function bindDoubleTapLike(card, video, onLike) {
    card.addEventListener("click", (e) => {
      if (e.target.closest("button, a, input, .card-tag")) return;
      const now = Date.now();
      const index = Number(card.dataset.index);
      if (now - lastTapAt < 320 && lastTapIndex === index) {
        e.preventDefault();
        onLike?.(video);
        lastTapAt = 0;
        lastTapIndex = -1;
        return;
      }
      lastTapAt = now;
      lastTapIndex = index;
    });
  }

  function patchPreload(preloadNearby) {
    return function patched(index) {
      const radius = 3;
      for (let i = index - radius; i <= index + radius; i++) {
        if (i < 0) continue;
        hooks?.ensureCardSrc?.(i, i === index ? "auto" : i <= index + 1 ? "auto" : "metadata");
      }
      if (typeof preloadNearby === "function") preloadNearby(index);
    };
  }

  function init(options) {
    hooks = options;
    setupSwipeDown();
    return {
      addPipButton,
      addCaption,
      bindDoubleTapLike,
      patchPreload,
    };
  }

  return { init };
})();
