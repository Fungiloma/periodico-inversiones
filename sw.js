// Mi Periódico de Inversiones — Service Worker v1.3
const CACHE_NAME = 'pdi-v1.3';
const SHELL = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/recharts/2.12.0/Recharts.min.js',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500&display=swap'
];

// Install: pre-cache app shell
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache each resource individually to avoid one failure blocking all
      return Promise.allSettled(SHELL.map(url => cache.add(url).catch(() => null)));
    })
  );
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for shell, network-first for fonts
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET
  if (event.request.method !== 'GET') return;

  // Skip chrome-extension and other non-http
  if (!url.protocol.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        // Cache successful responses from CDN/fonts
        if (response.ok && (
          url.hostname.includes('cdnjs') ||
          url.hostname.includes('fonts.google') ||
          url.hostname.includes('fonts.gstatic')
        )) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return response;
      }).catch(() => cached || new Response('Sin conexión', { status: 503 }));
    })
  );
});

// Push notification para recordatorio de sincronización (8:30 AM)
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || '📰 Periódico listo', {
      body: data.body || 'Sincroniza los archivos de hoy para ver las últimas noticias',
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: 'sync-reminder',
      requireInteraction: false
    })
  );
});
