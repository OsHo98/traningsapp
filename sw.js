/* Service worker: appskalet cachas för offline. Endast samma ursprung – anrop till Supabase passerar orörda (cachas aldrig). */
const CACHE = 'oh-app-v1.3';
const SHELL = ['./', 'index.html', 'manifest.json', 'css/app.css', 'js/config.js', 'js/storage.js', 'js/model.js', 'js/metrics.js', 'js/sync.js', 'js/vendor/supabase-2.117.3.js', 'js/rules.js', 'js/week.js', 'js/comp.js', 'js/plan.js', 'js/pass-validate.js', 'js/import.js', 'js/charts.js', 'js/stats.js', 'js/data.js', 'js/app.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (/config\.local\.js$/.test(u.pathname)) return; // lokal konfiguration cachas aldrig
  // Nätverk först för appens egna filer (så uppdateringar slår igenom), cache som reserv offline.
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || (e.request.mode === 'navigate' ? caches.match('index.html') : undefined))));
});
