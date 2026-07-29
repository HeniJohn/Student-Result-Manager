// Service worker: makes the app installable AND lets it keep working
// with no internet after the user has opened it (and logged in) once.
//
// Two caching strategies:
// 1. Our own files (HTML/CSS/JS/manifest/icons): cache-first, so the app
//    shell always opens instantly, online or offline.
// 2. Third-party assets we depend on to even render/run (Google Fonts,
//    Firebase SDK scripts): cached the first time they're fetched
//    successfully, then reused offline. Firebase Auth/Firestore's actual
//    data calls are NOT cached here — Firestore has its own offline
//    database (enabled in index.html) and Auth remembers the signed-in
//    user on the device, which is what lets the app open + read/write
//    data with no connection after the first successful login.
const CACHE_NAME = "srm-cache-v3";
const RUNTIME_CACHE = "srm-runtime-v3";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// Hosts for static assets that are safe to cache long-term and reuse offline.
const RUNTIME_HOSTS = [
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "www.gstatic.com"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Our own files: cache-first, falling back to the cached shell offline.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return (
          cached ||
          fetch(event.request).catch(() => caches.match("./index.html"))
        );
      })
    );
    return;
  }

  // Fonts / Firebase SDK: serve from cache instantly if we have it, and
  // refresh the cache in the background when online (stale-while-revalidate).
  if (RUNTIME_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then((cache) =>
        cache.match(event.request).then((cached) => {
          const network = fetch(event.request)
            .then((response) => {
              if (response && response.status === 200) {
                cache.put(event.request, response.clone());
              }
              return response;
            })
            .catch(() => cached);
          return cached || network;
        })
      )
    );
    return;
  }

  // Everything else (Firestore/Auth live requests, reCAPTCHA, etc.) goes
  // straight to the network — these are live calls, not cacheable assets.
});
