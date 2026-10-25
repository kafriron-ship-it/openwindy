// OpenWindy service worker — caches the app shell for offline load.
const CACHE = "openwindy-v1";
const CORE = [
  "./", "./index.html", "./style.css", "./icon.svg", "./manifest.webmanifest",
  "./js/config.js", "./js/units.js", "./js/favorites.js", "./js/api.js",
  "./js/field.js", "./js/wind.js", "./js/overlays.js", "./js/route.js",
  "./js/ui.js", "./js/app.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isData = /open-meteo\.com|rainviewer\.com|gibs\.earthdata|arcgisonline|tile\.openstreetmap/.test(url.host);

  // Live weather/tile data: network-first (don't serve stale), fall back to cache.
  if (isData) {
    e.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }
  // App shell + libraries: cache-first, update in background.
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res && res.ok && (sameOrigin || res.type === "cors")) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
