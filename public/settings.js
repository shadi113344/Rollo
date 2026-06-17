/**
 * Client settings: re-lock timer, probe timeouts, network speed opt-out, unlock export.
 */
window.RolloSettings = (function () {
  const KEY = "rolloSettings";

  const defaults = {
    relockMinutes: 0,
    probeLanMs: 1800,
    probeRemoteMs: 3200,
    networkSpeedEnabled: true,
  };

  let toast = (msg) => window.Toast?.show?.(msg) || console.log(msg);

  function load() {
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
    } catch {
      return { ...defaults };
    }
  }

  function save(patch, { quiet = false } = {}) {
    const next = { ...load(), ...patch };
    localStorage.setItem(KEY, JSON.stringify(next));
    apply(next);
    if (!quiet) toast("Saved");
    return next;
  }

  function apply(settings = load()) {
    if (window.RolloServers) {
      if (settings.probeLanMs) RolloServers.PROBE_LAN_MS = settings.probeLanMs;
      if (settings.probeRemoteMs) RolloServers.PROBE_REMOTE_MS = settings.probeRemoteMs;
    }
    if (window.RolloNetSpeed) {
      RolloNetSpeed.setEnabled?.(!!settings.networkSpeedEnabled);
    }
    if (window.VideoGroups?.setRelockMinutes) {
      VideoGroups.setRelockMinutes(settings.relockMinutes);
    }
  }

  function exportUnlockState() {
    const tokens = VideoGroups?.getStoredUnlockTokens?.() || {};
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      origin: location.origin,
      tokens,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rollo-unlocks-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Unlock tokens exported");
  }

  function importUnlockState(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          const tokens = data.tokens || data;
          if (!tokens || typeof tokens !== "object") throw new Error("Invalid unlock backup");
          Object.entries(tokens).forEach(([id, token]) => {
            VideoGroups.setUnlockToken(id, token, "device");
          });
          resolve(Object.keys(tokens).length);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  function populateForm() {
    const s = load();
    const relock = document.getElementById("settings-relock");
    const lan = document.getElementById("settings-probe-lan");
    const remote = document.getElementById("settings-probe-remote");
    const net = document.getElementById("settings-network-speed");
    const theme = document.getElementById("settings-theme");
    if (relock) relock.value = String(s.relockMinutes || 0);
    if (lan) lan.value = String(s.probeLanMs || 1800);
    if (remote) remote.value = String(s.probeRemoteMs || 3200);
    if (net) net.checked = s.networkSpeedEnabled !== false;
    if (theme && window.RolloTheme) theme.value = RolloTheme.get();
  }

  function bindSettingsPage() {
    const page = document.getElementById("settings-page");
    if (!page) return;

    populateForm();

    const persist = () => {
      const relock = document.getElementById("settings-relock");
      const lan = document.getElementById("settings-probe-lan");
      const remote = document.getElementById("settings-probe-remote");
      const net = document.getElementById("settings-network-speed");
      save({
        relockMinutes: Number(relock?.value || 0),
        probeLanMs: Number(lan?.value || 1800),
        probeRemoteMs: Number(remote?.value || 3200),
        networkSpeedEnabled: !!net?.checked,
      }, { quiet: true });
    };

    ["settings-relock", "settings-probe-lan", "settings-probe-remote"].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", persist);
    });
    document.getElementById("settings-network-speed")?.addEventListener("change", persist);

    document.getElementById("settings-theme")?.addEventListener("change", () => {
      toast("Theme updated");
    });

    document.getElementById("settings-export-unlocks")?.addEventListener("click", exportUnlockState);
    document.getElementById("settings-import-unlocks")?.addEventListener("click", () => {
      document.getElementById("settings-import-input")?.click();
    });
    document.getElementById("settings-import-input")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const n = await importUnlockState(file);
        toast(`Imported ${n} unlock token${n === 1 ? "" : "s"}`);
      } catch (err) {
        toast(err.message || "Import failed");
      }
      e.target.value = "";
    });
  }

  function init(options = {}) {
    if (options.showToast) toast = options.showToast;
    apply();
    bindSettingsPage();
  }

  return { load, save, apply, init, exportUnlockState, importUnlockState, populateForm };
})();
