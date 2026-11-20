/* InsideOut offline support: keeps what you have already opened (app, maps, floor plans, hallway
   networks, map tiles) so directions keep working in tunnels and basements with no signal.
   Pages and data: network first, cached copy when offline. Map tiles and static files: cache first.
   Responses marked no-store (e.g. restricted drawings) are never kept. Writes (POST/PATCH/PUT) are not cached. */
const CACHE = 'insideout-v1';
const SHELL = ['./', './manifest.webmanifest'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const keep = (r) => r && r.ok && !/no-store/i.test(r.headers.get('Cache-Control') || '');
const put = (req, res) => { if (keep(res)) caches.open(CACHE).then((c) => c.put(req, res)); };

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const staticLike = url.origin !== location.origin || /\.(png|jpe?g|svg|webp|pbf|woff2?|css|js)$/.test(url.pathname);
  if (staticLike) {
    // Cache first (tiles, fonts, built files); fill the cache from the network.
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { put(req, res.clone()); return res; })));
    return;
  }
  // Network first; offline falls back to the last copy (or the app shell for page loads).
  e.respondWith(fetch(req).then((res) => { put(req, res.clone()); return res; })
    .catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('./') : Response.error()))));
});
