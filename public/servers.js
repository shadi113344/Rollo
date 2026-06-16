/**
 * Multi-server connections — LAN-first probe, Tailscale fallback, list sync via URL seed.
 */
window.RolloServers = (function () {
  const STORAGE_KEY = "rolloServers";
  const PROBE_LAN_MS = 1800;
  const PROBE_REMOTE_MS = 3200;

  function normalizeUrl(input) {
    if (!input) return "";
    let s = String(input).trim();
    if (!s) return "";
    if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
    const u = new URL(s);
    u.pathname = "";
    u.search = "";
    u.hash = "";
    return u.href.replace(/\/$/, "");
  }

  function newId() {
    return `srv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function getList() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function saveList(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  function mergeList(incoming) {
    if (!Array.isArray(incoming) || !incoming.length) return getList();
    const byId = new Map(getList().map((s) => [s.id, s]));
    incoming.forEach((s) => {
      if (!s?.id) return;
      const prev = byId.get(s.id);
      byId.set(s.id, { ...prev, ...s });
    });
    const merged = [...byId.values()];
    saveList(merged);
    return merged;
  }

  function upsert(server) {
    const list = getList();
    const idx = list.findIndex((s) => s.id === server.id);
    const row = {
      id: server.id || newId(),
      name: String(server.name || "Server").trim() || "Server",
      lanUrl: normalizeUrl(server.lanUrl),
      remoteUrl: normalizeUrl(server.remoteUrl),
    };
    if (idx >= 0) list[idx] = { ...list[idx], ...row };
    else list.push(row);
    saveList(list);
    return row;
  }

  function remove(id) {
    saveList(getList().filter((s) => s.id !== id));
  }

  function currentOrigin() {
    return normalizeUrl(location.origin);
  }

  function isCurrentServer(server) {
    const origin = currentOrigin();
    return origin === normalizeUrl(server.lanUrl) || origin === normalizeUrl(server.remoteUrl);
  }

  function importSeedFromUrl() {
    const params = new URLSearchParams(location.search);
    const seed = params.get("rolloSeed");
    if (!seed) return false;
    try {
      const decoded = decodeURIComponent(escape(atob(seed)));
      const list = JSON.parse(decoded);
      mergeList(list);
      params.delete("rolloSeed");
      const qs = params.toString();
      const next = location.pathname + (qs ? `?${qs}` : "") + location.hash;
      history.replaceState(null, "", next);
      return true;
    } catch {
      return false;
    }
  }

  function encodeSeed(list) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(list))));
  }

  function navigateTo(baseUrl, path, list) {
    const base = normalizeUrl(baseUrl);
    const dest = new URL(path || "/", base);
    const servers = list || getList();
    if (servers.length) dest.searchParams.set("rolloSeed", encodeSeed(servers));
    location.href = dest.href;
  }

  async function probeBase(baseUrl, timeoutMs) {
    const base = normalizeUrl(baseUrl);
    if (!base) return { ok: false, via: null };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${base}/api/status`, {
        signal: ctrl.signal,
        cache: "no-store",
        mode: "cors",
      });
      clearTimeout(timer);
      if (!res.ok) return { ok: false, via: null };
      const data = await res.json();
      return { ok: true, via: null, data, url: base };
    } catch {
      clearTimeout(timer);
      return { ok: false, via: null };
    }
  }

  async function resolve(server) {
    if (server.lanUrl) {
      const lan = await probeBase(server.lanUrl, PROBE_LAN_MS);
      if (lan.ok) return { ...lan, via: "lan" };
    }
    if (server.remoteUrl) {
      const remote = await probeBase(server.remoteUrl, PROBE_REMOTE_MS);
      if (remote.ok) return { ...remote, via: "remote" };
    }
    return null;
  }

  async function probeServer(server) {
    const lan = server.lanUrl
      ? await probeBase(server.lanUrl, PROBE_LAN_MS)
      : { ok: false };
    const remote = server.remoteUrl
      ? await probeBase(server.remoteUrl, PROBE_REMOTE_MS)
      : { ok: false };
    const online = lan.ok || remote.ok;
    let activeVia = null;
    let status = null;
    if (lan.ok) {
      activeVia = "lan";
      status = lan.data;
    } else if (remote.ok) {
      activeVia = "remote";
      status = remote.data;
    }
    return { online, lan: lan.ok, remote: remote.ok, activeVia, status };
  }

  async function fetchThisDevice() {
    const res = await fetch("/api/status", { cache: "no-store" });
    if (!res.ok) throw new Error("Could not read server status");
    const data = await res.json();
    const net = data.network?.urls || {};
    const name =
      data.hostname ||
      (typeof navigator !== "undefined" && navigator.userAgent?.includes("Android")
        ? "Phone"
        : "This device");
    return {
      name,
      lanUrl: net.local || "",
      remoteUrl: net.remote || "",
    };
  }

  async function addThisDevice() {
    const info = await fetchThisDevice();
    const existing = getList().find(
      (s) =>
        normalizeUrl(s.lanUrl) === normalizeUrl(info.lanUrl) ||
        normalizeUrl(s.remoteUrl) === normalizeUrl(info.remoteUrl) ||
        isCurrentServer(s)
    );
    if (existing) {
      return upsert({
        ...existing,
        name: info.name || existing.name,
        lanUrl: info.lanUrl || existing.lanUrl,
        remoteUrl: info.remoteUrl || existing.remoteUrl,
      });
    }
    return upsert({
      id: newId(),
      name: info.name,
      lanUrl: info.lanUrl,
      remoteUrl: info.remoteUrl,
    });
  }

  function restoreBackup(raw) {
    const list = Array.isArray(raw) ? raw : raw?.servers;
    if (!Array.isArray(list)) {
      throw new Error("Invalid backup file");
    }
    const cleaned = list
      .map((s) => ({
        id: s?.id || newId(),
        name: String(s?.name || "Server").trim() || "Server",
        lanUrl: normalizeUrl(s?.lanUrl),
        remoteUrl: normalizeUrl(s?.remoteUrl),
      }))
      .filter((s) => s.lanUrl || s.remoteUrl);
    saveList(cleaned);
    return cleaned;
  }

  function exportBackup() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      servers: getList(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 10);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `rollo-servers-${stamp}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    return payload.servers.length;
  }

  function importBackupFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          resolve(restoreBackup(data));
        } catch (err) {
          reject(err instanceof Error ? err : new Error("Could not read backup file"));
        }
      };
      reader.onerror = () => reject(reader.error || new Error("Could not read backup file"));
      reader.readAsText(file);
    });
  }

  return {
    getList,
    saveList,
    mergeList,
    upsert,
    remove,
    normalizeUrl,
    currentOrigin,
    isCurrentServer,
    importSeedFromUrl,
    navigateTo,
    probeBase,
    resolve,
    probeServer,
    fetchThisDevice,
    addThisDevice,
    exportBackup,
    importBackupFile,
    restoreBackup,
    PROBE_LAN_MS,
    PROBE_REMOTE_MS,
  };
})();
