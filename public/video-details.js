/**
 * File details bottom sheet — profile grid and feed.
 */
window.RolloVideoDetails = (function () {
  let backdrop = null;
  let sheet = null;
  let bodyEl = null;
  let actionsEl = null;
  let hooks = null;

  function ensureDom() {
    if (sheet) return;
    backdrop = document.createElement("div");
    backdrop.className = "sheet-backdrop video-details-backdrop";

    sheet = document.createElement("div");
    sheet.className = "sheet video-details-sheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    sheet.innerHTML = `
      <h2>File details</h2>
      <div class="video-details-body"></div>
      <div class="video-details-actions"></div>
    `;
    bodyEl = sheet.querySelector(".video-details-body");
    actionsEl = sheet.querySelector(".video-details-actions");
    backdrop.addEventListener("click", close);
    document.body.append(backdrop, sheet);
  }

  function close() {
    if (!sheet) return;
    backdrop.classList.remove("open");
    sheet.classList.remove("open");
  }

  function row(label, value) {
    const el = document.createElement("div");
    el.className = "video-details-row";
    el.innerHTML = `<span class="video-details-label">${label}</span><span class="video-details-value">${value}</span>`;
    return el;
  }

  function actionBtn(label, { primary, danger, onClick } = {}) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "action-btn" + (primary ? " sheet-primary" : "") + (danger ? " danger" : "");
    btn.textContent = label;
    btn.addEventListener("click", () => {
      const ret = onClick?.();
      if (ret?.then) ret.finally(() => close());
      else close();
    });
    return btn;
  }

  function open(video, opts = {}) {
    if (!video) return;
    ensureDom();
    hooks = opts;

    const D = window.RolloDuration;
    const isImage = video.mediaType === "image";
    const esc = (s) => hooks.escapeHtml?.(String(s ?? "")) ?? String(s ?? "");

    bodyEl.replaceChildren();
    bodyEl.appendChild(row("Filename", esc(video.name)));
    bodyEl.appendChild(row("Display name", esc(video.displayName || hooks.stripExt?.(video.name) || "—")));
    bodyEl.appendChild(row("Size", esc(D?.formatBytes?.(video.size) || "—")));
    if (!isImage) {
      bodyEl.appendChild(row("Duration", esc(D?.format?.(video.durationSec) || "—")));
      bodyEl.appendChild(row("Quality", esc(D?.qualityLabel?.(video.height) || "—")));
      if (video.width && video.height) {
        bodyEl.appendChild(row("Resolution", esc(`${video.width}×${video.height}`)));
      }
    }
    if (video.tags?.length) {
      bodyEl.appendChild(row("Tags", esc(video.tags.join(", "))));
    }

    actionsEl.replaceChildren();
    if (hooks.onShare) actionsEl.appendChild(actionBtn("Share", { onClick: () => hooks.onShare(video) }));
    if (hooks.onEditTags) {
      actionsEl.appendChild(actionBtn("Edit tags", { primary: true, onClick: () => hooks.onEditTags(video) }));
    }
    if (hooks.onRename) actionsEl.appendChild(actionBtn("Rename", { onClick: () => hooks.onRename(video) }));
    if (hooks.onDelete) actionsEl.appendChild(actionBtn("Delete", { danger: true, onClick: () => hooks.onDelete(video) }));
    actionsEl.appendChild(actionBtn("Cancel", { onClick: close }));

    requestAnimationFrame(() => {
      backdrop.classList.add("open");
      sheet.classList.add("open");
    });
  }

  return { open, close };
})();
