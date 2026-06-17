(function () {
  if (!("serviceWorker" in navigator)) return;

  function showUpdateToast(reg) {
    if (window.__rolloSwPromptShown) return;
    window.__rolloSwPromptShown = true;

    const apply = function () {
      if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
      else reg.update();
    };

    if (typeof Toast !== "undefined" && Toast.showAction) {
      Toast.showAction("App update available", "Update", apply);
      return;
    }
    if (window.confirm("A new version of Rollo is ready. Update now?")) apply();
  }

  window.addEventListener("load", function () {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(function (reg) {
        window.RolloShell = window.RolloShell || {};
        window.RolloShell.registration = reg;

        if (reg.waiting && navigator.serviceWorker.controller) {
          showUpdateToast(reg);
        }

        reg.addEventListener("updatefound", function () {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener("statechange", function () {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              showUpdateToast(reg);
            }
          });
        });
      })
      .catch(function () {
        /* offline shell is optional */
      });

    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (reloading) return;
      reloading = true;
      location.reload();
    });
  });

  window.RolloShell = window.RolloShell || {};
  window.RolloShell.loadVersion = async function () {
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      if (!res.ok) return null;
      const data = await res.json();
      window.RolloShell.version = data.shellVersion || null;
      window.RolloShell.appVersion = data.appVersion || null;
      return window.RolloShell.version;
    } catch {
      return null;
    }
  };
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
