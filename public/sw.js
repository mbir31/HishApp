// Service Worker for HishApp - Dental Clinic Income & Settlement Tracker
// v4: update-safe caching strategy.
//
// Previous revisions served EVERY same-origin GET cache-first, including
// /index.html and the hashed JS/CSS bundles. That silently froze the installed
// PWA on the build that happened to be cached, so deploys never reached
// doctors' devices. The strategies below fix that:
//
//   • navigations (/index.html)  → network-first, cache only as offline fallback
//   • hashed build assets        → cache-first (filenames change on every build)
//   • everything else same-origin → stale-while-revalidate
const CACHE_VERSION = 'v4';
const CACHE_NAME = `hisapp-cache-${CACHE_VERSION}`;

// App shell + branding. The hashed /assets/* bundles are cached at runtime.
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/applogo.png',
  '/dlogo.png',
  '/apple-touch-icon.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/favicon.png',
  '/icon.svg',
];

const OFFLINE_FALLBACK = '/index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        // Cache each asset independently so one missing file cannot abort the
        // whole precache (which would leave the SW permanently uninstalled).
        Promise.allSettled(ASSETS_TO_CACHE.map((url) => cache.add(url)))
      )
      .then((results) => {
        const failed = results.filter((r) => r.status === 'rejected');
        if (failed.length > 0) {
          console.warn(`Precached ${results.length - failed.length}/${results.length} shell assets.`);
        }
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

/** True for top-level document loads (the HTML shell). */
function isNavigationRequest(request) {
  return request.mode === 'navigate' || request.destination === 'document';
}

/** Build output is content-hashed, so a cached copy can be reused forever. */
function isImmutableAsset(url) {
  return url.pathname.startsWith('/assets/');
}

/** Only cache clean, same-origin, successful responses. */
function isCacheable(response) {
  return !!response && response.ok && response.type === 'basic';
}

/** Cache-first: hashed filenames never change, so a hit is always correct. */
function cacheFirst(request) {
  return caches.open(CACHE_NAME).then((cache) =>
    cache.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (isCacheable(response)) cache.put(request, response.clone());
          return response;
        })
    )
  );
}

/** Reuse the cached copy and refresh it in the background. */
function staleWhileRevalidate(request) {
  return caches.open(CACHE_NAME).then((cache) =>
    cache.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (isCacheable(response)) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
}

/** Network-first: always try to deliver the newest shell, cache as fallback. */
function networkFirst(request) {
  return caches.open(CACHE_NAME).then((cache) =>
    fetch(request)
      .then((response) => {
        if (isCacheable(response)) cache.put(request, response.clone());
        return response;
      })
      .catch(() =>
        cache.match(request).then((cached) => cached || cache.match(OFFLINE_FALLBACK))
      )
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Pass through non-GET requests and cross-origin calls (Firestore, fonts).
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  // Never intercept the worker itself.
  if (url.pathname === '/sw.js') return;

  if (isNavigationRequest(request)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isImmutableAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

// ─────────────────────────────────────────────────────────────────
// BACKGROUND SYNC API (ZERO DATA LOSS RESILIENCE)
// ─────────────────────────────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'hisapp-cloud-sync') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'BACKGROUND_SYNC_TRIGGER' });
        });
      })
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
