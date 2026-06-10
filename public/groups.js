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

  setUnlockToken(groupId, token) {
    this.setSessionUnlockToken(groupId, token);
    const tokens = this.getStoredUnlockTokens();
    if (tokens[groupId]) {
      delete tokens[groupId];
      localStorage.setItem("groupUnlocks", JSON.stringify(tokens));
    }
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

  headers() {
    const active = this.getActive();
    if (!active) return {};
    const token = this.getUnlockTokens()[active];
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
    const sep = url.includes("?") ? "&" : "?";
    const fullUrl = groupId ? `${url}${sep}${this.query(groupId)}` : url;
    const headers = { ...(options.headers || {}), ...this.headers() };
    return fetch(fullUrl, { ...options, headers });
  },

  pruneStaleUnlocks(groups) {
    if (!groups?.length) return;
    const tokens = this.getStoredUnlockTokens();
    if (!Object.keys(tokens).length) return;
    localStorage.setItem("groupUnlocks", JSON.stringify({}));
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
};
