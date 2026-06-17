window.RolloTheme = (function () {
  const KEY = "rolloTheme";

  const META_COLORS = {
    dark: "#0a0a0a",
    light: "#f2f2f7",
  };

  function get() {
    return localStorage.getItem(KEY) || "dark";
  }

  function updateMeta(theme) {
    const color = META_COLORS[theme] || META_COLORS.dark;
    document.querySelectorAll('meta[name="theme-color"]').forEach((el) => {
      el.setAttribute("content", color);
    });
    const apple = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (apple) {
      apple.setAttribute("content", theme === "light" ? "default" : "black-translucent");
    }
  }

  function apply(theme) {
    const next = theme === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(KEY, next);
    updateMeta(next);
    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      btn.textContent = next === "light" ? "Dark mode" : "Light mode";
      btn.setAttribute("aria-pressed", next === "light" ? "true" : "false");
    });
    const select = document.getElementById("settings-theme");
    if (select && select.value !== next) select.value = next;
    return next;
  }

  function toggle() {
    return apply(get() === "light" ? "dark" : "light");
  }

  function init() {
    apply(get());
    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => toggle());
    });
    document.getElementById("settings-theme")?.addEventListener("change", (e) => {
      apply(e.target.value);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => apply(get()));
  } else {
    apply(get());
  }

  return { get, apply, toggle, init };
})();
