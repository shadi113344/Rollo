/* Rollo PWA — cache app shell only; never cache media or API responses */
const CACHE = "rollo-shell-v41";

const PRECACHE = [
  "/",
  "/a11y.css",
  "/anchored-tag-palette.css",
  "/anchored-tag-palette.js",
  "/apple-touch-icon-180.png",
  "/bottom-nav.css",
  "/bottom-nav.js",
  "/connect.css",
  "/connect.html",
  "/download.html",
  "/feed-extras.js",
  "/groups.js",
  "/heart.css",
  "/hearts.js",
  "/i18n.js",
  "/icon-192.png",
  "/icon-512-maskable.png",
  "/icon-512.png",
  "/icon.svg",
  "/icons.css",
  "/icons.js",
  "/index.html",
  "/layout-metrics.js",
  "/manifest.json",
  "/media-duration.js",
  "/media-helpers-fallback.js",
  "/media-helpers.js",
  "/network-speed.css",
  "/network-speed.js",
  "/press-radial-menu.css",
  "/press-radial-menu.js",
  "/profile-chrome.css",
  "/profile-extras.css",
  "/profile-extras.js",
  "/pwa.js",
  "/rolloreader.css",
  "/rolloreader.html",
  "/rolloreader.js",
  "/servers.js",
  "/settings.css",
  "/settings.html",
  "/settings.js",
  "/tag-colors.js",
  "/theme.css",
  "/theme.js",
  "/toast.js",
  "/unlock-flow.css",
  "/unlock-flow.js",
  "/video-details.css",
  "/video-details.js",
  "/watch.html",
  "/x-login.html",
];

function isApiOrMedia(url) {
  return url.pathname.startsWith("/api/") || url.pathname.startsWith("/videos/");
}

self.addEventListener("message", (event) => {
  if (event?.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (isApiOrMedia(url)) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() =>
          caches.match(event.request).then((cached) => cached || caches.match("/index.html"))
        )
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
