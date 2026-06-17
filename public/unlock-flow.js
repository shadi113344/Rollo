/**
 * Inline + overlay unlock UI for locked libraries.
 */
window.RolloUnlockFlow = (function () {
  let gridOverlay = null;
  let inlineWrap = null;
  let inlineHostRow = null;
  let pendingGroup = null;
  let successCb = null;
  let cancelCb = null;

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function lockIcon(size = 18) {
    return window.RolloIcons?.lock(size) || "🔒";
  }

  function supportsBiometricFill() {
    return !!(window.PasswordCredential || navigator.credentials?.get);
  }

  function shake(el) {
    if (!el) return;
    el.classList.remove("shake");
    void el.offsetWidth;
    el.classList.add("shake");
    el.addEventListener("animationend", () => el.classList.remove("shake"), { once: true });
  }

  function haptic() {
    try {
      navigator.vibrate?.(36);
    } catch {
      /* ignore */
    }
  }

  async function tryBiometricFill(input) {
    if (!navigator.credentials?.get) return false;
    try {
      const cred = await navigator.credentials.get({ password: true, mediation: "optional" });
      if (cred?.password) {
        input.value = cred.password;
        return true;
      }
    } catch {
      /* user dismissed or unavailable */
    }
    return false;
  }

  async function requestUnlock(group, password) {
    const res = await fetch(`/api/groups/${encodeURIComponent(group.id)}/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, token: data.token, error: data.error || "Wrong password" };
  }

  function buildCard(group, variant) {
    const name = group.displayName || group.name || group.id;
    const card = document.createElement("div");
    card.className = `unlock-glass-card unlock-glass-card--${variant}`;
    card.innerHTML = `
      <div class="unlock-card-head">
        <div class="unlock-card-icon" aria-hidden="true">${lockIcon(18)}</div>
        <div class="unlock-card-titles">
          <h3>Unlock ${escapeHtml(name)}</h3>
          <p>Enter the library password to continue.</p>
        </div>
      </div>
      <label class="sheet-label" for="unlock-pass-${variant}">Password</label>
      <input class="unlock-pass-input" id="unlock-pass-${variant}" type="password" placeholder="Password" autocomplete="current-password" inputmode="text">
      <p class="unlock-error" hidden role="alert"></p>
      <label class="unlock-remember">
        <input type="checkbox" class="unlock-remember-check">
        <span>Stay unlocked on this device</span>
      </label>
      <div class="unlock-actions">
        <button type="button" class="unlock-submit-btn">Unlock</button>
        <button type="button" class="unlock-cancel-btn">Cancel</button>
      </div>
      <button type="button" class="unlock-bio-btn" hidden>Use saved password</button>
    `;
    return card;
  }

  function defaultRemember(group) {
    return group?.lockMode !== "always";
  }

  function wireCard(card, group) {
    const input = card.querySelector(".unlock-pass-input");
    const errorEl = card.querySelector(".unlock-error");
    const rememberEl = card.querySelector(".unlock-remember-check");
    const submitBtn = card.querySelector(".unlock-submit-btn");
    const cancelBtn = card.querySelector(".unlock-cancel-btn");
    const bioBtn = card.querySelector(".unlock-bio-btn");

    rememberEl.checked = defaultRemember(group);

    if (supportsBiometricFill()) {
      bioBtn.hidden = false;
      bioBtn.addEventListener("click", async () => {
        const filled = await tryBiometricFill(input);
        if (filled) handleSubmit();
      });
    }

    async function handleSubmit() {
      errorEl.hidden = true;
      input.classList.remove("is-error");
      submitBtn.disabled = true;
      const result = await requestUnlock(group, input.value);
      submitBtn.disabled = false;
      if (!result.ok) {
        shake(card);
        haptic();
        errorEl.textContent = result.error;
        errorEl.hidden = false;
        input.classList.add("is-error");
        input.focus();
        input.select();
        return;
      }
      const persist = rememberEl.checked ? "device" : "session";
      if (result.token) {
        VideoGroups.setUnlockToken(group.id, result.token, persist);
      }
      const unlocked = { ...group, unlocked: true };
      const onSuccess = successCb;
      close();
      onSuccess?.(unlocked);
    }

    submitBtn.addEventListener("click", handleSubmit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleSubmit();
    });
    cancelBtn.addEventListener("click", () => {
      close();
      cancelCb?.();
    });

    requestAnimationFrame(() => input.focus());
    return card;
  }

  function ensureGridOverlay() {
    if (gridOverlay) return gridOverlay;
    gridOverlay = document.createElement("div");
    gridOverlay.id = "unlock-grid-overlay";
    gridOverlay.className = "unlock-grid-overlay";
    gridOverlay.innerHTML = '<div class="unlock-grid-backdrop" aria-hidden="true"></div>';
    gridOverlay.querySelector(".unlock-grid-backdrop").addEventListener("click", () => {
      close();
      cancelCb?.();
    });
    document.body.appendChild(gridOverlay);
    return gridOverlay;
  }

  function closeInline() {
    const groupSheet = document.getElementById("group-sheet");
    groupSheet?.classList.remove("group-sheet--unlocking");
    document.getElementById("app-scroll")?.classList.remove("unlock-dimmed");
    inlineWrap?.classList.remove("open");
    inlineHostRow?.classList.remove("unlock-target");
    if (inlineWrap) {
      inlineWrap.remove();
      inlineWrap = null;
    }
    inlineHostRow = null;
  }

  function closeGrid() {
    gridOverlay?.classList.remove("open");
    gridOverlay?.querySelector(".unlock-glass-card")?.remove();
    document.getElementById("app-scroll")?.classList.remove("unlock-dimmed");
  }

  function close() {
    pendingGroup = null;
    successCb = null;
    cancelCb = null;
    closeInline();
    closeGrid();
  }

  function open(group, options = {}) {
    close();
    pendingGroup = group;
    successCb = options.onSuccess || null;
    cancelCb = options.onCancel || null;

    if (options.inlineRow) {
      openInline(group, options.inlineRow);
      return;
    }
    openGrid(group);
  }

  function openGrid(group) {
    const overlay = ensureGridOverlay();
    const card = wireCard(buildCard(group, "grid"), group);
    overlay.appendChild(card);
    document.getElementById("app-scroll")?.classList.add("unlock-dimmed");
    requestAnimationFrame(() => overlay.classList.add("open"));
  }

  function openInline(group, row) {
    closeInline();
    pendingGroup = group;
    const groupSheet = document.getElementById("group-sheet");
    groupSheet?.classList.add("group-sheet--unlocking");
    row.classList.add("unlock-target");
    inlineHostRow = row;

    inlineWrap = document.createElement("div");
    inlineWrap.className = "group-inline-unlock";
    const card = wireCard(buildCard(group, "inline"), group);
    inlineWrap.appendChild(card);
    row.insertAdjacentElement("afterend", inlineWrap);
    requestAnimationFrame(() => inlineWrap.classList.add("open"));
  }

  return {
    open,
    openGrid,
    openInline,
    close,
    get pending() {
      return pendingGroup;
    },
  };
})();
