// =====================================================
// ZAG CENTRE — Service Worker v3.0
// Stratégie : Network-first pour les fichiers app (toujours à jour si connecté)
//             Cache uniquement utilisé en mode hors-ligne réel
// =====================================================

var CACHE_NAME = 'zag-centre-v4';
var APP_FILES = [
  './zag-launcher.html',
  './zag-directeur.html',
  './zag-enseignant.html',
  './zag-scanner.html',
  './zag-vitrine.html',
  './zag-parent.html',
  './zag-certificat.html',
  './zag-manifest.json',
  './zag-icon-192.png',
  './zag-icon-512.png'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return Promise.allSettled(
        APP_FILES.map(function(url) {
          return cache.add(url).catch(function(e) {
            console.warn('[SW] Impossible de cacher:', url, e.message);
          });
        })
      );
    }).then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event) {
  var url = event.request.url;
  var isFirebase = url.includes('firestore.googleapis.com') ||
                   url.includes('firebase') ||
                   url.includes('gstatic.com/firebasejs');
  var isFont = url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com');

  if (isFirebase) {
    event.respondWith(
      fetch(event.request).catch(function() {
        return new Response('{}', {headers: {'Content-Type': 'application/json'}});
      })
    );
    return;
  }

  if (isFont) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        return cached || fetch(event.request).then(function(response) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(c) { c.put(event.request, clone); });
          return response;
        });
      }).catch(function() { return new Response('', {status: 408}); })
    );
    return;
  }

  // Fichiers app / navigation → NETWORK-FIRST (toujours à jour si connecté)
  event.respondWith(
    fetch(event.request).then(function(response) {
      if (response && response.status === 200) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(c) { c.put(event.request, clone); });
      }
      return response;
    }).catch(function() {
      return caches.match(event.request).then(function(cached) {
        return cached || new Response(
          '<h1>ZAG Centre</h1><p>Hors-ligne — ouvrez l\'application une fois en ligne pour activer le mode hors-ligne.</p>',
          {headers: {'Content-Type': 'text/html'}}
        );
      });
    })
  );
});

self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
