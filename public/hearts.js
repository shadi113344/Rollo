(function () {
  const FILLED_PATH =
    "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z";

  const OUTLINE_PATH =
    "M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.5 15.24C7.03 14.04 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.03 5.54-7.5 8.74z";

  function svg(filled) {
    if (filled) {
      return `<svg class="heart-icon heart-filled" viewBox="0 0 24 24" aria-hidden="true"><path d="${FILLED_PATH}"/></svg>`;
    }
    return `<svg class="heart-icon heart-outline" viewBox="0 0 24 24" aria-hidden="true"><path d="${OUTLINE_PATH}"/></svg>`;
  }

  function mount(el, filled, { size = "", pop = false } = {}) {
    if (!el) return;
    const sizeClass = size || ["lg", "md", "sm"].find((c) => el.classList?.contains(c)) || "";
    el.className = ["heart-wrap", sizeClass, pop ? "heart-pop" : ""].filter(Boolean).join(" ");
    el.innerHTML = svg(filled);
    if (pop) {
      el.addEventListener("animationend", () => el.classList.remove("heart-pop"), { once: true });
    }
  }

  function update(el, filled, { pop = false } = {}) {
    if (!el) return;
    mount(el, filled, { pop });
  }

  window.HeartIcon = { svg, mount, update };
})();
