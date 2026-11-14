// Service worker: app shell cached for offline start; /api is never cached (no made-up numbers).
const SHELL = 'desk-shell-v4';
const FILES = ['./', 'web/app.css', 'web/app.js', 'web/chart.js', 'manifest.json',
  'web/icons/icon-192.png', 'web/icons/icon-512.png', 'web/icons/maskable-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== SHELL).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.includes('/api/') || u.pathname.includes('/d/')) return;   // network only: data is never cached
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone(); caches.open(SHELL).then(c => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request, {ignoreSearch: true}).then(r => r || caches.match('./'))));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data && e.notification.data.url;
  if (url) e.waitUntil(clients.openWindow(url));
});
