// Caches the app shell so it opens with weak park Wi-Fi. Wait times always come from the network.
const CACHE = 'wait-watcher-v5';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'map.svg', 'map-dca.svg', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = e.request.url;
  if (e.request.method !== 'GET' || url.includes('api.themeparks.wiki') || url.includes('script.google')) return; // live data and sheet sync: never cached here
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {}); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
