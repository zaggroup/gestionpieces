const CACHE = 'zaggroup-v3';
const FILES = [
  'zaggroup-11.html',
  'gestionnaire_new-2-7.html',
  'patron-19.html',
  'manifest.json',
  'icône-192-1.png',
  'icône-512-1.png'
];

// Installation - mise en cache de tous les fichiers
self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      return c.addAll(FILES);
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
  // Ignorer les requêtes Firebase (toujours en ligne)
  if(e.request.url.includes('firestore') || 
     e.request.url.includes('googleapis.com/google.firestore') ||
     e.request.url.includes('firebase')){
    return;
  }
  
  e.respondWith(
    caches.match(e.request).then(function(cached){
      if(cached) return cached;
      return fetch(e.request).then(function(response){
        // Mettre en cache les nouvelles ressources
        if(response && response.status === 200){
          var clone = response.clone();
          caches.open(CACHE).then(function(c){ c.put(e.request, clone); });
        }
        return response;
      }).catch(function(){
        // Hors ligne - retourner la page principale
        return caches.match('zaggroup-11.html');
      });
    })
  );
});
