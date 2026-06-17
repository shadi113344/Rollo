/**
 * Feed UX: PiP, swipe-down to profile, double-tap like, earlier preload, lock badge, captions.
 */
window.RolloFeedExtras = (function () {
  let hooks = null;
  let touchStartY = 0;
  let touchStartX = 0;
  let lastTapAt = 0;
  let lastTapIndex = -1;

  function addLockBadge() {
    const chrome = document.getElementById("chrome-top");
    if (!chrome || chrome.querySelector("#feed-lock-badge")) return;
    const group = hooks?.getActiveGroup?.();
    const locked = hooks?.isGroupLocked?.(group);
    const badge = document.createElement("span");
    badge.id = "feed-lock-badge";
    badge.className = "feed-lock-badge";
    badge.hidden = !locked;
    badge.title = locked ? "This library is locked" : "";
    badge.innerHTML = window.RolloIcons?.lock(14) || "🔒";
    chrome.insertBefore(badge, chrome.firstChild);
  }

  function updateLockBadge() {
    const badge = document.getElementById("feed-lock-badge");
    if (!badge) return;
    const locked = hooks?.isGroupLocked?.(hooks?.getActiveGroup?.());
    badge.hidden = !locked;
  }

  function addPipButton() {
    /* PiP is created inline in watch.html createCard for correct control-stack alignment. */
  }

  function addCaption(card, video) {
    const caption = (video.displayName || "").trim();
    if (!caption) return null;
    const el = document.createElement("div");
    el.className = "feed-caption allow-select";
    el.contentEditable = hooks?.onSaveCaption ? "true" : "false";
    el.setAttribute("role", hooks?.onSaveCaption ? "textbox" : "note");
    el.setAttribute("aria-label", "Caption");
    el.spellcheck = false;
    el.textContent = caption || "";
    if (hooks?.onSaveCaption) {
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          el.blur();
        }
      });
      el.addEventListener("blur", () => {
        const next = el.textContent.trim();
        const prev = (video.displayName || "").trim();
        if (next && next !== prev) hooks.onSaveCaption(video, next);
      });
    }
    card.appendChild(el);
    return el;
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
    addLockBadge();
    setupSwipeDown();
    return {
      addPipButton,
      addCaption,
      bindDoubleTapLike,
      patchPreload,
      updateLockBadge,
    };
  }

  return { init };
})();
