(function () {
  function svg(paths, size = 18, className = "ui-icon") {
    return (
      `<svg class="${className}" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
      `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
      `${paths}</svg>`
    );
  }

  function filledSvg(paths, size = 18, className = "ui-icon") {
    return (
      `<svg class="${className}" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
      `fill="currentColor" stroke="none" aria-hidden="true">${paths}</svg>`
    );
  }

  window.RolloIcons = {
    lock(size) {
      return svg(
        '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
        size
      );
    },

    tag(size) {
      return svg(
        '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7.5" cy="7.5" r="1.5" fill="currentColor" stroke="none"/>',
        size
      );
    },

    edit(size) {
      return svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>', size);
    },

    trash(size) {
      return svg(
        '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
        size
      );
    },

    move(size) {
      return svg(
        '<path d="M5 9l4-4 4 4"/><path d="M9 5v11"/><path d="M19 15l-4 4-4-4"/><path d="M15 19V8"/>',
        size
      );
    },

    star(filled, size) {
      if (filled) {
        return filledSvg(
          '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
          size
        );
      }
      return svg(
        '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
        size
      );
    },

    drag(size) {
      return svg('<line x1="4" y1="8" x2="20" y2="8"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="16" x2="20" y2="16"/>', size);
    },

    volume(muted, size) {
      if (muted) {
        return svg(
          '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>',
          size
        );
      }
      return svg(
        '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>',
        size
      );
    },

    actionLabel(iconHtml, text) {
      return `<span class="action-btn-inner">${iconHtml}<span class="action-btn-text">${text}</span></span>`;
    },

    setActionBtn(btn, iconHtml, text) {
      if (!btn) return;
      btn.innerHTML = this.actionLabel(iconHtml, text);
    },

    heart(filled) {
      return window.HeartIcon ? HeartIcon.svg(!!filled) : "";
    },
  };
})();
