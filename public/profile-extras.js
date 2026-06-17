/**
 * Profile grid extras: scroll restore, drag-drop upload, bulk select/tag, virtualization.
 */
window.RolloProfileExtras = (function () {
  const SCROLL_KEY = "rolloProfileScroll";
  // Virtual grid disabled — caused blank profile grids on mobile when scroll/spacer math drifted.
  const VIRTUAL_THRESHOLD = Infinity;
  const ROW_BUFFER = 6;

  let hooks = null;
  let selectMode = false;
  const selected = new Set();
  let virtualState = null;

  function scrollKey() {
    const group = hooks?.getActiveGroup?.() || "";
    const view = hooks?.getProfileView?.() || "grid";
    const collection = hooks?.getCollectionTag?.() || "";
    return `${SCROLL_KEY}:${group}:${view}:${collection}`;
  }

  function saveScroll() {
    const el = hooks?.getAppScroll?.();
    if (!el) return;
    try {
      localStorage.setItem(scrollKey(), String(el.scrollTop));
    } catch {
      /* ignore */
    }
  }

  function restoreScroll() {
    const el = hooks?.getAppScroll?.();
    if (!el) return;
    try {
      if (sessionStorage.getItem("rolloFromWatch") !== "1") return;
      sessionStorage.removeItem("rolloFromWatch");
      const raw = localStorage.getItem(scrollKey());
      if (raw == null) return;
      requestAnimationFrame(() => {
        const max = Math.max(0, el.scrollHeight - el.clientHeight);
        el.scrollTop = Math.min(Number(raw) || 0, max);
      });
    } catch {
      /* ignore */
    }
  }

  function resetScroll() {
    const el = hooks?.getAppScroll?.();
    if (el) el.scrollTop = 0;
    try {
      sessionStorage.removeItem("rolloFromWatch");
    } catch {
      /* ignore */
    }
  }

  function setupDragDrop() {
    const targets = [hooks?.getAppScroll?.(), hooks?.getGrid?.()].filter(Boolean);
    const onDrag = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const onDrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const files = [...(e.dataTransfer?.files || [])];
      if (files.length) hooks?.onUploadFiles?.(files);
    };
    targets.forEach((el) => {
      el.addEventListener("dragenter", onDrag);
      el.addEventListener("dragover", onDrag);
      el.addEventListener("drop", onDrop);
    });
  }

  function updateBulkBar() {
    const bar = document.getElementById("bulk-action-bar");
    if (!bar) return;
    const count = selected.size;
    bar.hidden = !selectMode;
    bar.classList.toggle("visible", selectMode && count > 0);
    const label = bar.querySelector("[data-bulk-count]");
    if (label) label.textContent = `${count} selected`;
    const tagBtn = document.getElementById("bulk-tag-btn");
    if (tagBtn) tagBtn.disabled = count === 0;
  }

  function setSelectMode(on) {
    selectMode = on;
    if (!on) selected.clear();
    document.body.classList.toggle("bulk-select-mode", on);
    const btn = document.getElementById("bulk-select-btn");
    if (btn) btn.classList.toggle("active", on);
    hooks?.getGrid?.()?.querySelectorAll(".video-item").forEach((card) => {
      card.classList.toggle("selectable", on);
      card.classList.toggle("selected", on && selected.has(card.dataset.filename));
    });
    updateBulkBar();
    hooks?.onSelectModeChange?.();
  }

  function toggleSelect(filename) {
    if (!selectMode || !filename) return;
    if (selected.has(filename)) selected.delete(filename);
    else selected.add(filename);
    const card = hooks?.getGrid?.()?.querySelector(`.video-item[data-filename="${CSS.escape(filename)}"]`);
    card?.classList.toggle("selected", selected.has(filename));
    updateBulkBar();
  }

  function decorateCard(card, video) {
    if (!card || !video) return;
    card.dataset.filename = video.name;
    if (!selectMode) return;
    card.classList.add("selectable");
    const check = document.createElement("button");
    check.type = "button";
    check.className = "bulk-select-check";
    check.setAttribute("aria-label", `Select ${video.name}`);
    check.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleSelect(video.name);
    });
    card.prepend(check);
    card.addEventListener("click", (e) => {
      if (!selectMode) return;
      if (e.target.closest(".bulk-select-check")) return;
      e.preventDefault();
      e.stopPropagation();
      toggleSelect(video.name);
    }, true);
  }

  async function applyBulkTags(tags) {
    const names = [...selected];
    if (!names.length || !tags.length) return;
    for (const name of names) {
      const video = hooks?.findVideo?.(name);
      const merged = [...new Set([...(video?.tags || []), ...tags])];
      await hooks?.saveVideoTags?.(name, merged);
    }
    setSelectMode(false);
    hooks?.onGridRefresh?.();
    hooks?.showToast?.(`Tagged ${names.length} video${names.length === 1 ? "" : "s"}`);
  }

  function bindBulkUi() {
    document.getElementById("bulk-select-btn")?.addEventListener("click", () => {
      setSelectMode(!selectMode);
    });
    document.getElementById("bulk-cancel-btn")?.addEventListener("click", () => setSelectMode(false));
    document.getElementById("bulk-tag-btn")?.addEventListener("click", () => {
      hooks?.openBulkTagSheet?.([...selected], applyBulkTags);
    });
  }

  function estimateRowHeight() {
    const grid = hooks?.getGrid?.();
    if (!grid) return 180;
    const sample = grid.querySelector(".video-item");
    return sample ? sample.getBoundingClientRect().height + 8 : 180;
  }

  function columnsForGrid() {
    const grid = hooks?.getGrid?.();
    if (!grid) return 3;
    const w = grid.clientWidth || 360;
    if (grid.classList.contains("size-lg")) return Math.max(2, Math.floor(w / 220));
    if (grid.classList.contains("size-md")) return Math.max(2, Math.floor(w / 180));
    if (grid.classList.contains("size-sm")) return Math.max(2, Math.floor(w / 140));
    return Math.max(2, Math.floor(w / 110));
  }

  function renderVirtualSlice(videos, appendCard) {
    const grid = hooks?.getGrid?.();
    const scroll = hooks?.getAppScroll?.();
    if (!grid || !scroll || videos.length <= VIRTUAL_THRESHOLD) {
      virtualState = null;
      videos.forEach((v) => appendCard(v));
      return;
    }

    const cols = columnsForGrid();
    const rowH = estimateRowHeight();
    const totalRows = Math.ceil(videos.length / cols);
    const top = scroll.scrollTop;
    const viewH = scroll.clientHeight;
    const startRow = Math.max(0, Math.floor(top / rowH) - ROW_BUFFER);
    const endRow = Math.min(totalRows, Math.ceil((top + viewH) / rowH) + ROW_BUFFER);
    const start = startRow * cols;
    const end = Math.min(videos.length, endRow * cols);

    virtualState = { videos, start, end, cols, rowH, totalRows, appendCard };
    grid.innerHTML = "";
    const topPad = document.createElement("div");
    topPad.className = "grid-virtual-spacer";
    topPad.style.height = `${startRow * rowH}px`;
    grid.appendChild(topPad);
    videos.slice(start, end).forEach((v) => appendCard(v));
    const bottomPad = document.createElement("div");
    bottomPad.className = "grid-virtual-spacer";
    bottomPad.style.height = `${Math.max(0, (totalRows - endRow) * rowH)}px`;
    grid.appendChild(bottomPad);
  }

  function onVirtualScroll() {
    if (!virtualState) return;
    const { videos, appendCard } = virtualState;
    renderVirtualSlice(videos, appendCard);
    restoreScroll();
  }

  function setupVirtualScroll() {
    const scroll = hooks?.getAppScroll?.();
    if (!scroll) return;
    let timer = null;
    scroll.addEventListener("scroll", () => {
      clearTimeout(timer);
      timer = setTimeout(onVirtualScroll, 80);
    }, { passive: true });
  }

  function highlightCollectionFilter() {
    const tag = hooks?.getCollectionTag?.();
    if (!tag) return;
    document.querySelectorAll("#tag-filters .filter-btn").forEach((btn) => {
      const f = btn.dataset.filter || "";
      btn.classList.toggle("collection-active", f === `tag:${tag}` || (tag === "Untagged" && f === "untagged"));
    });
  }

  function init(options) {
    hooks = options;
    setupDragDrop();
    bindBulkUi();
    setupVirtualScroll();

    const grid = hooks.getGrid?.();
    if (grid) {
      const observer = new MutationObserver(() => highlightCollectionFilter());
      observer.observe(grid, { childList: true });
    }

    hooks.patchWatchUrl?.((video) => {
      saveScroll();
      return hooks.buildWatchUrl(video);
    });

    return {
      decorateCard,
      renderVirtualSlice,
      restoreScroll,
      resetScroll,
      saveScroll,
      setSelectMode,
      highlightCollectionFilter,
    };
  }

  return { init };
})();
