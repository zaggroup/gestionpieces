// =====================================================
// ZAG GROUP — Service Worker v12.0
// Stratégie : Cache-first pour les fichiers app
//             Network-first pour Firebase/APIs
// =====================================================

var CACHE_NAME = 'zaggroup-v12';
var APP_FILES = [
  './zaggroup-11.html',
  './gestionnaire_new-2-7.html',
  './patron-19.html',
  './vitrine_v3_finale.html',
  './vitrine_b2b.html',
  './module_credits_avances.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// ── INSTALL : mise en cache des fichiers app ──────────
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
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// ── ACTIVATE : suppression des anciens caches ─────────
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// ── FETCH : stratégie intelligente ───────────────────
self.addEventListener('fetch', function(event) {
  var url = event.request.url;
  var isFirebase = url.includes('firestore.googleapis.com') ||
                   url.includes('firebase') ||
                   url.includes('gstatic.com/firebasejs');
  var isFont    = url.includes('fonts.googleapis.com') ||
                  url.includes('fonts.gstatic.com');
  var isAppFile = APP_FILES.some(function(f) {
    return url.includes(f.replace('./', ''));
  });

  // Firebase & APIs → Network-first, pas de cache
  if (isFirebase) {
    event.respondWith(
      fetch(event.request).catch(function() {
        return new Response('{}', {headers: {'Content-Type': 'application/json'}});
      })
    );
    return;
  }

  // Polices Google → Cache-first avec fallback réseau
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

  // Fichiers app → Cache-first avec mise à jour silencieuse
  if (isAppFile || event.request.mode === 'navigate') {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        var networkFetch = fetch(event.request).then(function(response) {
          if (response && response.status === 200) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function(c) { c.put(event.request, clone); });
          }
          return response;
        }).catch(function() { return null; });

        return cached || networkFetch || new Response('<h1>ZAG GROUP</h1><p>Ouvrez l\'application une fois en ligne pour activer le mode hors-ligne.</p>', {headers: {'Content-Type': 'text/html'}});
      })
    );
    return;
  }

  // Tout le reste → Network avec fallback cache
  event.respondWith(
    fetch(event.request).catch(function() {
      return caches.match(event.request);
    })
  );
});

// ── MESSAGE : forcer la mise à jour ──────────────────
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CACHE_UPDATED') {
    self.clients.matchAll().then(function(clients) {
      clients.forEach(function(client) {
        client.postMessage({type: 'SW_UPDATED'});
      });
    });
  }
});

// ── BACKGROUND SYNC ──────────────────────────────────
self.addEventListener('sync', function(event) {
  if (event.tag === 'zag-sync-queue') {
    event.waitUntil(
      self.clients.matchAll().then(function(clients) {
        clients.forEach(function(client) {
          client.postMessage({type: 'PROCESS_QUEUE'});
        });
      })
    );
  }
});
