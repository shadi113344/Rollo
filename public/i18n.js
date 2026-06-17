window.RolloI18n = (function () {
  const strings = {
    en: {
      "nav.profile": "Profile",
      "nav.feed": "Feed",
      "nav.download": "Download",
      "nav.servers": "Servers",
      "profile.search": "Search videos…",
      "profile.select": "Select",
      "profile.bulkTag": "Tag",
      "profile.cancelSelect": "Cancel",
      "feed.swipeHint": "Swipe down to return to profile",
      "settings.title": "Settings",
      "settings.relock": "Re-lock after (minutes)",
      "settings.theme": "Theme",
      "download.playlist": "Playlist / channel",
      "download.oneAtATime": "Downloads run one at a time",
      "sync.conflict": "Syncthing conflicts detected",
      "sync.merge": "Merge conflicts",
    },
  };

  let locale = localStorage.getItem("rolloLocale") || "en";

  function t(key, fallback) {
    return strings[locale]?.[key] ?? strings.en[key] ?? fallback ?? key;
  }

  function setLocale(next) {
    if (!strings[next]) return;
    locale = next;
    localStorage.setItem("rolloLocale", next);
  }

  function apply(root = document) {
    root.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const val = t(key);
      if (val) el.textContent = val;
    });
  }

  return { t, setLocale, apply, strings };
})();
