const CACHE_NAME = 'smogon-champions-cache-v1';
const POKEAPI_CACHE_NAME = 'pokeapi-cache-v1';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './data/gen9championsou-0.json',
  './data/gen9championsou-1500.json',
  './data/gen9championsou-1630.json',
  './data/gen9championsou-1760.json',
  'https://unpkg.com/lucide@latest',
  'https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&display=swap',
  'https://fonts.gstatic.com',
  'https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&f[]=cabinet-grotesk@500,700,800&display=swap'
  // Si tienes iconos en una carpeta 'icons', añádelos aquí:
  // './icons/icon-192x192.png',
  // './icons/icon-512x512.png'
];

// Install event: cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Opened static cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Activate event: clean up old caches
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME, POKEAPI_CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch event: cache-first strategy for PokeAPI, network-first with fallback for others
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // Cache-First strategy for PokeAPI requests
  if (requestUrl.origin === 'https://pokeapi.co' && requestUrl.pathname.startsWith('/api/v2/')) {
    event.respondWith(
      caches.open(POKEAPI_CACHE_NAME).then(cache => {
        return cache.match(event.request).then(response => {
          if (response) {
            return response; // Return cached response if found
          }
          return fetch(event.request).then(networkResponse => {
            cache.put(event.request, networkResponse.clone()); // Cache the new response
            return networkResponse;
          }).catch(error => {
            console.error('Service Worker: PokeAPI fetch failed and no cache:', error);
            // Fallback for offline if network fails and no cache.
            // The app's fetchPokemon function already handles 404s and network errors gracefully.
            return new Response(null, { status: 503, statusText: 'Service Unavailable (Offline)' });
          });
        });
      })
    );
    return;
  }

  // Network-First with fallback to cache for other requests (e.g., Smogon data, fonts, lucide)
  event.respondWith(
    fetch(event.request).then(networkResponse => {
      // Try to cache successful network responses
      caches.open(CACHE_NAME).then(cache => {
        cache.put(event.request, networkResponse.clone());
      });
      return networkResponse;
    }).catch(() => {
      // If network fails, try to get from cache
      return caches.match(event.request);
    })
  );
});