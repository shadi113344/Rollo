/**
 * Frameless long-press tag chip flyout (speed-dial burst).
 * Short tap → onTap. Long press → floating chips expand from the anchor button.
 */
window.AnchoredTagPalette = (function () {
  const LONG_PRESS_MS = 400;
  const TAP_MAX_MS = 320;
  const MOVE_CANCEL_PX = 10;
  const GAP = 8;
  const ANCHOR_GAP = 10;
  const VIEW_MARGIN = 10;
  const CHIP_H = 28;
  const CHIP_H_ACTIVE = 44;
  const FONT_NORMAL = 11;
  const FONT_ACTIVE = 16;
  const MAX_COLS = 3;
  const MAX_ROWS = 3;

  let root = null;
  let backdrop = null;
  let chipsEl = null;

  let open = false;
  let closing = false;
  let anchorRect = null;
  let anchorBtn = null;
  let anchorPoint = { x: 0, y: 0 };
  let activeOpts = null;
  let activePointerId = null;
  let previewId = null;
  let selectionHandled = false;
  let chipEls = [];
  let measureCanvas = null;
  let lockedScrollTop = 0;
  let docPointerMove = null;
  let docPointerUp = null;
  let docTouchMove = null;
  let scrollGuard = null;
  let openingCount = 0;
  let scrollLockTarget = null;

  function ensureRoot() {
    if (root) return;
    root = document.createElement("div");
    root.className = "tag-flyout-root";
    root.innerHTML = `
      <div class="tag-flyout-backdrop" aria-hidden="true"></div>
      <div class="tag-flyout-chips" role="menu" aria-hidden="true"></div>
    `;
    document.body.appendChild(root);
    backdrop = root.querySelector(".tag-flyout-backdrop");
    chipsEl = root.querySelector(".tag-flyout-chips");

    backdrop.addEventListener("pointerdown", onBackdropPointerDown);
    backdrop.addEventListener("pointercancel", onPointerCancel);
  }

  function refreshAnchor() {
    if (!anchorBtn) return;
    anchorRect = anchorBtn.getBoundingClientRect();
    anchorPoint = {
      x: anchorRect.left + anchorRect.width / 2,
      y: anchorRect.top + anchorRect.height / 2,
    };
  }

  function clearAnchorButtonState() {
    if (anchorBtn) {
      anchorBtn.classList.remove("tag-palette-holding", "tag-palette-armed");
    }
    document
      .querySelectorAll(".tag-palette-holding, .tag-palette-armed")
      .forEach((el) => el.classList.remove("tag-palette-holding", "tag-palette-armed"));
  }

  function bindDocPointerHandlers() {
    docPointerMove = (e) => {
      if (!open || e.pointerId !== activePointerId) return;
      e.preventDefault();
      e.stopPropagation();
      setPreview(hitTestChip(e.clientX, e.clientY));
    };
    docPointerUp = (e) => {
      if (!open || e.pointerId !== activePointerId) return;
      e.preventDefault();
      e.stopPropagation();
      onBackdropPointerUp(e);
    };
    docTouchMove = (e) => {
      if (!open) return;
      e.preventDefault();
    };
    scrollGuard = () => {
      if (scrollLockTarget && scrollLockTarget.scrollTop !== lockedScrollTop) {
        scrollLockTarget.scrollTop = lockedScrollTop;
      }
    };
    document.addEventListener("pointermove", docPointerMove, { capture: true, passive: false });
    document.addEventListener("pointerup", docPointerUp, { capture: true, passive: false });
    document.addEventListener("pointercancel", onPointerCancel, { capture: true });
    document.addEventListener("touchmove", docTouchMove, { passive: false, capture: true });
    window.addEventListener("scroll", scrollGuard, { capture: true, passive: true });
  }

  function unbindDocPointerHandlers() {
    if (docPointerMove) document.removeEventListener("pointermove", docPointerMove, { capture: true });
    if (docPointerUp) document.removeEventListener("pointerup", docPointerUp, { capture: true });
    document.removeEventListener("pointercancel", onPointerCancel, { capture: true });
    if (docTouchMove) document.removeEventListener("touchmove", docTouchMove, { capture: true });
    if (scrollGuard) window.removeEventListener("scroll", scrollGuard, { capture: true });
    docPointerMove = null;
    docPointerUp = null;
    docTouchMove = null;
    scrollGuard = null;
  }

  function onPointerCancel(e) {
    if (!open) return;
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    forceClose();
  }

  function forceClose() {
    try {
      if (activePointerId !== null) {
        backdrop?.releasePointerCapture(activePointerId);
        root?.releasePointerCapture?.(activePointerId);
      }
    } catch {
      /* ignore */
    }
    closeFlyout(false);
  }

  function measureLabelWidth(label, fontSize) {
    if (!measureCanvas) measureCanvas = document.createElement("canvas");
    const ctx = measureCanvas.getContext("2d");
    ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    return Math.ceil(ctx.measureText(String(label || "")).width);
  }

  function chipWidth(label, active = false) {
    const font = active ? FONT_ACTIVE : FONT_NORMAL;
    const padX = active ? 44 : 24;
    return Math.min(150, Math.max(52, measureLabelWidth(label, font) + padX));
  }

  function chipHeight(active = false) {
    return active ? CHIP_H_ACTIVE : CHIP_H;
  }

  function layoutFlyoutVertical(tags, rect, previewId) {
    const n = tags.length;
    if (!n) return { positions: [], cols: 0, shiftX: 0, shiftY: 0 };

    const ay = rect.top + rect.height / 2;
    const anchorEdgeX = rect.left - ANCHOR_GAP;
    const maxW = anchorEdgeX - VIEW_MARGIN;
    const vh = window.innerHeight;
    const maxH = vh - VIEW_MARGIN * 2;

    const sizes = tags.map((t) => ({
      w: chipWidth(t.label, previewId === t.id),
      h: chipHeight(previewId === t.id),
    }));

    let best = null;

    for (let cols = 1; cols <= Math.min(MAX_COLS, n); cols++) {
      const colWidths = new Array(cols).fill(0);
      const colRows = new Array(cols).fill(0);

      tags.forEach((_, i) => {
        const col = i % cols;
        colWidths[col] = Math.max(colWidths[col], sizes[i].w);
        colRows[col] = Math.max(colRows[col], Math.floor(i / cols) + 1);
      });

      const totalW = colWidths.reduce((s, w) => s + w, 0) + GAP * Math.max(0, cols - 1);
      let maxStackH = 0;
      for (let c = 0; c < cols; c++) {
        const rows = colRows[c];
        const stackH = rows * CHIP_H + GAP * Math.max(0, rows - 1);
        maxStackH = Math.max(maxStackH, stackH);
      }

      if (totalW > maxW) continue;

      const positions = new Array(n);
      let xRight = anchorEdgeX;

      for (let c = 0; c < cols; c++) {
        const w = colWidths[c];
        const xCenter = xRight - w / 2;
        xRight -= w + GAP;

        const indices = [];
        for (let i = 0; i < n; i++) {
          if (i % cols === c) indices.push(i);
        }

        const rowHeights = indices.map((i) => sizes[i].h);
        const stackH = rowHeights.reduce((s, h, ri) => s + h + (ri ? GAP : 0), 0);
        let yCursor = ay - stackH / 2;

        indices.forEach((itemIdx, ri) => {
          const h = rowHeights[ri];
          positions[itemIdx] = { x: xCenter, y: yCursor + h / 2, w: sizes[itemIdx].w };
          yCursor += h + GAP;
        });
      }

      let shiftX = 0;
      let shiftY = 0;
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;

      positions.forEach((p, i) => {
        const hw = sizes[i].w / 2;
        const hh = sizes[i].h / 2;
        minX = Math.min(minX, p.x - hw);
        maxX = Math.max(maxX, p.x + hw);
        minY = Math.min(minY, p.y - hh);
        maxY = Math.max(maxY, p.y + hh);
      });

      if (minX < VIEW_MARGIN) shiftX = VIEW_MARGIN - minX;
      if (maxX > window.innerWidth - VIEW_MARGIN) shiftX = window.innerWidth - VIEW_MARGIN - maxX;
      if (minY < VIEW_MARGIN) shiftY = VIEW_MARGIN - minY;
      if (maxY > vh - VIEW_MARGIN) shiftY = vh - VIEW_MARGIN - maxY;

      const score = totalW + maxStackH * 1.1 + cols * 6;
      if (!best || score < best.score) {
        best = { positions, cols, shiftX, shiftY, score };
      }
    }

    if (!best) {
      const cols = Math.min(MAX_COLS, n);
      const positions = [];
      const colW = Math.max(52, Math.floor((maxW - GAP * (cols - 1)) / cols));
      let xRight = anchorEdgeX;
      for (let c = 0; c < cols; c++) {
        const xCenter = xRight - colW / 2;
        xRight -= colW + GAP;
        const indices = [];
        for (let i = 0; i < n; i++) if (i % cols === c) indices.push(i);
        const stackH = indices.length * CHIP_H + GAP * Math.max(0, indices.length - 1);
        let y = ay - stackH / 2 + CHIP_H / 2;
        indices.forEach((itemIdx) => {
          positions[itemIdx] = { x: xCenter, y, w: colW };
          y += CHIP_H + GAP;
        });
      }
      return { positions, cols, shiftX: 0, shiftY: 0 };
    }

    positionsApplyShift(best.positions, best.shiftX, best.shiftY);
    return best;
  }

  function layoutFlyoutHorizontal(tags, rect, previewId) {
    const n = tags.length;
    if (!n) return { positions: [], rows: 0, shiftX: 0, shiftY: 0 };

    const anchorEdgeY = rect.top - ANCHOR_GAP;
    const anchorEdgeX = rect.left - ANCHOR_GAP;
    const maxH = anchorEdgeY - VIEW_MARGIN;
    const vw = window.innerWidth;
    const maxW = vw - VIEW_MARGIN * 2;

    const sizes = tags.map((t) => ({
      w: chipWidth(t.label, previewId === t.id),
      h: chipHeight(previewId === t.id),
    }));

    let best = null;

    for (let rows = 1; rows <= Math.min(MAX_ROWS, n); rows++) {
      const rowIndices = Array.from({ length: rows }, () => []);
      tags.forEach((_, i) => rowIndices[i % rows].push(i));

      const rowLayouts = rowIndices.map((indices) => {
        const w = indices.reduce((s, idx, ri) => s + sizes[idx].w + (ri ? GAP : 0), 0);
        const h = Math.max(...indices.map((idx) => sizes[idx].h));
        return { indices, w, h };
      });

      const maxRowW = Math.max(...rowLayouts.map((r) => r.w));
      const totalStackH = rowLayouts.reduce((s, r, ri) => s + r.h + (ri ? GAP : 0), 0);

      if (totalStackH > maxH) continue;
      if (maxRowW > maxW) continue;

      const positions = new Array(n);
      let yBottom = anchorEdgeY;

      rowLayouts.forEach(({ indices, h }) => {
        const yCenter = yBottom - h / 2;
        let xRight = anchorEdgeX;
        indices.forEach((itemIdx) => {
          const chipW = sizes[itemIdx].w;
          xRight -= chipW;
          positions[itemIdx] = { x: xRight + chipW / 2, y: yCenter, w: chipW };
          xRight -= GAP;
        });
        yBottom -= h + GAP;
      });

      let shiftX = 0;
      let shiftY = 0;
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;

      positions.forEach((p, i) => {
        const hw = sizes[i].w / 2;
        const hh = sizes[i].h / 2;
        minX = Math.min(minX, p.x - hw);
        maxX = Math.max(maxX, p.x + hw);
        minY = Math.min(minY, p.y - hh);
        maxY = Math.max(maxY, p.y + hh);
      });

      if (minX < VIEW_MARGIN) shiftX = VIEW_MARGIN - minX;
      if (maxX > vw - VIEW_MARGIN) shiftX = vw - VIEW_MARGIN - maxX;
      if (minY < VIEW_MARGIN) shiftY = VIEW_MARGIN - minY;
      if (maxY > anchorEdgeY) shiftY = anchorEdgeY - maxY;

      const score = totalStackH + maxRowW * 1.1 + rows * 6;
      if (!best || score < best.score) {
        best = { positions, rows, shiftX, shiftY, score };
      }
    }

    if (!best) {
      const rows = Math.min(MAX_ROWS, n);
      const rowIndices = Array.from({ length: rows }, () => []);
      tags.forEach((_, i) => rowIndices[i % rows].push(i));
      const positions = [];
      let yBottom = anchorEdgeY;
      rowIndices.forEach((indices) => {
        const chipW = Math.max(52, Math.floor((maxW - GAP * (indices.length - 1)) / indices.length));
        const yCenter = yBottom - CHIP_H / 2;
        let xRight = anchorEdgeX;
        indices.forEach((itemIdx) => {
          xRight -= chipW;
          positions[itemIdx] = { x: xRight + chipW / 2, y: yCenter, w: chipW };
          xRight -= GAP;
        });
        yBottom -= CHIP_H + GAP;
      });
      return { positions, rows, shiftX: 0, shiftY: 0 };
    }

    positionsApplyShift(best.positions, best.shiftX, best.shiftY);
    return best;
  }

  function layoutFlyout(tags, rect, previewId) {
    if (activeOpts?.layout === "horizontal") {
      return layoutFlyoutHorizontal(tags, rect, previewId);
    }
    return layoutFlyoutVertical(tags, rect, previewId);
  }

  function resolveScrollEl() {
    const sel = activeOpts?.scrollLock;
    if (!sel) return document.getElementById("feed");
    if (typeof sel === "string") return document.querySelector(sel);
    if (sel instanceof Element) return sel;
    return null;
  }

  function positionsApplyShift(positions, dx, dy) {
    positions.forEach((p) => {
      if (!p) return;
      p.x += dx;
      p.y += dy;
    });
  }

  function setBodyLock(on) {
    if (activeOpts?.paired) return;
    document.body.classList.toggle("tag-palette-active", on);
    if (on) {
      scrollLockTarget = resolveScrollEl();
      if (scrollLockTarget) {
        lockedScrollTop = scrollLockTarget.scrollTop;
        scrollLockTarget.style.overflow = "hidden";
        scrollLockTarget.style.touchAction = "none";
      }
      bindDocPointerHandlers();
    } else {
      unbindDocPointerHandlers();
      if (scrollLockTarget) {
        scrollLockTarget.style.overflow = "";
        scrollLockTarget.style.touchAction = "";
        scrollLockTarget.scrollTop = lockedScrollTop;
        scrollLockTarget = null;
      }
    }
  }

  function styleChip(chip, tag) {
    if (window.TagColors?.styleTagEl) {
      TagColors.styleTagEl(chip, tag.label, { active: !!tag.active });
    }
    const colors = window.TagColors?.getTagColors?.(tag.label);
    if (colors) {
      chip.style.setProperty("--tag-accent", colors.solid);
      if (!tag.active) {
        chip.style.background = `color-mix(in srgb, ${colors.solid} 32%, rgba(16, 16, 16, 0.78))`;
        chip.style.borderColor = colors.border;
        chip.style.color = colors.color;
      }
    } else if (tag.accent) {
      chip.style.setProperty("--tag-accent", tag.accent);
    }
  }

  function applyChipPosition(chip, pos, i) {
    chip.style.setProperty("--chip-x", `${pos.x}px`);
    chip.style.setProperty("--chip-y", `${pos.y}px`);
    chip.style.setProperty("--chip-w", `${pos.w}px`);
    chip.style.setProperty("--chip-i", String(i));
    chip.style.left = `${pos.x}px`;
    chip.style.top = `${pos.y}px`;
    chip.style.width = `${pos.w}px`;
    const dx = anchorPoint.x - pos.x;
    const dy = anchorPoint.y - pos.y;
    chip.style.setProperty("--fly-dx", `${dx}px`);
    chip.style.setProperty("--fly-dy", `${dy}px`);
  }

  function bindEnterAnimation(chip) {
    openingCount += 1;
    chip.addEventListener(
      "animationend",
      (e) => {
        if (e.animationName !== "tag-flyout-burst") return;
        chip.classList.remove("tag-flyout-chip--enter");
        openingCount = Math.max(0, openingCount - 1);
        if (openingCount === 0) {
          root?.classList.remove("tag-flyout-root--opening");
        }
      },
      { once: true }
    );
  }

  function renderChips(tags, layout, animate) {
    chipEls = [];
    const frag = document.createDocumentFragment();

    tags.forEach((tag, i) => {
      const pos = layout.positions[i];
      if (!pos) return;

      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "tag-flyout-chip";
      chip.setAttribute("role", "menuitem");
      chip.dataset.tagId = tag.id;
      chip.setAttribute("aria-label", tag.label);
      chip.textContent = tag.label;
      chip.classList.toggle("tag-flyout-chip--selected", !!tag.active);
      chip.classList.toggle("tag-flyout-chip--preview", tag.id === previewId);
      styleChip(chip, tag);
      applyChipPosition(chip, pos, i);

      if (animate) {
        chip.classList.add("tag-flyout-chip--enter");
        bindEnterAnimation(chip);
      }
      frag.appendChild(chip);
      chipEls.push(chip);
    });

    chipsEl.replaceChildren(frag);
    chipsEl.setAttribute("aria-hidden", tags.length ? "false" : "true");
  }

  let previewRaf = null;

  function relayoutPreview() {
    const tags = typeof activeOpts?.getTags === "function" ? activeOpts.getTags() : [];
    const layout = layoutFlyout(tags, anchorRect, previewId);

    chipEls.forEach((chip, i) => {
      const tag = tags.find((t) => t.id === chip.dataset.tagId);
      const pos = layout.positions[i];
      if (!pos || !tag) return;

      const willPreview = tag.id === previewId;
      const wasPreview = chip.classList.contains("tag-flyout-chip--preview");

      chip.style.width = `${pos.w}px`;
      chip.classList.toggle("tag-flyout-chip--preview", willPreview);

      if (wasPreview !== willPreview) {
        styleChip(chip, tag);
      }

      applyChipPosition(chip, pos, i);
    });
  }

  function setPreview(id) {
    if (id === previewId) return;
    if (root?.classList.contains("tag-flyout-root--opening")) return;
    previewId = id;
    if (previewRaf) cancelAnimationFrame(previewRaf);
    previewRaf = requestAnimationFrame(() => {
      previewRaf = null;
      relayoutPreview();
    });
  }
  function hitTestChip(clientX, clientY) {
    const pad = 8;
    for (let i = chipEls.length - 1; i >= 0; i--) {
      const chip = chipEls[i];
      const r = chip.getBoundingClientRect();
      const extra = chip.dataset.tagId === previewId ? 10 : 0;
      const m = pad + extra;
      if (
        clientX >= r.left - m &&
        clientX <= r.right + m &&
        clientY >= r.top - m &&
        clientY <= r.bottom + m
      ) {
        return chip.dataset.tagId;
      }
    }
    return null;
  }

  function openFlyout(btn, opts) {
    ensureRoot();
    if (open || closing) return;

    activeOpts = opts;
    anchorBtn = btn;
    refreshAnchor();

    openFlyoutWithLayout(opts);
  }

  function openFlyoutWithLayout(opts) {
    const tags = typeof opts.getTags === "function" ? opts.getTags() : opts.getTags || [];
    const layout = layoutFlyout(tags, anchorRect, null);

    open = true;
    closing = false;
    previewId = null;
    selectionHandled = false;
    root.classList.add("tag-flyout-root--open");
    if (opts.paired) root.classList.add("tag-flyout-root--paired");
    if (tags.length) root.classList.add("tag-flyout-root--opening");
    setBodyLock(true);

    renderChips(tags, layout, true);
  }

  function openFrom(anchor, opts, pointerId, clientX, clientY) {
    ensureRoot();
    if (open || closing) return;

    activeOpts = opts;
    if (anchor instanceof Element) {
      anchorBtn = anchor;
      refreshAnchor();
    } else {
      anchorBtn = null;
      anchorRect = {
        left: anchor.left,
        top: anchor.top,
        width: anchor.width,
        height: anchor.height,
        right: anchor.right,
        bottom: anchor.bottom,
      };
      anchorPoint = {
        x: anchor.left + anchor.width / 2,
        y: anchor.top + anchor.height / 2,
      };
    }

    openFlyoutWithLayout(opts);

    if (!opts.paired && pointerId != null) {
      activePointerId = pointerId;
      selectionHandled = false;
      try {
        root.setPointerCapture(pointerId);
      } catch {
        /* ignore */
      }
      if (clientX != null && clientY != null) {
        setPreview(hitTestChip(clientX, clientY));
      }
    }
  }

  function closeFlyout(animate = true) {
    if (!open && !closing) return;
    const wasOpen = open;
    const wasPaired = !!activeOpts?.paired;
    open = false;
    previewId = null;
    activePointerId = null;
    root?.classList.remove("tag-flyout-root--open", "tag-flyout-root--opening", "tag-flyout-root--paired");
    if (!wasPaired) {
      setBodyLock(false);
    }
    clearAnchorButtonState();
    releaseAllPointerCapture();
    openingCount = 0;

    if (!wasOpen) {
      chipsEl.replaceChildren();
      chipEls = [];
      anchorBtn = null;
      closing = false;
      return;
    }

    if (!animate) {
      chipsEl.replaceChildren();
      chipEls = [];
      activeOpts = null;
      anchorBtn = null;
      closing = false;
      openingCount = 0;
      return;
    }

    closing = true;
    chipEls.forEach((chip, i) => {
      const rect = chip.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      chip.style.setProperty("--fly-dx", `${anchorPoint.x - cx}px`);
      chip.style.setProperty("--fly-dy", `${anchorPoint.y - cy}px`);
      chip.style.setProperty("--chip-i", String(i));
      chip.classList.remove("tag-flyout-chip--enter", "tag-flyout-chip--preview");
      chip.classList.add("tag-flyout-chip--exit");
    });

    setTimeout(() => {
      chipsEl.replaceChildren();
      chipEls = [];
      closing = false;
      activeOpts = null;
      anchorBtn = null;
      openingCount = 0;
    }, 280);
  }

  function releaseAllPointerCapture(pointerId) {
    const pid = pointerId ?? activePointerId;
    if (pid == null) return;
    try {
      if (root?.hasPointerCapture?.(pid)) root.releasePointerCapture(pid);
    } catch {
      /* ignore */
    }
  }

  function onBackdropPointerDown(e) {
    if (!open || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    selectionHandled = false;
    activePointerId = e.pointerId;
    try {
      root.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    setPreview(hitTestChip(e.clientX, e.clientY));
  }

  function onBackdropPointerUp(e) {
    if ((!open && !closing) || e.pointerId !== activePointerId || selectionHandled) return;
    e.preventDefault();
    selectionHandled = true;
    const id = previewId || hitTestChip(e.clientX, e.clientY);
    const tags = typeof activeOpts?.getTags === "function" ? activeOpts.getTags() : [];
    const tag = tags.find((t) => t.id === id);
    const opts = activeOpts;

    releaseAllPointerCapture(e.pointerId);
    activePointerId = null;

    if (tag) {
      if (tag.isAdd) {
        closeFlyout(true);
        opts?.onTap?.();
        return;
      }
      closeFlyout(true);
      Promise.resolve(opts?.onTagSelect?.(tag)).catch(() => {});
    } else {
      closeFlyout(true);
    }
  }

  function bind(button, opts = {}) {
    const longPressMs = opts.longPressMs ?? LONG_PRESS_MS;
    let timer = null;
    let startX = 0;
    let startY = 0;
    let pointerId = null;
    let moved = false;
    let longFired = false;
    let startTime = 0;

    const clearTimer = () => {
      clearTimeout(timer);
      timer = null;
    };

    const onPointerDown = (e) => {
      if (e.button !== 0) return;
      if (open) return;
      e.stopPropagation();
      moved = false;
      longFired = false;
      startX = e.clientX;
      startY = e.clientY;
      startTime = performance.now();
      pointerId = e.pointerId;
      clearTimer();
      button.classList.add("tag-palette-holding");
      timer = setTimeout(() => {
        longFired = true;
        clearTimer();
        button.classList.add("tag-palette-armed");
        navigator.vibrate?.(10);
        openFlyout(button, opts);
        activePointerId = pointerId;
        try {
          root.setPointerCapture(pointerId);
        } catch {
          /* ignore */
        }
      }, longPressMs);
    };

    const onPointerMove = (e) => {
      if (e.pointerId !== pointerId) return;
      if (!open && Math.hypot(e.clientX - startX, e.clientY - startY) > MOVE_CANCEL_PX) {
        clearTimer();
        moved = true;
        button.classList.remove("tag-palette-holding");
      }
    };

    const onPointerUp = (e) => {
      if (e.pointerId !== pointerId) return;
      clearTimer();
      button.classList.remove("tag-palette-holding", "tag-palette-armed");
      if (open && longFired) {
        e.preventDefault();
        e.stopPropagation();
        onBackdropPointerUp(e);
        longFired = false;
        pointerId = null;
        return;
      }
      if (!moved && !longFired && performance.now() - startTime < TAP_MAX_MS) {
        e.preventDefault();
        e.stopPropagation();
        opts.onTap?.();
      }
      longFired = false;
      pointerId = null;
    };

    const onPointerCancel = (e) => {
      clearTimer();
      button.classList.remove("tag-palette-holding", "tag-palette-armed");
      if (open && e.pointerId === pointerId) forceClose();
      pointerId = null;
      longFired = false;
    };

    button.addEventListener("pointerdown", onPointerDown);
    button.addEventListener("pointermove", onPointerMove);
    button.addEventListener("pointerup", onPointerUp);
    button.addEventListener("pointercancel", onPointerCancel);
    button.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (open) return;
      openFlyout(button, opts);
      activePointerId = null;
    });
  }

  function handlePairedPointer(clientX, clientY) {
    if (!open || !activeOpts?.paired) return;
    if (root?.classList.contains("tag-flyout-root--opening")) return;
    setPreview(hitTestChip(clientX, clientY));
  }

  function finishPairedPointer(clientX, clientY) {
    if (!open || !activeOpts?.paired) return false;
    const id = previewId || hitTestChip(clientX, clientY);
    const tags = typeof activeOpts?.getTags === "function" ? activeOpts.getTags() : [];
    const tag = tags.find((t) => t.id === id);
    const opts = activeOpts;

    if (tag) {
      if (tag.isAdd) {
        closeFlyout(true);
        opts?.onTap?.();
      } else {
        closeFlyout(true);
        Promise.resolve(opts?.onTagSelect?.(tag)).catch(() => {});
      }
      return true;
    }

    closeFlyout(false);
    return false;
  }

  function refresh() {
    if (!open || !activeOpts) return;
    refreshAnchor();
    const tags = typeof activeOpts.getTags === "function" ? activeOpts.getTags() : [];
    const layout = layoutFlyout(tags, anchorRect, previewId);
    renderChips(tags, layout, false);
  }

  return {
    bind,
    openFrom,
    close: closeFlyout,
    refresh,
    handlePairedPointer,
    finishPairedPointer,
    isOpen: () => open,
    isPaired: () => !!activeOpts?.paired && open,
  };
})();
