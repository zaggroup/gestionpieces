const CACHE = 'zaggroup-v6';

const LOCAL_FILES = [
  './zaggroup-11.html',
  './zaggroup.html',
  './gestionnaire_new-2-7.html',
  './patron-19.html',
  './manifest.json',
  './sw.js'
];

// Installation
self.addEventListener('install', function(e){
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      return Promise.allSettled(
        LOCAL_FILES.map(function(url){
          return c.add(url).catch(function(err){
            console.log('Cache miss:', url, err);
          });
        })
      );
    })
  );
});

// Activation
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

// Message SKIP_WAITING
self.addEventListener('message', function(e){
  if(e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Fetch
self.addEventListener('fetch', function(e){
  // Ignorer Firebase/Firestore
  if(e.request.url.includes('firestore') ||
     e.request.url.includes('firebase') ||
     e.request.url.includes('gstatic') ||
     e.request.url.includes('googleapis.com/google') ||
     e.request.url.includes('fonts.googleapis') ||
     e.request.url.includes('fonts.gstatic')){
    return;
  }

  e.respondWith(
    caches.match(e.request).then(function(cached){
      if(cached){
        // Rafraîchir en arrière-plan si en ligne
        if(navigator.onLine){
          fetch(e.request).then(function(r){
            if(r && r.status === 200){
              caches.open(CACHE).then(function(c){ c.put(e.request, r); });
            }
          }).catch(function(){});
        }
        return cached;
      }
      return fetch(e.request).then(function(r){
        if(r && r.status === 200){
          var clone = r.clone();
          caches.open(CACHE).then(function(c){ c.put(e.request, clone); });
        }
        return r;
      }).catch(function(){
        if(e.request.mode === 'navigate'){
          return caches.match('./zaggroup-11.html');
        }
      });
    })
  );
});
