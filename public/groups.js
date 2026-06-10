window.VideoGroups = {
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

  isGroupAccessible(group) {
    return group && (!group.locked || group.unlocked);
  },

  pickDefaultGroup(groups) {
    if (!groups?.length) return "";
    const preferred = this.getDefault();
    const preferredGroup = groups.find((g) => g.id === preferred);
    if (preferredGroup && this.isGroupAccessible(preferredGroup)) return preferredGroup.id;
    const accessible = groups.find((g) => !g.locked || g.unlocked);
    return accessible?.id || groups[0].id;
  },

  ensureAccessibleGroup(groups, preferredId) {
    const preferred = groups.find((g) => g.id === preferredId);
    if (preferred && this.isGroupAccessible(preferred)) return preferred.id;
    return this.pickDefaultGroup(groups);
  },

  getUnlockTokens() {
    try {
      return JSON.parse(localStorage.getItem("groupUnlocks") || "{}");
    } catch {
      return {};
    }
  },

  setUnlockToken(groupId, token) {
    const tokens = this.getUnlockTokens();
    tokens[groupId] = token;
    localStorage.setItem("groupUnlocks", JSON.stringify(tokens));
  },

  clearUnlockToken(groupId) {
    const tokens = this.getUnlockTokens();
    delete tokens[groupId];
    localStorage.setItem("groupUnlocks", JSON.stringify(tokens));
  },

  headers() {
    const tokens = this.getUnlockTokens();
    const all = Object.values(tokens).filter(Boolean);
    return all.length ? { "X-Unlocked": all.join(",") } : {};
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
    const tokens = this.getUnlockTokens();
    let changed = false;
    for (const group of groups) {
      if (group.locked && !group.unlocked && tokens[group.id]) {
        delete tokens[group.id];
        changed = true;
      }
    }
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
};
