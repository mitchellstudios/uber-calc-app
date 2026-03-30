const CACHE_NAME = 'fare-wise-v1.5.0';
const LOCAL_ASSETS = [
    './',
    './splash.html',
    './index.html',
    './styles.css?v=1.5.0',
    './script.js?v=1.5.0',
    './manifest.json',
    './icon.svg'
];

self.addEventListener('install', function(e) {
    e.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            return cache.addAll(LOCAL_ASSETS);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', function(e) {
    e.waitUntil(
        caches.keys().then(function(keys) {
            return Promise.all(
                keys.filter(function(k) { return k !== CACHE_NAME; })
                    .map(function(k) { return caches.delete(k); })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', function(e) {
    // CDN: network-first, fall back to cache for offline
    // Local assets: network-first, fall back to cache for offline
    // Both strategies are now identical — network always wins when online
    e.respondWith(
        fetch(e.request).then(function(response) {
            // Cache a copy of successful network responses for offline fallback
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
                cache.put(e.request, clone);
            });
            return response;
        }).catch(function() {
            return caches.match(e.request);
        })
    );
});
