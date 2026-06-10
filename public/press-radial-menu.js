/**
 * Press-and-slide radial menu — pointer capture, adaptive layout, branching sub-rows.
 */
window.PressRadialMenu = (function () {
  const BTN_SIZE = 50;
  const BTN_HIGHLIGHT = 68;
  const RADIUS = 38;
  const LINEAR_ROW_PAD = 10;
  const MENU_GAP_DEG = 7;
  const LINEAR_STEP = 58;
  const SUB_STEP = 49;
  const SUB_HEIGHT = 26;
  const PRIMARY_HIGHLIGHT_SCALE = 1.2;
  const SUB_HIGHLIGHT_SCALE = 1.14;
  const ROW_MIN_CLEAR = 8;
  const LONG_PRESS_MS = 420;
  const VIEW_MARGIN = 14;

  const ARC_LAYOUTS = {
    "arc-left": { startDeg: 250, endDeg: 200, offsetX: -5, offsetY: 3, subDx: -1, subDy: 0 },
    "arc-right": { startDeg: -30, endDeg: 30, offsetX: 5, offsetY: 3, subDx: 1, subDy: 0 },
    "arc-up": { startDeg: 210, endDeg: 330, offsetX: 0, offsetY: -5, subDx: 0, subDy: -1 },
    "arc-down": { startDeg: 30, endDeg: 150, offsetX: 0, offsetY: 5, subDx: 0, subDy: 1 },
  };

  let root = null;
  let fanEl = null;
  let subFanEl = null;
  let triggerEl = null;
  let open = false;
  let highlightId = null;
  let anchor = { x: 0, y: 0 };
  let fanShiftX = 0;
  let subShiftX = 0;
  let options = [];
  let subOptions = [];
  let submenuParentId = null;
  let layoutMode = "arc-left";
  let activePointerId = null;
  let keepOpenOnSelect = false;
  let longPressTimer = null;
  let armedEl = null;
  let selectionHandled = false;

  const bodyHandlers = {
    touchmove: null,
    selectstart: null,
    contextmenu: null,
  };

  function ensureRoot() {
    if (root) return;
    root = document.createElement("div");
    root.className = "radial-menu-root";
    root.innerHTML = `
      <div class="radial-menu-fan" role="menu" aria-hidden="true"></div>
      <div class="radial-menu-subfan" role="menu" aria-hidden="true"></div>
      <button type="button" class="radial-menu-trigger" aria-haspopup="menu" aria-expanded="false" aria-label="Video actions"></button>
    `;
    document.body.appendChild(root);
    fanEl = root.querySelector(".radial-menu-fan");
    subFanEl = root.querySelector(".radial-menu-subfan");
    triggerEl = root.querySelector(".radial-menu-trigger");

    fanEl.addEventListener("pointerdown", (e) => e.stopPropagation());
    subFanEl.addEventListener("pointerdown", (e) => e.stopPropagation());
    fanEl.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: true });
    fanEl.addEventListener("touchmove", (e) => e.stopPropagation(), { passive: false });

    bindTrigger(triggerEl);
  }

  function degToRad(deg) {
    return (deg * Math.PI) / 180;
  }

  function pickLayout(x, y, count) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const need = RADIUS + BTN_HIGHLIGHT / 2 + 24;
    const left = x;
    const right = vw - x;
    const top = y;
    const bottom = vh - y;

    if (count <= 4) {
      return top >= bottom ? "linear-top" : "linear-bottom";
    }

    if (count >= 5 || left < vw * 0.38 || right < vw * 0.38) {
      if (top >= bottom && top >= BTN_HIGHLIGHT + 40) return "linear-top";
      if (bottom >= BTN_HIGHLIGHT + 40) return "linear-bottom";
    }

    if (x < vw * 0.38) {
      if (right >= need) return "arc-right";
      return top >= bottom ? "linear-top" : "linear-bottom";
    }
    if (x > vw * 0.62) {
      if (left >= need) return "arc-left";
      return top >= bottom ? "linear-top" : "linear-bottom";
    }

    const candidates = [
      { mode: "arc-right", space: right },
      { mode: "arc-left", space: left },
      { mode: "arc-down", space: bottom },
      { mode: "arc-up", space: top },
    ].filter((c) => c.space >= need);

    if (candidates.length) {
      candidates.sort((a, b) => b.space - a.space);
      return candidates[0].mode;
    }

    if (top >= bottom) return "linear-top";
    return "linear-bottom";
  }

  function computeFanShift(count, mode, step = LINEAR_STEP, btnSize = BTN_SIZE) {
    if (!mode.startsWith("linear")) return 0;
    const total = (count - 1) * step + btnSize;
    const half = total / 2;
    const vw = window.innerWidth;
    let center = anchor.x;
    if (center - half < VIEW_MARGIN) center = VIEW_MARGIN + half;
    if (center + half > vw - VIEW_MARGIN) center = vw - VIEW_MARGIN - half;
    return center - anchor.x;
  }

  function arcPosition(index, count, mode) {
    const cfg = ARC_LAYOUTS[mode];
    const baseSpan = Math.abs(cfg.endDeg - cfg.startDeg);
    const minSpan = MENU_GAP_DEG * Math.max(0, count - 1);
    const span = Math.max(baseSpan, minSpan);
    const mid = (cfg.startDeg + cfg.endDeg) / 2;
    const half = span / 2;
    const startDeg = mid - half;
    const endDeg = mid + half;
    const gaps = MENU_GAP_DEG * Math.max(0, count - 1);
    const step = count <= 1 ? 0 : (span - gaps) / (count - 1);
    const dir = endDeg >= startDeg ? 1 : -1;
    const angleDeg = startDeg + dir * index * (step + MENU_GAP_DEG);
    const rad = degToRad(angleDeg);
    return {
      x: Math.cos(rad) * RADIUS,
      y: Math.sin(rad) * RADIUS,
    };
  }

  function linearPosition(index, count, mode) {
    const total = (count - 1) * LINEAR_STEP;
    const y = mode === "linear-top" ? -(RADIUS + LINEAR_ROW_PAD) : RADIUS + LINEAR_ROW_PAD;
    return {
      x: fanShiftX + (-total / 2 + index * LINEAR_STEP),
      y,
    };
  }

  function primaryLinearRowY(mode) {
    return mode === "linear-top" ? -(RADIUS + LINEAR_ROW_PAD) : RADIUS + LINEAR_ROW_PAD;
  }

  function primaryOuterRadius() {
    return (BTN_SIZE / 2) * PRIMARY_HIGHLIGHT_SCALE;
  }

  function subOuterRadius() {
    return (SUB_HEIGHT / 2) * SUB_HIGHLIGHT_SCALE;
  }

  function subRowSeparation() {
    return primaryOuterRadius() + subOuterRadius() + ROW_MIN_CLEAR;
  }

  function subRowDirection() {
    if (layoutMode === "linear-top") return { x: 0, y: -1 };
    if (layoutMode === "linear-bottom") return { x: 0, y: 1 };
    const cfg = ARC_LAYOUTS[layoutMode];
    if (!cfg) return { x: 0, y: 1 };
    const len = Math.hypot(cfg.subDx, cfg.subDy);
    if (!len) return { x: 0, y: 1 };
    return { x: cfg.subDx / len, y: cfg.subDy / len };
  }

  function layoutPosition(index, count, mode) {
    if (mode.startsWith("linear")) return linearPosition(index, count, mode);
    return arcPosition(index, count, mode);
  }

  function resolveSubmenu(opt) {
    if (!opt?.submenu) return [];
    return typeof opt.submenu === "function" ? opt.submenu() : opt.submenu;
  }

  function parentOptionPos(parentId) {
    const index = options.findIndex((o) => o.id === parentId);
    if (index < 0) return { x: 0, y: 0 };
    return layoutPosition(index, options.length, layoutMode);
  }

  function subRowPosition(subIndex, subCount, parentPos) {
    const sep = subRowSeparation();
    const total = (subCount - 1) * SUB_STEP;
    let rowX = -total / 2 + subIndex * SUB_STEP;
    let rowY;

    if (layoutMode.startsWith("linear")) {
      const primaryY = primaryLinearRowY(layoutMode);
      rowY = layoutMode === "linear-top" ? primaryY - sep : primaryY + sep;
      return {
        x: subShiftX + rowX,
        y: rowY,
      };
    }

    const dir = subRowDirection();
    const centerX = parentPos.x + dir.x * sep;
    const centerY = parentPos.y + dir.y * sep;
    return {
      x: subShiftX + centerX + (-total / 2 + subIndex * SUB_STEP),
      y: centerY,
    };
  }

  function setBodyLock(on) {
    document.body.classList.toggle("menu-active", on);
    const scroll = document.getElementById("app-scroll");
    if (scroll) scroll.style.touchAction = on ? "none" : "";

    if (on) {
      window.getSelection()?.removeAllRanges();
      bodyHandlers.touchmove = (e) => e.preventDefault();
      bodyHandlers.selectstart = (e) => e.preventDefault();
      bodyHandlers.contextmenu = (e) => e.preventDefault();
      document.addEventListener("touchmove", bodyHandlers.touchmove, { passive: false });
      document.addEventListener("selectstart", bodyHandlers.selectstart);
      document.addEventListener("contextmenu", bodyHandlers.contextmenu);
    } else {
      if (bodyHandlers.touchmove) document.removeEventListener("touchmove", bodyHandlers.touchmove);
      if (bodyHandlers.selectstart) document.removeEventListener("selectstart", bodyHandlers.selectstart);
      if (bodyHandlers.contextmenu) document.removeEventListener("contextmenu", bodyHandlers.contextmenu);
    }
  }

  function positionUi() {
    let offsetX = fanShiftX;
    let offsetY = 0;
    if (ARC_LAYOUTS[layoutMode]) {
      offsetX += ARC_LAYOUTS[layoutMode].offsetX;
      offsetY = ARC_LAYOUTS[layoutMode].offsetY;
    } else if (layoutMode === "linear-top") {
      offsetY = -3;
    } else if (layoutMode === "linear-bottom") {
      offsetY = 3;
    }

    fanEl.style.left = `${anchor.x + offsetX}px`;
    fanEl.style.top = `${anchor.y + offsetY}px`;
    subFanEl.style.left = `${anchor.x + offsetX}px`;
    subFanEl.style.top = `${anchor.y + offsetY}px`;
    triggerEl.style.left = `${anchor.x}px`;
    triggerEl.style.top = `${anchor.y}px`;
  }

  function optionSignature(list) {
    return list.map((o) => `${o.id}:${o.active ? 1 : 0}:${o.label}`).join("|");
  }

  function applyOptionState(btn, opt, index, animate, isSub = false) {
    const hi = highlightId === opt.id;
    btn.dataset.menuOption = opt.id;
    btn.setAttribute("aria-label", opt.label);
    btn.className = "radial-menu-option";
    if (isSub) btn.classList.add("radial-menu-option--sub");
    if (animate) btn.classList.add(isSub ? "radial-menu-option--sub-enter" : "radial-menu-option--enter");
    if (opt.tone === "delete") btn.classList.add("radial-menu-option--delete");
    if (opt.active) btn.classList.add("radial-menu-option--active");
    if (hi) btn.classList.add("radial-menu-option--highlight");
    if (submenuParentId === opt.id && subOptions.length) btn.classList.add("radial-menu-option--sub-open");

    if (opt.accent) btn.style.setProperty("--tag-accent", opt.accent);
    else btn.style.removeProperty("--tag-accent");

    btn.style.setProperty("--pop-i", String(index));
    let pos;
    if (isSub) {
      const parentPos = parentOptionPos(submenuParentId);
      pos = subRowPosition(index, subOptions.length, parentPos);
    } else {
      pos = layoutPosition(index, options.length, layoutMode);
    }
    btn.style.setProperty("--pop-x", `${pos.x}px`);
    btn.style.setProperty("--pop-y", `${pos.y}px`);

    if (isSub) {
      let label = btn.querySelector(".radial-menu-option__label");
      if (!label) {
        label = document.createElement("span");
        label.className = "radial-menu-option__label";
        btn.appendChild(label);
      }
      label.textContent = opt.label;
    } else {
      const icon = btn.querySelector(".radial-menu-option__icon") || document.createElement("span");
      icon.className = "radial-menu-option__icon";
      icon.textContent = opt.icon;
      if (!icon.parentNode) btn.appendChild(icon);
    }
  }

  function updateHighlight() {
    root.querySelectorAll(".radial-menu-option").forEach((btn) => {
      const id = btn.dataset.menuOption;
      btn.classList.toggle("radial-menu-option--highlight", id === highlightId);
      btn.classList.toggle("radial-menu-option--sub-open", id === submenuParentId && subOptions.length > 0);
    });
  }

  let lastSignature = "";
  let lastSubSignature = "";

  function renderFan(animate = false) {
    fanEl.setAttribute("aria-hidden", open ? "false" : "true");
    fanEl.className = "radial-menu-fan";
    if (layoutMode.startsWith("linear")) fanEl.classList.add("radial-menu-fan--linear");

    if (!open) {
      fanEl.innerHTML = "";
      lastSignature = "";
      return;
    }

    const signature = optionSignature(options);
    const existing = [...fanEl.querySelectorAll(".radial-menu-option")];
    const canPatch = existing.length === options.length && signature === lastSignature && !animate;

    if (canPatch) {
      existing.forEach((btn, index) => applyOptionState(btn, options[index], index, false, false));
      updateHighlight();
      return;
    }

    fanEl.innerHTML = "";
    options.forEach((opt, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("role", "menuitem");
      btn.tabIndex = -1;
      applyOptionState(btn, opt, index, animate, false);
      fanEl.appendChild(btn);
    });
    lastSignature = signature;
  }

  function renderSubRow(animate = false) {
    subFanEl.setAttribute("aria-hidden", subOptions.length ? "false" : "true");
    if (!open || !subOptions.length) {
      subFanEl.innerHTML = "";
      lastSubSignature = "";
      return;
    }

    const signature = optionSignature(subOptions);
    const existing = [...subFanEl.querySelectorAll(".radial-menu-option")];
    const canPatch = existing.length === subOptions.length && signature === lastSubSignature && !animate;

    if (canPatch) {
      existing.forEach((btn, index) => applyOptionState(btn, subOptions[index], index, false, true));
      updateHighlight();
      return;
    }

    subFanEl.innerHTML = "";
    subOptions.forEach((opt, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("role", "menuitem");
      btn.tabIndex = -1;
      applyOptionState(btn, opt, index, animate, true);
      subFanEl.appendChild(btn);
    });
    lastSubSignature = signature;
  }

  function syncSubmenuShift() {
    const subMode = layoutMode.startsWith("linear") ? layoutMode : "linear-bottom";
    subShiftX = computeFanShift(subOptions.length, subMode, SUB_STEP, 44);
  }

  function openSubRowFor(parentId) {
    const parent = options.find((o) => o.id === parentId);
    if (!parent?.submenu) {
      submenuParentId = null;
      subOptions = [];
      renderSubRow(false);
      return;
    }
    submenuParentId = parentId;
    subOptions = resolveSubmenu(parent);
    keepOpenOnSelect = !!parent.submenuKeepOpen;
    syncSubmenuShift();
    renderSubRow(true);
  }

  function closeSubRow() {
    submenuParentId = null;
    subOptions = [];
    keepOpenOnSelect = false;
    renderSubRow(false);
  }

  function findOption(id) {
    return subOptions.find((o) => o.id === id) || options.find((o) => o.id === id) || null;
  }

  function setHighlight(id) {
    if (id === highlightId) return;
    highlightId = id;

    const submenuTrigger = options.find((o) => o.submenu && o.id === id);
    if (submenuTrigger) {
      openSubRowFor(submenuTrigger.id);
    } else if (id && subOptions.some((o) => o.id === id)) {
      /* keep sub-row open while on a tag pill */
    } else if (id && options.some((o) => o.id === id)) {
      closeSubRow();
    }
    /* null id while sub-row open: finger in transit — keep sub-row */

    updateHighlight();
    if (subOptions.length) renderSubRow(false);
  }

  function hitTest(clientX, clientY) {
    const stack = document.elementsFromPoint(clientX, clientY);
    let primary = null;
    for (const el of stack) {
      const btn = el.closest?.("[data-menu-option]");
      if (!btn) continue;
      if (subFanEl?.contains(btn)) return btn.dataset.menuOption;
      if (fanEl?.contains(btn)) primary = btn.dataset.menuOption;
    }
    return primary;
  }

  function closeMenu() {
    open = false;
    highlightId = null;
    activePointerId = null;
    keepOpenOnSelect = false;
    selectionHandled = false;
    fanShiftX = 0;
    subShiftX = 0;
    submenuParentId = null;
    subOptions = [];
    triggerEl.classList.remove("radial-menu-trigger--open");
    triggerEl.setAttribute("aria-expanded", "false");
    setBodyLock(false);
    renderFan(false);
    renderSubRow(false);
    if (armedEl) {
      armedEl.classList.remove("press-radial-armed");
      armedEl = null;
    }
  }

  function openMenu(x, y, menuOptions, opts = {}) {
    ensureRoot();
    anchor = { x, y };
    options = menuOptions;
    keepOpenOnSelect = !!opts.keepOpenOnSelect;
    layoutMode = opts.layout || pickLayout(x, y, menuOptions.length);
    fanShiftX = computeFanShift(menuOptions.length, layoutMode);
    submenuParentId = null;
    subOptions = [];
    open = true;
    highlightId = null;
    positionUi();
    triggerEl.classList.add("radial-menu-trigger--open");
    triggerEl.setAttribute("aria-expanded", "true");
    setBodyLock(true);
    renderFan(true);
    renderSubRow(false);
  }

  function finishPointer(activeId) {
    if (!open || activeId !== activePointerId || selectionHandled) return;
    selectionHandled = true;

    runHighlighted();
    if (open) closeMenu();

    try {
      triggerEl.releasePointerCapture(activeId);
    } catch {
      /* ignore */
    }
    activePointerId = null;
  }

  function runHighlighted() {
    if (!highlightId) return false;

    if (highlightId === submenuParentId && subOptions.length) {
      const parent = options.find((o) => o.id === submenuParentId);
      if (!parent?.onSelect) return false;
      parent.onSelect();
      return true;
    }

    const opt = findOption(highlightId);
    if (!opt) return false;

    opt.onSelect?.();
    return true;
  }

  function bindTrigger(el) {
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || !open) return;
      e.preventDefault();
      e.stopPropagation();
      selectionHandled = false;
      activePointerId = e.pointerId;
      setHighlight(null);
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    });

    el.addEventListener("pointermove", (e) => {
      if (!open || e.pointerId !== activePointerId) return;
      e.preventDefault();
      setHighlight(hitTest(e.clientX, e.clientY));
    });

    el.addEventListener("pointerup", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      finishPointer(e.pointerId);
    });
    el.addEventListener("pointercancel", () => closeMenu());
  }

  function bindCardLongPress(card, getActionOptions) {
    let startX = 0;
    let startY = 0;
    let pointerId = null;
    let moved = false;
    let longFired = false;

    const clearTimer = () => {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    };

    const onPointerDown = (e) => {
      if (e.button !== 0) return;
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        selectionHandled = false;
        pointerId = e.pointerId;
        activePointerId = e.pointerId;
        try {
          triggerEl.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        return;
      }
      moved = false;
      longFired = false;
      selectionHandled = false;
      startX = e.clientX;
      startY = e.clientY;
      pointerId = e.pointerId;
      armedEl = card;
      clearTimer();
      longPressTimer = setTimeout(() => {
        longFired = true;
        clearTimer();
        card.classList.add("press-radial-armed");
        navigator.vibrate?.(10);
        openMenu(startX, startY, getActionOptions());
        activePointerId = pointerId;
        try {
          triggerEl.setPointerCapture(pointerId);
        } catch {
          /* ignore */
        }
      }, LONG_PRESS_MS);
    };

    const onPointerMove = (e) => {
      if (e.pointerId !== pointerId) return;
      if (!open && Math.hypot(e.clientX - startX, e.clientY - startY) > 12) {
        clearTimer();
        moved = true;
      }
      if (open && e.pointerId === activePointerId) {
        e.preventDefault();
        setHighlight(hitTest(e.clientX, e.clientY));
      }
    };

    const onPointerUp = (e) => {
      if (e.pointerId !== pointerId) return;
      clearTimer();
      if (open && longFired) {
        e.preventDefault();
        e.stopPropagation();
        finishPointer(pointerId);
        longFired = false;
        return;
      }
      pointerId = null;
    };

    card.addEventListener("pointerdown", onPointerDown);
    card.addEventListener("pointermove", onPointerMove);
    card.addEventListener("pointerup", onPointerUp);
    card.addEventListener("pointercancel", clearTimer);
    card.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      openMenu(e.clientX, e.clientY, getActionOptions());
    });

    card.querySelector(".thumb-link")?.addEventListener("click", (e) => {
      if (longFired || open) {
        e.preventDefault();
        longFired = false;
      }
    });
  }

  function refreshSubmenu() {
    if (!open || !submenuParentId) return;
    const parent = options.find((o) => o.id === submenuParentId);
    if (!parent) return;
    subOptions = resolveSubmenu(parent);
    lastSubSignature = "";
    syncSubmenuShift();
    renderSubRow(false);
  }

  function getAnchor() {
    return { ...anchor };
  }

  return {
    bindCardLongPress,
    refreshSubmenu,
    getAnchor,
    close: closeMenu,
    isOpen: () => open,
  };
})();
