const CACHE = 'hone-v1';
const STATIC = [
  '/',
  '/rooms',
  '/pricelist',
  '/meetings',
  '/gallery',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Skip non-GET, cross-origin API calls, analytics
  if (e.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.hostname !== self.location.hostname) return;

  // Network first for HTML (always fresh)
  if (e.request.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      fetch(e.request)
        .then(r => { const clone = r.clone(); caches.open(CACHE).then(c => c.put(e.request, clone)); return r; })
        .catch(() => caches.match(e.request).then(r => r ?? caches.match('/')))
    );
    return;
  }

  // Cache first for assets (immutable hashed filenames)
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(r => {
        if (r.ok) caches.open(CACHE).then(c => c.put(e.request, r.clone()));
        return r;
      });
    })
  );
});
