/**
 * Tiny rolling throughput meter for app traffic (fetch, XHR, media resources).
 */
window.RolloNetSpeed = (function () {
  const WINDOW_MS = 1000;
  const IDLE_MS = 2500;
  const STALL_MS = 900;
  const MAX_SEEN = 4000;

  let bytesWindow = 0;
  let windowStart = 0;
  let smoothedBps = 0;
  let lastActivity = 0;
  let tickId = null;
  let started = false;
  const badges = [];
  const seenEntries = new Set();
  const xhrLastLoaded = new WeakMap();
  const xhrLastUpload = new WeakMap();

  let enabled = true;

  function setEnabled(on) {
    enabled = !!on;
    badges.forEach((b) => {
      if (b.widgetEl) b.widgetEl.hidden = !enabled;
      if (b.el) b.el.hidden = !enabled;
    });
  }

  function recordBytes(n) {
    if (!enabled) return;
    if (!n || n <= 0 || !Number.isFinite(n)) return;
    if (!windowStart) windowStart = performance.now();
    bytesWindow += n;
    lastActivity = performance.now();
  }

  function flushWindow() {
    const now = performance.now();
    const elapsed = Math.max(now - windowStart, 1);
    const instant = (bytesWindow * 1000) / elapsed;
    smoothedBps = smoothedBps * 0.55 + instant * 0.45;
    bytesWindow = 0;
    windowStart = now;
  }

  function formatSpeed(bps) {
    if (!bps || bps < 400) return "—";
    if (bps >= 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
    return `${Math.round(bps / 1024)} KB/s`;
  }

  function resolveState(now, displayBps) {
    const sinceActivity = now - lastActivity;
    if (sinceActivity > IDLE_MS || !lastActivity) return "idle";
    if (displayBps >= 1024) return "active";
    if (sinceActivity > STALL_MS) return "stalled";
    return "loading";
  }

  function updateBadges() {
    const now = performance.now();
    if (windowStart && now - windowStart >= WINDOW_MS) flushWindow();
    const idle = now - lastActivity > IDLE_MS;
    const display = idle ? 0 : smoothedBps;
    const text = formatSpeed(display);
    const state = resolveState(now, display);

    badges.forEach((entry) => {
      const { el, labelEl, widgetEl } = entry;
      if (labelEl) labelEl.textContent = text;
      else el.textContent = text;
      el.dataset.active = display >= 1024 ? "1" : "0";
      if (widgetEl) widgetEl.dataset.state = state;
    });
  }

  function trimSeen() {
    if (seenEntries.size <= MAX_SEEN) return;
    const drop = seenEntries.size - MAX_SEEN;
    let i = 0;
    for (const key of seenEntries) {
      seenEntries.delete(key);
      if (++i >= drop) break;
    }
  }

  function ingestResourceEntry(entry) {
    if (!entry || entry.name.startsWith("blob:")) return;
    const size = entry.transferSize || entry.encodedBodySize || 0;
    if (!size) return;
    const key = `${entry.name}|${entry.startTime}|${size}`;
    if (seenEntries.has(key)) return;
    seenEntries.add(key);
    trimSeen();
    recordBytes(size);
  }

  function scanPerformanceEntries() {
    try {
      performance.getEntriesByType("resource").forEach(ingestResourceEntry);
    } catch {
      /* ignore */
    }
  }

  function hookFetch() {
    if (window.__rolloNetSpeedFetch) return;
    window.__rolloNetSpeedFetch = true;
    const orig = window.fetch.bind(window);
    window.fetch = function (...args) {
      return orig(...args).then((res) => {
        const len = Number(res.headers.get("content-length"));
        if (len > 0) recordBytes(len);
        else {
          res.clone()
            .arrayBuffer()
            .then((buf) => recordBytes(buf.byteLength))
            .catch(() => {});
        }
        return res;
      });
    };
  }

  function hookXhr() {
    if (window.__rolloNetSpeedXhr) return;
    window.__rolloNetSpeedXhr = true;

    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (...args) {
      xhrLastLoaded.set(this, 0);
      xhrLastUpload.set(this, 0);
      return origOpen.apply(this, args);
    };

    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (...args) {
      this.addEventListener("progress", (e) => {
        if (!e.lengthComputable) return;
        const prev = xhrLastLoaded.get(this) || 0;
        const delta = e.loaded - prev;
        xhrLastLoaded.set(this, e.loaded);
        if (delta > 0) recordBytes(delta);
      });
      if (this.upload) {
        this.upload.addEventListener("progress", (e) => {
          if (!e.lengthComputable) return;
          const prev = xhrLastUpload.get(this) || 0;
          const delta = e.loaded - prev;
          xhrLastUpload.set(this, e.loaded);
          if (delta > 0) recordBytes(delta);
        });
      }
      return origSend.apply(this, args);
    };
  }

  function hookPerformanceObserver() {
    if (window.__rolloNetSpeedPerf) return;
    window.__rolloNetSpeedPerf = true;
    if (typeof PerformanceObserver === "undefined") return;
    try {
      const obs = new PerformanceObserver((list) => {
        list.getEntries().forEach(ingestResourceEntry);
      });
      obs.observe({ type: "resource", buffered: true });
    } catch {
      /* ignore */
    }
  }

  function hookVideoProgress() {
    if (window.__rolloNetSpeedVideo) return;
    window.__rolloNetSpeedVideo = true;
    document.addEventListener(
      "progress",
      (e) => {
        const v = e.target;
        if (!(v instanceof HTMLVideoElement)) return;
        if (!v.buffered.length) return;
        const end = v.buffered.end(v.buffered.length - 1);
        const prev = v.__rolloNetBuf || 0;
        const delta = end - prev;
        v.__rolloNetBuf = end;
        if (delta <= 0 || !v.duration || !Number.isFinite(v.duration)) return;
        const estBytes = v.__rolloNetSize || v.duration * 250000;
        recordBytes(delta * (estBytes / v.duration));
      },
      true
    );
    document.addEventListener(
      "loadedmetadata",
      (e) => {
        const v = e.target;
        if (!(v instanceof HTMLVideoElement)) return;
        v.__rolloNetBuf = 0;
      },
      true
    );
  }

  function tick() {
    updateBadges();
    tickId = requestAnimationFrame(tick);
  }

  function start() {
    if (started) return;
    started = true;
    windowStart = performance.now();
    hookFetch();
    hookXhr();
    hookPerformanceObserver();
    hookVideoProgress();
    scanPerformanceEntries();
    setInterval(scanPerformanceEntries, 800);
    tickId = requestAnimationFrame(tick);
  }

  function mountFeedWidget() {
    const widget = document.createElement("div");
    widget.className = "net-speed-widget net-speed-widget--feed";
    widget.dataset.state = "idle";
    widget.setAttribute("aria-hidden", "true");

    const ring = document.createElement("div");
    ring.className = "net-speed-ring";
    ring.innerHTML =
      '<svg class="net-speed-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>';

    const label = document.createElement("span");
    label.className = "net-speed-label";
    label.textContent = "—";

    widget.append(ring, label);
    document.body.appendChild(widget);

    badges.push({ el: label, labelEl: label, widgetEl: widget });
    start();
    return widget;
  }

  function mount(options = {}) {
    if (options.variant === "feed") return mountFeedWidget();

    const el = document.createElement("span");
    el.className = "net-speed net-speed--profile";
    el.setAttribute("aria-hidden", "true");
    el.textContent = "—";
    if (options.parent) options.parent.insertBefore(el, options.parent.firstChild);
    else document.body.appendChild(el);
    badges.push({ el, labelEl: null, widgetEl: null });
    start();
    return el;
  }

  return { mount, recordBytes, start, setEnabled };
})();
