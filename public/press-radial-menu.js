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
  const SUB_GAP = 10;
  const SUB_MIN_W = 54;
  const SUB_MAX_W = 118;
  const SUB_HEIGHT = 28;
  const SUB_ROW_GAP = 12;
  const SUB_COL_GAP = 14;
  const SUB_MAX_ROW_WIDTH = 260;
  const PRIMARY_HIGHLIGHT_SCALE = 1.36;
  const PRIMARY_GAP = 10;
  const SUB_HIGHLIGHT_SCALE = 1.5;
  const ROW_MIN_CLEAR = 8;
  const SUB_ROW_EXTRA = 16;
  const VERTICAL_SUB_STEP = 34;
  const LONG_PRESS_MS = 420;
  const TAG_PALETTE_HOLD_MS = 400;
  const HOLD_LOCK_MS = 80;
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
  let subShiftY = 0;
  let options = [];
  let subOptions = [];
  let submenuParentId = null;
  let layoutMode = "arc-left";
  let activePointerId = null;
  let keepOpenOnSelect = false;
  let longPressTimer = null;
  let armedEl = null;
  let selectionHandled = false;
  let tagPaletteTimer = null;
  let tagPaletteActive = false;
  let tagPaletteOptionId = null;
  let lastPointer = { x: 0, y: 0 };
  let menuRelayoutRaf = null;

  const bodyHandlers = {
    touchmove: null,
    selectstart: null,
    contextmenu: null,
    gesturestart: null,
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

    if (count <= 5) {
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

  function computeFanShift(count, mode, step = null, btnSize = BTN_SIZE) {
    if (!mode.startsWith("linear")) return 0;
    const linearStep = step ?? linearStepForCount(count);
    const total = (count - 1) * linearStep + btnSize;
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

  function linearStepForCount(count) {
    if (count <= 1) return LINEAR_STEP;
    const maxRow = Math.min(window.innerWidth - VIEW_MARGIN * 2, 248);
    return Math.min(LINEAR_STEP, (maxRow - BTN_SIZE) / (count - 1));
  }

  function linearPosition(index, count, mode) {
    const step = linearStepForCount(count);
    const total = (count - 1) * step;
    const y = mode === "linear-top" ? -(RADIUS + LINEAR_ROW_PAD) : RADIUS + LINEAR_ROW_PAD;
    return {
      x: fanShiftX + (-total / 2 + index * step),
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

  let measureCanvas = null;

  function measureSubLabelWidth(label) {
    if (!measureCanvas) measureCanvas = document.createElement("canvas");
    const ctx = measureCanvas.getContext("2d");
    ctx.font = "600 10px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    return ctx.measureText(String(label || "")).width;
  }

  function subOptionWidth(label) {
    const textW = measureSubLabelWidth(label);
    const base = Math.ceil(textW + 26);
    return Math.min(SUB_MAX_W, Math.max(SUB_MIN_W, base));
  }

  function subItemSize(index, highlightIdx) {
    const label = subOptions[index]?.label || "";
    const baseW = subOptionWidth(label);
    if (index === highlightIdx) {
      return {
        w: Math.min(SUB_MAX_W + 24, Math.ceil(baseW * SUB_HIGHLIGHT_SCALE)),
        h: Math.ceil(SUB_HEIGHT * SUB_HIGHLIGHT_SCALE),
      };
    }
    return { w: baseW, h: SUB_HEIGHT };
  }

  function subHighlightedIndex() {
    if (!highlightId) return -1;
    const idx = subOptions.findIndex((o) => o.id === highlightId);
    return idx >= 0 ? idx : -1;
  }

  function isVerticalLayout() {
    return layoutMode === "vertical-left" || layoutMode === "vertical-right";
  }

  function packSubRows(items) {
    const rows = [];
    let row = [];
    let rowW = 0;
    items.forEach((item) => {
      const gap = row.length ? SUB_GAP : 0;
      if (row.length && rowW + gap + item.width > SUB_MAX_ROW_WIDTH) {
        rows.push(row);
        row = [item];
        rowW = item.width;
      } else {
        row.push(item);
        rowW += gap + item.width;
      }
    });
    if (row.length) rows.push(row);
    return rows;
  }

  function subGridAnchor(parentPos) {
    const sep = subRowSeparation();
    if (isVerticalLayout()) return { x: 0, y: 0 };
    if (layoutMode === "linear-top") {
      return { x: parentPos.x, y: parentPos.y - sep };
    }
    if (layoutMode === "linear-bottom") {
      return { x: parentPos.x, y: parentPos.y + sep };
    }
    const dir = subRowDirection();
    return {
      x: parentPos.x + dir.x * sep,
      y: parentPos.y + dir.y * sep,
    };
  }

  function subGridLayout(subHi = subHighlightedIndex()) {
    const sizes = subOptions.map((_, i) => subItemSize(i, subHi));
    const widths = sizes.map((s) => s.w);
    const positions = new Array(subOptions.length);
    const rowStep = (rowH) => rowH + SUB_ROW_GAP;

    if (isVerticalLayout()) {
      const vh = window.innerHeight - VIEW_MARGIN * 2;
      const perCol = Math.max(4, Math.floor(vh / VERTICAL_SUB_STEP));
      const colCount = Math.ceil(subOptions.length / perCol) || 1;
      const colWidths = [];
      for (let c = 0; c < colCount; c++) {
        let maxW = SUB_MIN_W;
        for (let r = 0; r < perCol; r++) {
          const i = c * perCol + r;
          if (i >= subOptions.length) break;
          maxW = Math.max(maxW, widths[i]);
        }
        colWidths.push(maxW);
      }
      const countFirstCol = Math.min(perCol, subOptions.length);
      const colTotalH =
        countFirstCol <= 1 ? SUB_HEIGHT : (countFirstCol - 1) * VERTICAL_SUB_STEP;
      const dir = layoutMode === "vertical-left" ? -1 : 1;
      const sep = subRowSeparation();
      let colEdge = dir * sep;
      let minY = Infinity;
      let maxY = -Infinity;
      let minX = Infinity;
      let maxX = -Infinity;

      for (let c = 0; c < colCount; c++) {
        const colW = colWidths[c];
        const countInCol = Math.min(perCol, subOptions.length - c * perCol);
        const stackH =
          countInCol <= 1 ? SUB_HEIGHT : (countInCol - 1) * VERTICAL_SUB_STEP;
        const colCenterX = colEdge + (dir * colW) / 2;
        for (let r = 0; r < countInCol; r++) {
          const i = c * perCol + r;
          const y =
            countInCol === 1 ? 0 : -stackH / 2 + r * VERTICAL_SUB_STEP;
          positions[i] = { x: colCenterX, y, w: sizes[i].w, h: sizes[i].h };
          minY = Math.min(minY, y - sizes[i].h / 2);
          maxY = Math.max(maxY, y + sizes[i].h / 2);
          minX = Math.min(minX, colCenterX - colW / 2);
          maxX = Math.max(maxX, colCenterX + colW / 2);
        }
        colEdge += dir * (colW + SUB_COL_GAP);
      }

      return {
        positions,
        widths,
        sizes,
        totalW: Math.abs(colEdge - dir * sep),
        totalH: maxY - minY,
        minX,
        maxX,
        minY,
        maxY,
      };
    }

    const parentPos = parentOptionPos(submenuParentId || "tags");
    const gridAnchor = subGridAnchor(parentPos);
    const items = subOptions.map((o, i) => ({ index: i, width: sizes[i].w, label: o.label }));
    const rows = packSubRows(items);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    rows.forEach((row, rowIdx) => {
      const rowH = Math.max(...row.map((it) => sizes[it.index].h));
      const rowTotalW = row.reduce((sum, it, i) => sum + sizes[it.index].w + (i ? SUB_GAP : 0), 0);
      let cursor = -rowTotalW / 2;
      let yOffset = 0;
      for (let r = 0; r < rowIdx; r++) {
        const prevH = Math.max(...rows[r].map((it) => sizes[it.index].h));
        yOffset += rowStep(prevH);
      }
      const y = gridAnchor.y - yOffset;
      row.forEach((item) => {
        const sz = sizes[item.index];
        cursor += sz.w / 2;
        const x = gridAnchor.x + cursor;
        positions[item.index] = { x, y, w: sz.w, h: sz.h };
        minX = Math.min(minX, x - sz.w / 2);
        maxX = Math.max(maxX, x + sz.w / 2);
        minY = Math.min(minY, y - sz.h / 2);
        maxY = Math.max(maxY, y + sz.h / 2);
        cursor += sz.w / 2 + SUB_GAP;
      });
    });

    return {
      positions,
      widths,
      sizes,
      totalW: maxX - minX,
      totalH: maxY - minY,
      minX,
      maxX,
      minY,
      maxY,
    };
  }

  function subRowLayout() {
    const grid = subGridLayout();
    const centers = grid.positions.map((p) => p?.x ?? 0);
    return {
      widths: grid.widths,
      centers,
      total: grid.totalW,
      positions: grid.positions,
    };
  }

  function computeSubShift(totalWidth) {
    const half = totalWidth / 2;
    const vw = window.innerWidth;
    let center = anchor.x;
    if (center - half < VIEW_MARGIN) center = VIEW_MARGIN + half;
    if (center + half > vw - VIEW_MARGIN) center = vw - VIEW_MARGIN - half;
    return center - anchor.x;
  }

  function subRowSeparation() {
    return primaryOuterRadius() + subOuterRadius() + ROW_MIN_CLEAR + SUB_ROW_EXTRA;
  }

  function computeSubShiftY(totalHeight) {
    const half = totalHeight / 2;
    const vh = window.innerHeight;
    let center = anchor.y;
    if (center - half < VIEW_MARGIN) center = VIEW_MARGIN + half;
    if (center + half > vh - VIEW_MARGIN) center = vh - VIEW_MARGIN - half;
    return center - anchor.y;
  }

  function subRowDirection() {
    if (layoutMode === "vertical-left") return { x: -1, y: 0 };
    if (layoutMode === "vertical-right") return { x: 1, y: 0 };
    if (layoutMode === "linear-top") return { x: 0, y: -1 };
    if (layoutMode === "linear-bottom") return { x: 0, y: 1 };
    const cfg = ARC_LAYOUTS[layoutMode];
    if (!cfg) return { x: 0, y: 1 };
    const len = Math.hypot(cfg.subDx, cfg.subDy);
    if (!len) return { x: 0, y: 1 };
    return { x: cfg.subDx / len, y: cfg.subDy / len };
  }

  function layoutPosition(index, count, mode) {
    if (isVerticalLayout()) return { x: 0, y: 0 };
    if (mode.startsWith("linear")) return linearPosition(index, count, mode);
    return arcPosition(index, count, mode);
  }

  function primaryHighlightIndex() {
    if (!highlightId) return -1;
    const idx = options.findIndex((o) => o.id === highlightId);
    return idx >= 0 ? idx : -1;
  }

  function primaryButtonDiameter(index, highlightIdx) {
    return index === highlightIdx ? BTN_HIGHLIGHT : BTN_SIZE;
  }

  function fanShiftForRowWidth(totalWidth) {
    const half = totalWidth / 2;
    const vw = window.innerWidth;
    let center = anchor.x + fanShiftX;
    if (center - half < VIEW_MARGIN) center = VIEW_MARGIN + half;
    if (center + half > vw - VIEW_MARGIN) center = vw - VIEW_MARGIN - half;
    return center - anchor.x;
  }

  function linearPositionsWithHighlight(highlightIdx) {
    const count = options.length;
    const y = primaryLinearRowY(layoutMode);
    const diameters = options.map((_, i) => primaryButtonDiameter(i, highlightIdx));
    const totalW = diameters.reduce((a, b) => a + b, 0) + PRIMARY_GAP * Math.max(0, count - 1);
    const shift = fanShiftForRowWidth(totalW);
    let xLeft = shift - totalW / 2;
    return diameters.map((d) => {
      const pos = { x: xLeft + d / 2, y };
      xLeft += d + PRIMARY_GAP;
      return pos;
    });
  }

  function arcPositionsWithHighlight(highlightIdx) {
    const count = options.length;
    const bases = options.map((_, i) => arcPosition(i, count, layoutMode));
    if (highlightIdx < 0) return bases;
    const hi = bases[highlightIdx];
    const push = (BTN_HIGHLIGHT - BTN_SIZE) * 0.5;
    return bases.map((p, i) => {
      if (i === highlightIdx) return p;
      const dx = p.x - hi.x;
      const dy = p.y - hi.y;
      const dist = Math.hypot(dx, dy) || 1;
      const steps = Math.abs(i - highlightIdx);
      const falloff = steps === 1 ? 1 : steps === 2 ? 0.55 : 0.3;
      const m = push * falloff;
      return { x: p.x + (dx / dist) * m, y: p.y + (dy / dist) * m };
    });
  }

  function computePrimaryPositions(highlightIdx) {
    const count = options.length;
    if (highlightIdx < 0) {
      return options.map((_, i) => layoutPosition(i, count, layoutMode));
    }
    if (layoutMode.startsWith("linear")) {
      return linearPositionsWithHighlight(highlightIdx);
    }
    if (ARC_LAYOUTS[layoutMode]) {
      return arcPositionsWithHighlight(highlightIdx);
    }
    return options.map((_, i) => layoutPosition(i, count, layoutMode));
  }

  function scheduleMenuRelayout() {
    if (menuRelayoutRaf) cancelAnimationFrame(menuRelayoutRaf);
    menuRelayoutRaf = requestAnimationFrame(() => {
      menuRelayoutRaf = null;
      relayoutPrimaryFan();
      relayoutSubFan();
    });
  }

  function relayoutPrimaryFan() {
    if (!open || isVerticalLayout()) return;
    const highlightIdx = primaryHighlightIndex();
    const positions = computePrimaryPositions(highlightIdx);
    const buttons = [...fanEl.querySelectorAll(".radial-menu-option:not(.radial-menu-option--sub)")];
    buttons.forEach((btn, i) => {
      const pos = positions[i];
      if (!pos) return;
      const size = i === highlightIdx ? BTN_HIGHLIGHT : BTN_SIZE;
      btn.style.setProperty("--opt-size", `${size}px`);
      btn.style.setProperty("--pop-x", `${pos.x}px`);
      btn.style.setProperty("--pop-y", `${pos.y}px`);
    });
  }

  function relayoutSubFan() {
    if (!open || !subOptions.length) return;
    syncSubmenuShift();
    const subHi = subHighlightedIndex();
    const grid = subGridLayout(subHi);
    const buttons = [...subFanEl.querySelectorAll(".radial-menu-option--sub")];
    buttons.forEach((btn, i) => {
      const pos = grid.positions[i];
      const sz = grid.sizes[i];
      if (!pos || !sz) return;
      btn.style.setProperty("--sub-w", `${sz.w}px`);
      btn.style.setProperty("--sub-h", `${sz.h}px`);
      btn.style.setProperty("--pop-x", `${pos.x + subShiftX}px`);
      btn.style.setProperty("--pop-y", `${pos.y + subShiftY}px`);
    });
  }

  function resolveSubmenu(opt) {
    if (!opt?.submenu) return [];
    return typeof opt.submenu === "function" ? opt.submenu() : opt.submenu;
  }

  function parentOptionPos(parentId) {
    const index = options.findIndex((o) => o.id === parentId);
    if (index < 0) return { x: 0, y: 0 };
    const positions = computePrimaryPositions(primaryHighlightIndex());
    return positions[index] || layoutPosition(index, options.length, layoutMode);
  }

  function subRowPosition(subIndex) {
    const { positions } = subGridLayout();
    const pos = positions[subIndex];
    if (!pos) return { x: 0, y: 0 };
    return { x: pos.x + subShiftX, y: pos.y + subShiftY };
  }

  function setBodyLock(on) {
    document.body.classList.toggle("menu-active", on);
    const scroll = document.getElementById("app-scroll");
    if (scroll) scroll.style.touchAction = on ? "none" : "";

    if (on) {
      window.getSelection()?.removeAllRanges();
      bodyHandlers.touchmove = (e) => {
        e.preventDefault();
        if (e.touches.length > 1) e.stopPropagation();
      };
      bodyHandlers.selectstart = (e) => e.preventDefault();
      bodyHandlers.contextmenu = (e) => e.preventDefault();
      bodyHandlers.gesturestart = (e) => e.preventDefault();
      document.addEventListener("touchmove", bodyHandlers.touchmove, { passive: false });
      document.addEventListener("selectstart", bodyHandlers.selectstart);
      document.addEventListener("contextmenu", bodyHandlers.contextmenu);
      document.addEventListener("gesturestart", bodyHandlers.gesturestart, { passive: false });
    } else {
      if (bodyHandlers.touchmove) document.removeEventListener("touchmove", bodyHandlers.touchmove);
      if (bodyHandlers.selectstart) document.removeEventListener("selectstart", bodyHandlers.selectstart);
      if (bodyHandlers.contextmenu) document.removeEventListener("contextmenu", bodyHandlers.contextmenu);
      if (bodyHandlers.gesturestart) document.removeEventListener("gesturestart", bodyHandlers.gesturestart);
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
    } else if (isVerticalLayout()) {
      offsetY = 0;
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
      pos = subRowPosition(index);
      const sz = subItemSize(index, subHighlightedIndex());
      btn.style.setProperty("--sub-ox", `${parentPos.x}px`);
      btn.style.setProperty("--sub-oy", `${parentPos.y}px`);
      btn.style.setProperty("--sub-w", `${sz.w}px`);
      btn.style.setProperty("--sub-h", `${sz.h}px`);
    } else {
      const positions = computePrimaryPositions(primaryHighlightIndex());
      pos = positions[index] || layoutPosition(index, options.length, layoutMode);
      const size = index === primaryHighlightIndex() ? BTN_HIGHLIGHT : BTN_SIZE;
      btn.style.setProperty("--opt-size", `${size}px`);
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
      const iconVal = opt.icon || "";
      if (String(iconVal).includes("<svg")) icon.innerHTML = iconVal;
      else icon.textContent = iconVal;
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
    if (isVerticalLayout()) fanEl.classList.add("radial-menu-fan--vertical");

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
    subFanEl.classList.toggle("radial-menu-subfan--open", subOptions.length > 0);
    subFanEl.classList.toggle("radial-menu-subfan--vertical", isVerticalLayout());
    if (!open || !subOptions.length) {
      subFanEl.innerHTML = "";
      subFanEl.classList.remove("radial-menu-subfan--open");
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
    if (!subOptions.length) {
      subShiftX = 0;
      subShiftY = 0;
      return;
    }

    subShiftX = 0;
    subShiftY = 0;
    let grid = subGridLayout();
    if (!grid.positions.length) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    grid.positions.forEach((p, i) => {
      if (!p) return;
      const sz = grid.sizes?.[i];
      const hw = (sz?.w || grid.widths[i] || SUB_MIN_W) / 2;
      const hh = (sz?.h || SUB_HEIGHT) / 2;
      const absX = anchor.x + p.x;
      const absY = anchor.y + p.y;
      minX = Math.min(minX, absX - hw);
      maxX = Math.max(maxX, absX + hw);
      minY = Math.min(minY, absY - hh);
      maxY = Math.max(maxY, absY + hh);
    });

    let dx = 0;
    let dy = 0;
    if (minX < VIEW_MARGIN) dx = VIEW_MARGIN - minX;
    if (maxX > vw - VIEW_MARGIN) dx = vw - VIEW_MARGIN - maxX;
    if (minY < VIEW_MARGIN) dy = VIEW_MARGIN - minY;
    if (maxY > vh - VIEW_MARGIN) dy = vh - VIEW_MARGIN - maxY;

    if (isVerticalLayout()) {
      subShiftY = dy;
      subShiftX = dx;
    } else {
      subShiftX = dx;
      subShiftY = dy;
    }
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

  function resolveTagPalette(opt) {
    if (!opt?.tagPalette) return null;
    return typeof opt.tagPalette === "function" ? opt.tagPalette() : opt.tagPalette;
  }

  function clearTagPaletteTimer() {
    clearTimeout(tagPaletteTimer);
    tagPaletteTimer = null;
  }

  function closePairedPalette(animate = false) {
    if (!tagPaletteActive) return;
    tagPaletteActive = false;
    tagPaletteOptionId = null;
    window.AnchoredTagPalette?.close(animate);
  }

  function scheduleTagPaletteOpen(opt) {
    clearTagPaletteTimer();
    if (!opt?.tagPalette || tagPaletteActive) return;
    tagPaletteTimer = setTimeout(() => {
      tagPaletteTimer = null;
      if (!open || highlightId !== opt.id) return;
      const btn = fanEl.querySelector(`[data-menu-option="${opt.id}"]`);
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const cfg = resolveTagPalette(opt);
      const palette = window.AnchoredTagPalette;
      if (!cfg || !palette?.openFrom) return;
      tagPaletteActive = true;
      tagPaletteOptionId = opt.id;
      palette.openFrom(rect, { ...cfg, paired: true }, null, lastPointer.x, lastPointer.y);
    }, TAG_PALETTE_HOLD_MS);
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
    if (tagPaletteActive && id && id !== tagPaletteOptionId) {
      closePairedPalette(false);
    }
    if (id !== highlightId) clearTagPaletteTimer();
    if (id === highlightId) return;
    highlightId = id;

    let subJustOpened = false;
    const highlighted = options.find((o) => o.id === id);
    const submenuTrigger = options.find((o) => o.submenu && o.id === id);
    if (submenuTrigger) {
      const hadSubRow = subOptions.length > 0 && submenuParentId === submenuTrigger.id;
      openSubRowFor(submenuTrigger.id);
      subJustOpened = !hadSubRow && subOptions.length > 0;
    } else if (highlighted?.tagPalette) {
      closeSubRow();
      scheduleTagPaletteOpen(highlighted);
    } else if (id && subOptions.some((o) => o.id === id)) {
      /* keep sub-row open while on a tag pill */
    } else if (id && options.some((o) => o.id === id)) {
      closeSubRow();
    }
    /* null id while sub-row open: finger in transit — keep sub-row */

    updateHighlight();
    scheduleMenuRelayout();
  }

  function hitTest(clientX, clientY) {
    if (highlightId) {
      const sticky = root.querySelector(`[data-menu-option="${highlightId}"]`);
      if (sticky) {
        const r = sticky.getBoundingClientRect();
        const pad = 12;
        if (
          clientX >= r.left - pad &&
          clientX <= r.right + pad &&
          clientY >= r.top - pad &&
          clientY <= r.bottom + pad
        ) {
          return highlightId;
        }
      }
    }
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
    clearTagPaletteTimer();
    closePairedPalette(false);
    open = false;
    highlightId = null;
    activePointerId = null;
    keepOpenOnSelect = false;
    selectionHandled = false;
    fanShiftX = 0;
    subShiftX = 0;
    subShiftY = 0;
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
    root.classList.add("radial-menu-root--opening");
    setTimeout(() => root?.classList.remove("radial-menu-root--opening"), 520);
    renderFan(true);
    renderSubRow(false);
  }

  function finishPointer(activeId) {
    if (!open || activeId !== activePointerId || selectionHandled) return;
    selectionHandled = true;
    clearTagPaletteTimer();

    if (tagPaletteActive) {
      const selected = window.AnchoredTagPalette?.finishPairedPointer?.(
        lastPointer.x,
        lastPointer.y
      );
      tagPaletteActive = false;
      tagPaletteOptionId = null;
      try {
        triggerEl.releasePointerCapture(activeId);
      } catch {
        /* ignore */
      }
      activePointerId = null;
      closeMenu();
      if (selected) return;
      return;
    }

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

    if (opt.tagPalette) {
      resolveTagPalette(opt)?.onTap?.();
      return true;
    }

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
      lastPointer.x = e.clientX;
      lastPointer.y = e.clientY;
      if (tagPaletteActive) {
        window.AnchoredTagPalette?.handlePairedPointer?.(e.clientX, e.clientY);
      }
      setHighlight(hitTest(e.clientX, e.clientY));
    });

    el.addEventListener("pointerup", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      finishPointer(e.pointerId);
    });
    el.addEventListener("pointercancel", () => closeMenu());
  }

  function openTagPicker(x, y, getTagOptions, opts = {}) {
    ensureRoot();
    anchor = { x, y };
    const tagLayout = opts.layout || pickLayout(x, y, 1);
    const resolvedTags =
      typeof getTagOptions === "function" ? getTagOptions() : getTagOptions;

    keepOpenOnSelect = true;
    layoutMode = tagLayout;
    fanShiftX = 0;
    submenuParentId = null;
    subOptions = [];
    open = true;
    highlightId = null;
    positionUi();
    triggerEl.classList.add("radial-menu-trigger--open");
    triggerEl.setAttribute("aria-expanded", "true");
    setBodyLock(true);

    if (isVerticalLayout()) {
      options = [];
      submenuParentId = "tags";
      subOptions = Array.isArray(resolvedTags) ? resolvedTags : [];
      syncSubmenuShift();
      renderFan(false);
      renderSubRow(true);
      return;
    }

    options = [
      {
        id: "tags",
        label: "Tags",
        icon: opts.parentIcon || "",
        submenu: () => (typeof getTagOptions === "function" ? getTagOptions() : resolvedTags),
        submenuKeepOpen: true,
        onSelect: opts.onMore || (() => {}),
      },
    ];
    fanShiftX = computeFanShift(1, layoutMode);
    renderFan(true);
    openSubRowFor("tags");
  }

  function bindTagButton(btn, { onTap, getTagOptions, onMore, parentIcon, layout } = {}) {
    const TAP_MAX_MS = 320;
    let startX = 0;
    let startY = 0;
    let pointerId = null;
    let moved = false;
    let longFired = false;
    let startTime = 0;
    let longPressTimer = null;

    const clearTimer = () => {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    };

    const onPointerDown = (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      if (open) {
        e.preventDefault();
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
      startTime = performance.now();
      pointerId = e.pointerId;
      clearTimer();
      btn.classList.add("press-radial-holding");
      longPressTimer = setTimeout(() => {
        longFired = true;
        clearTimer();
        btn.classList.add("press-radial-armed");
        navigator.vibrate?.(10);
        openTagPicker(startX, startY, getTagOptions, { onMore: onMore || onTap, parentIcon, layout });
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
      if (!open && Math.hypot(e.clientX - startX, e.clientY - startY) > 10) {
        clearTimer();
        moved = true;
        btn.classList.remove("press-radial-holding");
      }
      if (open && e.pointerId === activePointerId) {
        e.preventDefault();
        setHighlight(hitTest(e.clientX, e.clientY));
      }
    };

    const onPointerUp = (e) => {
      if (e.pointerId !== pointerId) return;
      clearTimer();
      btn.classList.remove("press-radial-holding", "press-radial-armed");
      if (open && longFired) {
        e.preventDefault();
        e.stopPropagation();
        finishPointer(pointerId);
        longFired = false;
        pointerId = null;
        return;
      }
      if (!moved && performance.now() - startTime < TAP_MAX_MS) {
        e.preventDefault();
        e.stopPropagation();
        onTap?.();
      }
      pointerId = null;
    };

    btn.addEventListener("pointerdown", onPointerDown);
    btn.addEventListener("pointermove", onPointerMove);
    btn.addEventListener("pointerup", onPointerUp);
    btn.addEventListener("pointercancel", () => {
      clearTimer();
      btn.classList.remove("press-radial-holding", "press-radial-armed");
    });
    btn.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      openTagPicker(e.clientX, e.clientY, getTagOptions, { onMore: onMore || onTap, parentIcon, layout });
    });
  }

  function bindCardLongPress(card, getActionOptions, onLongPressStart, onLongPressEnd) {
    let startX = 0;
    let startY = 0;
    let pointerId = null;
    let moved = false;
    let longFired = false;
    let holdLockTimer = null;

    const clearHoldLock = () => {
      clearTimeout(holdLockTimer);
      holdLockTimer = null;
      card.classList.remove("press-radial-holding");
    };

    const clearTimer = () => {
      clearTimeout(longPressTimer);
      longPressTimer = null;
      clearHoldLock();
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
      holdLockTimer = setTimeout(() => {
        if (moved || pointerId === null) return;
        card.classList.add("press-radial-holding");
        window.getSelection()?.removeAllRanges();
      }, HOLD_LOCK_MS);
      longPressTimer = setTimeout(() => {
        longFired = true;
        clearTimer();
        card.classList.add("press-radial-armed");
        onLongPressStart?.();
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
        lastPointer.x = e.clientX;
        lastPointer.y = e.clientY;
        if (tagPaletteActive) {
          window.AnchoredTagPalette?.handlePairedPointer?.(e.clientX, e.clientY);
        }
        setHighlight(hitTest(e.clientX, e.clientY));
      }
    };

    const onPointerUp = (e) => {
      if (e.pointerId !== pointerId) return;
      clearTimer();
      card.classList.remove("press-radial-holding", "press-radial-armed");
      if (open && longFired) {
        e.preventDefault();
        e.stopPropagation();
        finishPointer(pointerId);
        longFired = false;
        onLongPressEnd?.();
        return;
      }
      onLongPressEnd?.();
      pointerId = null;
    };

    const onTouchStart = (e) => {
      if (e.touches.length > 1) e.preventDefault();
    };

    card.addEventListener("pointerdown", onPointerDown);
    card.addEventListener("pointermove", onPointerMove);
    card.addEventListener("pointerup", onPointerUp);
    card.addEventListener("pointercancel", clearTimer);
    card.addEventListener("touchstart", onTouchStart, { passive: false });
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
    bindTagButton,
    openTagPicker,
    refreshSubmenu,
    getAnchor,
    close: closeMenu,
    isOpen: () => open,
  };
})();
