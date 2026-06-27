/**
 * ZAG GROUP — sw.js (Service Worker)
 * Stratégie : Cache First pour assets statiques, Network First pour données
 * Version mise à jour automatiquement — changer CACHE_VERSION pour forcer refresh
 */

var CACHE_VERSION = 'zag-v12-1';
var CACHE_STATIC  = CACHE_VERSION + '-static';
var CACHE_PAGES   = CACHE_VERSION + '-pages';

// Fichiers à mettre en cache immédiatement à l'installation
var STATIC_ASSETS = [
  './zag-shared.js',
  './manifest.json',
  './icon-512.png',
  './icon-192.png',
  'https://fonts.googleapis.com/css2?family=Exo+2:wght@400;600;700;800;900&family=Inter:wght@400;500;600&display=swap'
];

// Pages applicatives à mettre en cache
var APP_PAGES = [
  './zaggroup-11.html',
  './gestionnaire_new-2-7.html',
  './patron-19.html',
  './vitrine_v3_finale.html'
];

// ══════════════════════════════════════════════
// INSTALLATION
// ══════════════════════════════════════════════
self.addEventListener('install', function(event) {
  console.log('[SW] Installation ' + CACHE_VERSION);
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_STATIC).then(function(cache) {
        // Mettre en cache les assets statiques (ignorer les erreurs individuelles)
        return Promise.allSettled(
          STATIC_ASSETS.map(function(url) {
            return cache.add(url).catch(function(e) {
              console.warn('[SW] Cache fail:', url, e.message);
            });
          })
        );
      }),
      caches.open(CACHE_PAGES).then(function(cache) {
        return Promise.allSettled(
          APP_PAGES.map(function(url) {
            return cache.add(url).catch(function(e) {
              console.warn('[SW] Page cache fail:', url, e.message);
            });
          })
        );
      })
    ]).then(function() {
      // Activer immédiatement sans attendre fermeture des anciens clients
      return self.skipWaiting();
    })
  );
});

// ══════════════════════════════════════════════
// ACTIVATION — Nettoyer les anciens caches
// ══════════════════════════════════════════════
self.addEventListener('activate', function(event) {
  console.log('[SW] Activation ' + CACHE_VERSION);
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) {
          return key !== CACHE_STATIC && key !== CACHE_PAGES;
        }).map(function(key) {
          console.log('[SW] Suppression ancien cache:', key);
          return caches.delete(key);
        })
      );
    }).then(function() {
      // Prendre le contrôle de tous les clients immédiatement
      return self.clients.claim();
    })
  );
});

// ══════════════════════════════════════════════
// FETCH — Stratégies de cache
// ══════════════════════════════════════════════
self.addEventListener('fetch', function(event) {
  var url = event.request.url;

  // Ignorer les requêtes non-GET
  if (event.request.method !== 'GET') return;

  // Ignorer Firebase (Firestore gère son propre cache)
  if (url.includes('firestore.googleapis.com') ||
      url.includes('firebase') ||
      url.includes('gstatic.com')) {
    return;
  }

  // Ignorer Chrome extensions
  if (url.startsWith('chrome-extension://')) return;

  // Pages HTML : Network First (fraîches) avec fallback cache
  if (url.endsWith('.html') || url.includes('.html?')) {
    event.respondWith(
      fetch(event.request)
        .then(function(response) {
          if (response && response.status === 200) {
            var clone = response.clone();
            caches.open(CACHE_PAGES).then(function(cache) {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(function() {
          return caches.match(event.request).then(function(cached) {
            if (cached) return cached;
            // Page de fallback hors-ligne
            return caches.match('./zaggroup-11.html');
          });
        })
    );
    return;
  }

  // Assets statiques (JS, CSS, images) : Cache First
  if (url.endsWith('.js') || url.endsWith('.css') ||
      url.endsWith('.png') || url.endsWith('.jpg') ||
      url.endsWith('.json') || url.includes('fonts.googleapis')) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        return fetch(event.request).then(function(response) {
          if (response && response.status === 200) {
            var clone = response.clone();
            caches.open(CACHE_STATIC).then(function(cache) {
              cache.put(event.request, clone);
            });
          }
          return response;
        });
      })
    );
    return;
  }
});

// ══════════════════════════════════════════════
// MESSAGES — Depuis les pages (skip waiting, etc.)
// ══════════════════════════════════════════════
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'GET_VERSION') {
    event.source.postMessage({ type: 'VERSION', version: CACHE_VERSION });
  }
});

// ══════════════════════════════════════════════
// BACKGROUND SYNC (si supporté)
// ══════════════════════════════════════════════
self.addEventListener('sync', function(event) {
  if (event.tag === 'zag-sync-ventes') {
    console.log('[SW] Background sync ventes déclenché');
    // La sync réelle est gérée dans gestionnaire.html via syncLocalSorties()
    // Ici on notifie juste les clients
    event.waitUntil(
      self.clients.matchAll().then(function(clients) {
        clients.forEach(function(client) {
          client.postMessage({ type: 'SYNC_REQUESTED' });
        });
      })
    );
  }
});
