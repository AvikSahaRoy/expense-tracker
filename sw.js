/* Ledger service worker — makes the app open and run with no connection. */

const VERSION = 'ledger-v4';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION)
      // reload bypasses the HTTP cache, so a fresh install really gets fresh files
      .then(function (c) { return c.addAll(SHELL.map(function (u) { return new Request(u, { cache: 'reload' }); })); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          return k === VERSION ? null : caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

function putIn(cache, req, res) {
  if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never cache the sync endpoint — stale expense data would be worse than none.
  if (url.hostname.indexOf('script.google') > -1) return;

  // Fonts: serve from cache once seen, refresh quietly in the background.
  if (url.hostname.indexOf('fonts.googleapis.com') > -1 ||
      url.hostname.indexOf('fonts.gstatic.com') > -1) {
    e.respondWith(
      caches.open(VERSION).then(function (cache) {
        return cache.match(req).then(function (hit) {
          const net = fetch(req)
            .then(function (res) { return putIn(cache, req, res); })
            .catch(function () { return hit; });
          return hit || net;
        });
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // The page and the manifest go to the network first. Cache-first on the HTML meant a
  // phone that had already installed the app kept serving an old build forever, since a
  // hand-rolled cache never revalidates. Offline still falls back to the cached copy.
  const isDoc = req.mode === 'navigate' || req.destination === 'document' ||
                url.pathname === '/' || /\.(html|webmanifest)$/.test(url.pathname);
  if (isDoc) {
    e.respondWith(
      caches.open(VERSION).then(function (cache) {
        return fetch(req)
          .then(function (res) { return putIn(cache, req, res); })
          .catch(function () {
            return cache.match(req).then(function (hit) {
              return hit || cache.match('./index.html');
            });
          });
      })
    );
    return;
  }

  // Icons and other static bits: cache first, they change name when they change.
  e.respondWith(
    caches.open(VERSION).then(function (cache) {
      return cache.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) { return putIn(cache, req, res); });
      });
    })
  );
});

// Fired by the page when a sync is wanted after reconnecting.
self.addEventListener('sync', function (e) {
  if (e.tag === 'ledger-sync') {
    e.waitUntil(
      self.clients.matchAll({ includeUncontrolled: true }).then(function (list) {
        list.forEach(function (c) { c.postMessage({ type: 'sync-now' }); });
      })
    );
  }
});
