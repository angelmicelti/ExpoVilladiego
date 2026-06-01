// Service Worker - ExpoVilladiego PWA
const CACHE_NAME = 'expovilladiego-v3.80';

// Assets estáticos a pre-cachear durante la instalación
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-16.png',
  './icon-32.png',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './icon-1024.png',
  './favicon-16.png',
  './favicon-32.png'
];

// URLs externas (CDN) que también cachearemos
const CDN_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/lucide@0.469.0/dist/umd/lucide.js',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js'
];

// Instalación: pre-cachear recursos locales y del CDN
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Primero intentar cachear recursos locales
      const staticPromise = cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[SW] Algún recurso estático no se pudo cachear:', err);
      });
      // Luego cachear CDN (no bloquean la instalación si fallan)
      const cdnPromise = Promise.allSettled(
        CDN_ASSETS.map(url =>
          fetch(url).then(response => {
            if (response.ok) {
              return cache.put(url, response);
            }
          }).catch(() => console.warn('[SW] CDN no disponible para caché:', url))
        )
      );
      return Promise.all([staticPromise, cdnPromise]);
    })
  );
  // Activar inmediatamente sin esperar a que se cierre la pestaña anterior
  self.skipWaiting();
});

// Activación: limpiar cachés antiguas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  // Tomar control de todas las pestañas inmediatamente
  self.clients.claim();
});

// Interceptación de peticiones: estrategia híbrida
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Solo interceptar peticiones GET y same-origin / CDN conocidos
  if (event.request.method !== 'GET') return;

  // Estrategia para recursos del propio sitio: Cache First, Network Fallback
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          // Actualizar caché en background (stale-while-revalidate)
          fetch(event.request).then((networkResponse) => {
            if (networkResponse && networkResponse.ok) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse);
              });
            }
          }).catch(() => {}); // Ignorar fallos de red en background
          return cachedResponse;
        }
        // No está en caché: ir a la red
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            // Cachear la respuesta para futuras visitas
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        }).catch(() => {
          // Si no hay red y no hay caché: mostrar página offline
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
    );
    return;
  }

  // Estrategia para CDN externos: Cache First
  if (CDN_ASSETS.some(cdn => event.request.url.startsWith(cdn))) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        }).catch(() => {
          // Fallback si no hay red: intentar servir versión cacheada
          return caches.match(event.request);
        });
      })
    );
    return;
  }

  // Para Google Fonts: Cache First
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        }).catch(() => caches.match(event.request));
      })
    );
    return;
  }
});

// Escuchar mensajes desde la app principal
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      console.log('[SW] Caché limpiada por solicitud del usuario');
    });
  }
});
