window.VideoGroups = {
  SESSION_KEY: "rolloSessionUnlocks",

  getDefault() {
    return localStorage.getItem("defaultGroup") || "";
  },

  setDefault(groupId) {
    if (groupId) localStorage.setItem("defaultGroup", groupId);
    else localStorage.removeItem("defaultGroup");
  },

  getActive() {
    return localStorage.getItem("activeGroup") || "";
  },

  setActive(groupId) {
    if (groupId) localStorage.setItem("activeGroup", groupId);
    else localStorage.removeItem("activeGroup");
  },

  getLockMode(group) {
    if (!group?.locked) return null;
    return group.lockMode === "once" ? "once" : "always";
  },

  _relockTimer: null,
  _relockMinutes: 0,

  setRelockMinutes(minutes) {
    this._relockMinutes = Math.max(0, Number(minutes) || 0);
    this._scheduleRelock();
  },

  _scheduleRelock() {
    clearTimeout(this._relockTimer);
    if (!this._relockMinutes) return;
    this._relockTimer = setTimeout(() => {
      const active = this.getActive();
      if (active) this.clearUnlockToken(active);
    }, this._relockMinutes * 60 * 1000);
  },

  getStoredUnlockTokens() {
    try {
      return JSON.parse(localStorage.getItem("groupUnlocks") || "{}");
    } catch {
      return {};
    }
  },

  getSessionUnlockTokens() {
    try {
      return JSON.parse(sessionStorage.getItem(this.SESSION_KEY) || "{}");
    } catch {
      return {};
    }
  },

  setSessionUnlockToken(groupId, token) {
    const tokens = this.getSessionUnlockTokens();
    if (token) tokens[groupId] = token;
    else delete tokens[groupId];
    sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(tokens));
  },

  getUnlockTokens() {
    return { ...this.getStoredUnlockTokens(), ...this.getSessionUnlockTokens() };
  },

  hasUnlockToken(groupId) {
    return !!this.getUnlockTokens()[groupId];
  },

  isGroupAccessible(group) {
    if (!group?.locked) return true;
    return this.hasUnlockToken(group.id);
  },

  setUnlockToken(groupId, token, persist = "session") {
    if (persist === "device") {
      const tokens = this.getStoredUnlockTokens();
      tokens[groupId] = token;
      localStorage.setItem("groupUnlocks", JSON.stringify(tokens));
    } else {
      const tokens = this.getStoredUnlockTokens();
      if (tokens[groupId]) {
        delete tokens[groupId];
        localStorage.setItem("groupUnlocks", JSON.stringify(tokens));
      }
    }
    this.setSessionUnlockToken(groupId, token);
    this._scheduleRelock();
  },

  clearUnlockToken(groupId) {
    const tokens = this.getStoredUnlockTokens();
    if (tokens[groupId]) {
      delete tokens[groupId];
      localStorage.setItem("groupUnlocks", JSON.stringify(tokens));
    }
    this.setSessionUnlockToken(groupId, null);
  },

  leaveGroup(group) {
    const id = typeof group === "string" ? group : group?.id;
    if (!id) return;
    this.clearUnlockToken(id);
    if (group && typeof group === "object") group.unlocked = false;
  },

  switchAwayFromGroup(groupId) {
    if (!groupId) return;
    this.clearUnlockToken(groupId);
  },

  prepareProfileSwitch(previousId, nextGroup) {
    const nextId = nextGroup?.id;
    if (!nextId) return;
    if (previousId && previousId !== nextId) {
      this.clearUnlockToken(previousId);
    }
    if (nextGroup.locked && previousId !== nextId) {
      this.clearUnlockToken(nextId);
      nextGroup.unlocked = false;
    }
  },

  headers(groupId) {
    groupId = groupId || this.getActive();
    if (!groupId) return {};
    const token = this.getUnlockTokens()[groupId];
    return token ? { "X-Unlocked": token } : {};
  },

  query(groupId) {
    groupId = groupId || this.getActive();
    return groupId ? `group=${encodeURIComponent(groupId)}` : "";
  },

  mediaUrl(url, groupId) {
    if (!url) return url;
    groupId = groupId || this.getActive();
    const token = this.getUnlockTokens()[groupId];
    if (!token) return url;
    const hashIdx = url.indexOf("#");
    const base = hashIdx === -1 ? url : url.slice(0, hashIdx);
    const hash = hashIdx === -1 ? "" : url.slice(hashIdx);
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}unlocked=${encodeURIComponent(token)}${hash}`;
  },

  authVideos(videos, groupId) {
    groupId = groupId || this.getActive();
    return (videos || []).map((v) => ({
      ...v,
      url: this.mediaUrl(v.url, v.group || groupId),
    }));
  },

  apiFetch(url, options = {}, groupId) {
    groupId = groupId || this.getActive();
    const hasGroup = /[?&]group=/.test(url);
    let fullUrl = url;
    if (groupId && !hasGroup) {
      const sep = url.includes("?") ? "&" : "?";
      fullUrl = `${url}${sep}${this.query(groupId)}`;
    }
    const authGroup = hasGroup
      ? (new URL(fullUrl, location.origin).searchParams.get("group") || groupId)
      : groupId;
    const headers = { ...(options.headers || {}), ...this.headers(authGroup) };
    return fetch(fullUrl, { ...options, headers });
  },

  pruneStaleUnlocks(groups) {
    if (!groups?.length) return;
    const ids = new Set(groups.map((g) => g.id));
    const tokens = this.getStoredUnlockTokens();
    let changed = false;
    Object.keys(tokens).forEach((id) => {
      if (!ids.has(id)) {
        delete tokens[id];
        changed = true;
      }
    });
    if (changed) localStorage.setItem("groupUnlocks", JSON.stringify(tokens));
  },

  syncUrlGroup(groupId) {
    groupId = groupId ?? this.getActive();
    const url = new URL(location.href);
    if (groupId) url.searchParams.set("group", groupId);
    else url.searchParams.delete("group");
    const next = url.pathname + url.search;
    if (location.pathname + location.search !== next) {
      history.replaceState(null, "", next);
    }
  },

  pickDefaultGroup(groups) {
    if (!groups?.length) return "";
    const preferred = this.getDefault();
    const preferredGroup = groups.find((g) => g.id === preferred);
    if (preferredGroup && this.isGroupAccessible(preferredGroup)) return preferredGroup.id;
    const accessible = groups.find((g) => this.isGroupAccessible(g));
    return accessible?.id || groups[0].id;
  },

  ensureAccessibleGroup(groups, preferredId) {
    const preferred = groups.find((g) => g.id === preferredId);
    if (preferred && this.isGroupAccessible(preferred)) return preferred.id;
    return this.pickDefaultGroup(groups);
  },

  watchShareUrl(video, groupId) {
    if (!video?.name) return location.href;
    groupId = groupId || video.group || this.getActive();
    const params = new URLSearchParams();
    if (groupId) params.set("group", groupId);
    params.set("video", video.name);
    return new URL(`/watch.html?${params}`, location.origin).href;
  },

  async shareNative({ title, url }) {
    const payload = { title: title || "Rollo", url };
    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare(payload))) {
        await navigator.share(payload);
        return { ok: true, method: "share" };
      }
    } catch (err) {
      if (err?.name === "AbortError") return { ok: false, cancelled: true };
    }
    try {
      await navigator.clipboard.writeText(url);
      return { ok: true, method: "clipboard" };
    } catch {
      return { ok: false };
    }
  },
};
