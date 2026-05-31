// Service Worker Version: 4000.0.0
const CACHE_NAME = 'unnati-v4000';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  // brand_unnati_logo.png is purposely omitted here to ensure network-first fetch
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Force clean all existing caches before installing the new one
      caches.keys().then(names => {
          for (let name of names) caches.delete(name);
      });
      // Fetch fresh copies and cache them as clean paths
      return Promise.all(
        ASSETS_TO_CACHE.map((url) => {
          return fetch(url + (url.includes('?') ? '&' : '?') + 'cache-bump=' + Date.now())
            .then((response) => {
              if (!response.ok) {
                throw new Error(`Request failed for ${url}`);
              }
              return cache.put(url, response);
            })
            .catch(() => {
              // Standard fallback
              return cache.add(url);
            });
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // For navigation requests, try network first, then cache
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match('/');
      })
    );
    return;
  }

  // Use the unique name to bypass any possible legacy proxy/worker caches
  if (url.pathname.includes('brand_unnati_logo.png')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match(event.request, { ignoreSearch: true }))
    );
    return;
  }

  // Network-First for manifest.json
  if (url.pathname.includes('manifest.json')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache the fresh version
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              // Store it under the clean pathname without query params
              cache.put(url.pathname, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request, { ignoreSearch: true });
        })
    );
    return;
  }

  // For other requests, try cache first, then network
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((response) => {
      return response || fetch(event.request);
    })
  );
});
