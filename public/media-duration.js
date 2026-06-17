/**
 * Duration formatting and dynamic bucket labels for profile sort/group.
 */
window.RolloDuration = (function () {
  function format(sec) {
    if (!sec || !Number.isFinite(sec) || sec <= 0) return "";
    const total = Math.round(sec);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function formatShort(sec) {
    if (!sec || !Number.isFinite(sec) || sec <= 0) return "";
    const total = Math.round(sec);
    if (total < 60) return `${total}s`;
    const m = Math.floor(total / 60);
    const s = total % 60;
    if (m < 60) return s ? `${m}:${String(s).padStart(2, "0")}` : `${m}m`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return rm ? `${h}h ${rm}m` : `${h}h`;
  }

  function bucketLabel(minSec, maxSec) {
    const lo = formatShort(minSec) || "0s";
    if (!Number.isFinite(maxSec)) return `${lo}+`;
    return `${lo}–${formatShort(maxSec)}`;
  }

  function computeBuckets(durationsSec) {
    const valid = durationsSec.filter((d) => d > 0).sort((a, b) => a - b);
    if (!valid.length) return [];
    if (valid.length === 1) {
      return [{ label: formatShort(valid[0]), min: 0, max: Infinity }];
    }

    const min = valid[0];
    const max = valid[valid.length - 1];
    if (min === max) {
      return [{ label: formatShort(min), min: 0, max: Infinity }];
    }

    const span = max - min;
    const step = span / 4;
    const buckets = [];
    for (let i = 0; i < 4; i++) {
      const bmin = i === 0 ? 0 : min + step * i;
      const bmax = i === 3 ? Infinity : min + step * (i + 1);
      buckets.push({
        label: bucketLabel(i === 0 ? min : bmin, bmax),
        min: bmin,
        max: bmax,
      });
    }
    return buckets;
  }

  function bucketForDuration(sec, buckets) {
    if (!sec || !buckets.length) return null;
    for (const b of buckets) {
      if (sec >= b.min && sec < b.max) return b;
    }
    return buckets[buckets.length - 1];
  }

  function qualityLabel(height) {
    if (!height) return "—";
    if (height >= 2160) return "4K";
    if (height >= 1440) return "1440p";
    if (height >= 1080) return "1080p";
    if (height >= 720) return "720p";
    if (height >= 480) return "480p";
    return `${height}p`;
  }

  function formatBytes(bytes) {
    if (!bytes || !Number.isFinite(bytes)) return "—";
    const units = ["B", "KB", "MB", "GB"];
    let n = bytes;
    let i = 0;
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024;
      i++;
    }
    return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
  }

  return {
    format,
    formatShort,
    computeBuckets,
    bucketForDuration,
    qualityLabel,
    formatBytes,
  };
})();
