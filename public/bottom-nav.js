/**
 * Long-press on the Profile tab shows a compact menu of other libraries for quick switch.
 */
window.BottomNav = {
  LONG_PRESS_MS: 500,
  DOUBLE_TAP_MS: 320,
  _profileHref: "/",

  setProfileHref(href) {
    this._profileHref = href || "/";
  },

  init({ getGroups, onSelectGroup }) {
    const profileTab = document.getElementById("profile-tab");
    const menu = document.getElementById("profile-switch-menu");
    if (!profileTab || !menu) return;

    let open = false;
    let longPressed = false;
    let pressTimer = null;
    let startX = 0;
    let startY = 0;
    let moved = false;
    let lastTapAt = 0;
    let singleTapTimer = null;

    const clearPress = () => {
      clearTimeout(pressTimer);
      pressTimer = null;
      profileTab.classList.remove("pressing");
    };

    const sortedGroups = (groups) => {
      if (!groups?.length) return [];
      try {
        const order = JSON.parse(localStorage.getItem("groupOrder") || "[]");
        if (!Array.isArray(order) || !order.length) return groups;
        const rank = new Map(order.map((id, i) => [id, i]));
        return [...groups].sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));
      } catch {
        return groups;
      }
    };

    const closeMenu = () => {
      if (!open) return;
      open = false;
      menu.hidden = true;
      document.removeEventListener("pointerdown", onDocPointer, true);
    };

    const renderMenu = () => {
      const groups = sortedGroups(getGroups?.() || []);
      const activeId = VideoGroups.getActive();
      const others = groups.filter((g) => g.id !== activeId);
      menu.innerHTML = "";
      others.forEach((group) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "profile-switch-item";
        btn.setAttribute("role", "menuitem");
        const name = group.displayName || group.name || group.id;
        const locked = group.locked && !group.unlocked;
        if (locked && window.RolloIcons) {
          const label = document.createElement("span");
          label.textContent = name;
          btn.appendChild(label);
          const lock = document.createElement("span");
          lock.className = "inline-lock";
          lock.setAttribute("aria-hidden", "true");
          lock.innerHTML = RolloIcons.lock(12);
          btn.appendChild(document.createTextNode(" "));
          btn.appendChild(lock);
        } else {
          btn.textContent = name;
        }
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          closeMenu();
          onSelectGroup?.(group.id);
        });
        menu.appendChild(btn);
      });
      return others.length > 0;
    };

    const openMenu = () => {
      if (!renderMenu()) return;
      open = true;
      menu.hidden = false;
      document.addEventListener("pointerdown", onDocPointer, true);
      navigator.vibrate?.(10);
    };

    const onDocPointer = (e) => {
      if (menu.contains(e.target) || profileTab.contains(e.target)) return;
      closeMenu();
    };

    const cancelSingleTap = () => {
      clearTimeout(singleTapTimer);
      singleTapTimer = null;
    };

    const goProfile = () => {
      const href = this._profileHref;
      if (location.pathname + location.search !== href) {
        location.href = href;
      }
    };

    const switchToNextProfile = () => {
      const groups = sortedGroups(getGroups?.() || []);
      if (groups.length < 2) return;
      const activeId = VideoGroups.getActive();
      const idx = groups.findIndex((g) => g.id === activeId);
      const next = groups[(idx + 1) % groups.length];
      if (!next || next.id === activeId) return;
      closeMenu();
      navigator.vibrate?.(10);
      onSelectGroup?.(next.id);
    };

    const scheduleSingleTap = () => {
      cancelSingleTap();
      singleTapTimer = setTimeout(() => {
        singleTapTimer = null;
        lastTapAt = 0;
        goProfile();
      }, this.DOUBLE_TAP_MS);
    };

    const triggerLongPress = () => {
      cancelSingleTap();
      lastTapAt = 0;
      longPressed = true;
      clearPress();
      openMenu();
    };

    profileTab.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length > 1) return;
        longPressed = false;
        moved = false;
        const t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
        profileTab.classList.add("pressing");
        pressTimer = setTimeout(() => triggerLongPress(), this.LONG_PRESS_MS);
      },
      { passive: true }
    );

    profileTab.addEventListener("touchmove", (e) => {
      const t = e.touches[0];
      if (Math.hypot(t.clientX - startX, t.clientY - startY) > 12) {
        moved = true;
        clearPress();
      }
    }, { passive: true });

    profileTab.addEventListener("touchend", () => clearPress());
    profileTab.addEventListener("touchcancel", () => clearPress());

    profileTab.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch") return;
      if (e.button !== 0) return;
      longPressed = false;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      profileTab.classList.add("pressing");
      pressTimer = setTimeout(() => triggerLongPress(), this.LONG_PRESS_MS);
    });

    profileTab.addEventListener("pointermove", (e) => {
      if (!pressTimer || e.pointerType === "touch") return;
      if (Math.hypot(e.clientX - startX, e.clientY - startY) > 12) {
        moved = true;
        clearPress();
      }
    });

    profileTab.addEventListener("pointerup", () => clearPress());
    profileTab.addEventListener("pointercancel", () => clearPress());

    profileTab.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      triggerLongPress();
    });

    profileTab.addEventListener("click", (e) => {
      if (longPressed) {
        e.preventDefault();
        longPressed = false;
        return;
      }
      if (open) {
        e.preventDefault();
        closeMenu();
        return;
      }
      if (moved) {
        e.preventDefault();
        moved = false;
        return;
      }

      const now = Date.now();
      if (now - lastTapAt <= this.DOUBLE_TAP_MS) {
        e.preventDefault();
        cancelSingleTap();
        lastTapAt = 0;
        switchToNextProfile();
        return;
      }

      lastTapAt = now;
      e.preventDefault();
      scheduleSingleTap();
    });
  },
};
