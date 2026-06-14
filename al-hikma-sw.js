// AL-HIKMA Service Worker v1.0
var CACHE_NAME = 'alhikma-v1';
var APP_FILES = [
  './al-hikma-launcher.html',
  './al-hikma-educatrice.html',
  './al-hikma-manifest.json',
  './al-hikma-icon-192.png',
  './al-hikma-icon-512.png'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return Promise.allSettled(APP_FILES.map(function(url) {
        return cache.add(url).catch(function(){});
      }));
    }).then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k){return k!==CACHE_NAME;}).map(function(k){return caches.delete(k);}));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event) {
  var url = event.request.url;
  var isFirebase = url.includes('firestore.googleapis.com') || url.includes('firebase') || url.includes('gstatic.com/firebasejs');

  if (isFirebase) {
    event.respondWith(fetch(event.request).catch(function(){
      return new Response('{}', {headers:{'Content-Type':'application/json'}});
    }));
    return;
  }

  if (event.request.mode === 'navigate' || url.includes('al-hikma')) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        var net = fetch(event.request).then(function(res){
          if(res && res.status===200){
            var clone=res.clone();
            caches.open(CACHE_NAME).then(function(c){c.put(event.request, clone);});
          }
          return res;
        }).catch(function(){return null;});
        return cached || net;
      })
    );
    return;
  }

  event.respondWith(fetch(event.request).catch(function(){ return caches.match(event.request); }));
});

self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
