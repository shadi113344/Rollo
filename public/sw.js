/* Rollo PWA — cache app shell only; never cache media or API responses */
const CACHE = "rollo-shell-v13";

const PRECACHE = [
  "/",
  "/index.html",
  "/watch.html",
  "/download.html",
  "/connect.html",
  "/x-login.html",
  "/manifest.json",
  "/a11y.css",
  "/icons.css",
  "/icons.js",
  "/heart.css",
  "/bottom-nav.css",
  "/network-speed.css",
  "/unlock-flow.css",
  "/connect.css",
  "/press-radial-menu.css",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-512-maskable.png",
  "/apple-touch-icon-180.png",
  "/layout-metrics.js",
  "/media.js",
  "/tag-colors.js",
  "/hearts.js",
  "/groups.js",
  "/bottom-nav.js",
  "/press-radial-menu.js",
  "/toast.js",
  "/pwa.js",
  "/servers.js",
  "/network-speed.js",
  "/unlock-flow.js",
];

function isApiOrMedia(url) {
  return url.pathname.startsWith("/api/") || url.pathname.startsWith("/videos/");
}

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
