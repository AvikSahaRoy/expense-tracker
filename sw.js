/* Ledger service worker — makes the app open and run with no connection. */

const VERSION = 'ledger-v1';
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
      .then(function (c) { return c.addAll(SHELL); })
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
          const net = fetch(req).then(function (res) {
            if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
            return res;
          }).catch(function () { return hit; });
          return hit || net;
        });
      })
    );
    return;
  }

  // App shell: cache first, so a cold launch offline still opens instantly.
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then(function (c) { c.put(req, copy); });
          }
          return res;
        }).catch(function () {
          return caches.match('./index.html');
        });
      })
    );
  }
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
