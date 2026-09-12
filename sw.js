// Celestial Tarot service worker
// Goal: instant, low-data repeat launches on a home-screen iOS app.
// - App shell (this HTML page + icon): cache-first, so opening the app doesn't
//   need a network round trip once it's been loaded once.
// - Tarot card images: cache-first, populated lazily as each card is actually
//   viewed (never bulk-prefetched), so we don't spend data on cards you never draw.
// - Gemini API calls: intentionally never touched here — readings must always
//   come from the network, not a stale cache.

const SHELL_CACHE = "celestial-tarot-shell-v11";
const IMAGE_CACHE = "celestial-tarot-images-v1";

const SHELL_FILES = [
  "./",
  "./index.html",
  "./icon-180.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== IMAGE_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never intercept calls to the Gemini API — always go live.
  if (url.hostname === "generativelanguage.googleapis.com") {
    return;
  }

  // Tarot card artwork from Wikimedia: cache-first, cached the first time
  // each specific card is viewed.
  if (url.hostname === "upload.wikimedia.org") {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        try {
          const response = await fetch(event.request);
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        } catch (err) {
          return cached || Response.error();
        }
      })
    );
    return;
  }

  // App shell / same-origin assets: cache-first, falling back to network.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
});
