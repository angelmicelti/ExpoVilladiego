// Service Worker for ExpoVilladiego PWA
const APP_VERSION = '4.15';
const CACHE_NAME = 'expovilladiego-cache-v2';
const ASSETS = [
  '/',
  'index.html',
  'manifest.json',
  'sw.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cachear recursos uno a uno — si uno falla, los demás se siguen guardando
      return Promise.allSettled(
        ASSETS.map(url =>
          cache.add(url).catch(err => {
            console.warn('[SW] Recurso no cachéado (continúa):', url, err.message);
          })
        )
      );
    }).then(() => {
      // Forzar activación inmediata (no esperar a que el antiguo se cierre)
      return self.skipWaiting();
    })
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // No cachear peticiones al propio sw.js ni a CDNs externos
  if (url.pathname.includes('sw.js')) {
    event.respondWith(fetch(event.request));
    return;
  }
  if (url.origin !== self.location.origin) {
    // Recursos externos (CDN): ir siempre a la red
    event.respondWith(fetch(event.request).catch(() => new Response('Offline', { status: 503 })));
    return;
  }

  // Recursos propios: intentar cache primero, luego red
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});

self.addEventListener('activate', event => {
  const whitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(key => {
        if (!whitelist.includes(key)) {
          return caches.delete(key);
        }
      })
    )).then(() => {
      // Tomar control inmediato de todas las páginas abiertas
      return self.clients.claim();
    })
  );
});

// Responder a peticiones de versión desde la app
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: APP_VERSION });
  }
});