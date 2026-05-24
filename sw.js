const CACHE = 'zaggroup-v5';

// Fichiers locaux à mettre en cache
const LOCAL_FILES = [
  'zaggroup-11.html',
  'zaggroup.html',
  'gestionnaire_new-2-7.html',
  'patron-19.html',
  'manifest.json',
  'icône-192-1.png',
  'icône-512-1.png'
];

// Scripts Firebase à mettre en cache
const FIREBASE_FILES = [
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js'
];

const ALL_FILES = [...LOCAL_FILES, ...FIREBASE_FILES];

// Installation - mise en cache de tout
self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      // Mettre en cache les fichiers locaux
      return c.addAll(LOCAL_FILES).then(function(){
        // Mettre en cache Firebase séparément (peut échouer hors-ligne)
        return Promise.allSettled(
          FIREBASE_FILES.map(function(url){
            return fetch(url).then(function(r){ return c.put(url, r); }).catch(function(){});
          })
        );
      });
    }).then(function(){
      return self.skipWaiting();
    })
  );
});

// Activation - supprimer anciens caches
self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(
        keys.filter(function(k){ return k !== CACHE; })
            .map(function(k){ return caches.delete(k); })
      );
    }).then(function(){
      return self.clients.claim();
    })
  );
});

// Fetch - cache d'abord, réseau ensuite
self.addEventListener('fetch', function(e){
  // Ignorer les requêtes Firestore (données en temps réel)
  if(e.request.url.includes('firestore.googleapis.com') ||
     e.request.url.includes('google.firestore')){
    return;
  }

  e.respondWith(
    caches.match(e.request).then(function(cached){
      if(cached) return cached;
      return fetch(e.request).then(function(response){
        if(response && response.status === 200){
          var clone = response.clone();
          caches.open(CACHE).then(function(c){ c.put(e.request, clone); });
        }
        return response;
      }).catch(function(){
        // Hors-ligne - retourner page principale
        if(e.request.destination === 'document'){
          return caches.match('zaggroup-11.html');
        }
      });
    })
  );
});
