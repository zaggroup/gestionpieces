/**
 * ZAG GROUP — zag-shared.js
 * Fichier partagé par zaggroup-11.html, gestionnaire.html, patron.html
 * Contient : config Firebase, utils, auth/session, hash PIN, fakeDb
 * Version : 1.0 — Juin 2025
 */

'use strict';

// ══════════════════════════════════════════════
// CONFIG FIREBASE (source unique de vérité)
// ══════════════════════════════════════════════
var ZAG_FIREBASE_CONFIG = {
  apiKey:            "AIzaSyDWF-Q3S2M-btrRBHBYzd9dVbY6iEg_fNk",
  authDomain:        "gestionpieces-74559.firebaseapp.com",
  projectId:         "gestionpieces-74559",
  storageBucket:     "gestionpieces-74559.firebasestorage.app",
  messagingSenderId: "392970031226",
  appId:             "1:392970031226:web:68bb9966b4440576a2ebc3"
};

// ══════════════════════════════════════════════
// CONSTANTES GLOBALES
// ══════════════════════════════════════════════
var ZAG = window.ZAG || {};
ZAG.WHATSAPP_NUM   = "224626207646";
ZAG.APP_VERSION    = "12.1";
ZAG.SESSION_HOURS  = 8;
ZAG.SESSION_MS     = ZAG.SESSION_HOURS * 60 * 60 * 1000;
ZAG.HEARTBEAT_MS   = 30 * 60 * 1000; // 30 minutes

// Variables d'état partagées
ZAG.db          = null;
ZAG.FIREBASE_OK = false;
ZAG._appStarted = false;
ZAG.CODES       = { gest: '5678', admin: '1234' }; // remplacés par Firestore
ZAG.CODES_HASH  = { gest: null, admin: null };      // hash SHA-256 (hors-ligne)

// Nettoyage des codes en clair laissés par les anciennes versions
try { localStorage.removeItem('zag_codes'); } catch(e) {}

// Charger les hash hors-ligne
try {
  var _ch = JSON.parse(localStorage.getItem('zag_codes_hash') || '{}');
  if (_ch.gest)  ZAG.CODES_HASH.gest  = _ch.gest;
  if (_ch.admin) ZAG.CODES_HASH.admin = _ch.admin;
} catch(e) {}

window.ZAG = ZAG;

// ══════════════════════════════════════════════
// UTILS — Formatage et helpers
// ══════════════════════════════════════════════
function fmt(n) { return Math.round(n || 0).toLocaleString('fr-FR'); }

function escapeHtml(s) {
  if (s === undefined || s === null) return '';
  return String(s).replace(/[&<>"']/g, function(c) {
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":"&#39;" }[c];
  });
}

function fmtDate(ts) {
  return ts && ts.toDate
    ? ts.toDate().toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
    : '—';
}

function fmtDateCourt(ts) {
  if (!ts || !ts.toDate) return '—';
  var d = ts.toDate();
  var now = new Date();
  var diff = Math.floor((now - d) / 86400000);
  if (diff === 0) return "Aujourd'hui " + d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
  if (diff === 1) return 'Hier ' + d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
  return d.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit' });
}

function genRecu() {
  return 'ZAG-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random() * 9000) + 1000);
}

function today() { return new Date().toDateString(); }
function todayStr() { return new Date().toDateString(); }
function yesterStr() { return new Date(Date.now() - 86400000).toDateString(); }
function daysAgo(n) { return new Date(Date.now() - n * 86400000); }
function startOfMonth() { var d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; }
function startOfYear()  { var d = new Date(); d.setMonth(0,1); d.setHours(0,0,0,0); return d; }

// ══════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ══════════════════════════════════════════════
function showToast(msg, isErr) {
  var t = document.getElementById('toast');
  if (!t) {
    // Créer le toast s'il n'existe pas
    t = document.createElement('div');
    t.id = 'toast';
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
      'background:#1a472a;color:#fff;padding:12px 20px;border-radius:12px;font-size:.85rem;' +
      'font-weight:600;z-index:9999;display:none;max-width:90vw;text-align:center;' +
      'box-shadow:0 4px 20px rgba(0,0,0,.3);';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.background = isErr ? '#c62828' : '#1a472a';
  t.style.display = 'block';
  t.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(function() {
    t.style.display = 'none';
    t.className = 'toast';
  }, 3500);
}

// ══════════════════════════════════════════════
// OVERLAYS
// ══════════════════════════════════════════════
function openOv(id) {
  var el = document.getElementById(id);
  if (el) el.classList.add('show');
}
function closeOv(id) {
  var el = document.getElementById(id);
  if (el) el.classList.remove('show');
}

// ══════════════════════════════════════════════
// HASH PIN SHA-256 (Web Crypto API)
// ══════════════════════════════════════════════
async function hashPin(pin) {
  try {
    var enc = new TextEncoder().encode(String(pin));
    var buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf))
      .map(function(b) { return b.toString(16).padStart(2, '0'); })
      .join('');
  } catch(e) {
    // Fallback si Web Crypto non disponible (très rare)
    return String(pin);
  }
}

// Vérifier un PIN : d'abord en mémoire (Firebase), puis via hash (hors-ligne)
async function verifierPin(code, role) {
  var inMemory = role === 'admin' ? ZAG.CODES.admin : ZAG.CODES.gest;
  // Code en clair en mémoire (Firebase disponible, ≤8 chars)
  if (inMemory && inMemory.length <= 8) {
    return code === inMemory;
  }
  // Fallback hash hors-ligne
  var savedHash = role === 'admin' ? ZAG.CODES_HASH.admin : ZAG.CODES_HASH.gest;
  if (!savedHash) return false;
  var h = await hashPin(code);
  return h === savedHash;
}

// ══════════════════════════════════════════════
// SESSION
// ══════════════════════════════════════════════
function saveSession(role, nom) {
  try {
    var sess = { role: role, nom: nom || '', expiry: Date.now() + ZAG.SESSION_MS };
    sessionStorage.setItem('zag_session', JSON.stringify(sess));
  } catch(e) {}
}

function getSession() {
  try {
    var sess = JSON.parse(sessionStorage.getItem('zag_session') || 'null');
    if (sess && Date.now() < sess.expiry) return sess;
  } catch(e) {}
  return null;
}

function clearSession() {
  try { sessionStorage.removeItem('zag_session'); } catch(e) {}
}

function renewSession() {
  try {
    var sess = JSON.parse(sessionStorage.getItem('zag_session') || 'null');
    if (sess) {
      sess.expiry = Date.now() + ZAG.SESSION_MS;
      sessionStorage.setItem('zag_session', JSON.stringify(sess));
    }
  } catch(e) {}
}

// Heartbeat : vérifie et renouvelle la session toutes les 30 min
function startSessionHeartbeat(onExpired) {
  return setInterval(function() {
    try {
      var sess = JSON.parse(sessionStorage.getItem('zag_session') || 'null');
      if (!sess || Date.now() >= sess.expiry) {
        showToast('⏱️ Session expirée — reconnexion requise', true);
        setTimeout(function() {
          if (onExpired) onExpired();
          else window.location.href = 'zaggroup-11.html';
        }, 2500);
      } else {
        renewSession();
      }
    } catch(e) {}
  }, ZAG.HEARTBEAT_MS);
}

// ══════════════════════════════════════════════
// FAKE DB (mode hors-ligne complet)
// ══════════════════════════════════════════════
function createFakeDb() {
  function makeFakeRef(name) {
    return {
      _name: name,
      onSnapshot: function(ok, err) {
        try {
          var items = JSON.parse(localStorage.getItem('zag_col_' + name) || '[]');
          ok({ docs: items.map(function(d) {
            return { id: d.id || ('local_' + Math.random()), data: function() { return d; } };
          })});
        } catch(e) { if (err) err(e); }
        return function() {}; // unsubscribe noop
      },
      get: function() {
        return Promise.resolve({
          exists: false, docs: [],
          forEach: function() {}, data: function() { return {}; }
        });
      },
      add: function(d) {
        try {
          var pending = JSON.parse(localStorage.getItem('zag_pending') || '[]');
          var item = Object.assign({}, d, { _col: name, _ts: Date.now(), id: 'local_' + Date.now() });
          pending.push(item);
          localStorage.setItem('zag_pending', JSON.stringify(pending));
          // Aussi sauvegarder dans la collection locale
          var items = JSON.parse(localStorage.getItem('zag_col_' + name) || '[]');
          items.unshift(item);
          localStorage.setItem('zag_col_' + name, JSON.stringify(items.slice(0, 500)));
        } catch(e) {}
        return Promise.resolve({ id: 'local_' + Date.now() });
      },
      doc: function(id) {
        var self = this;
        return {
          get: function() { return Promise.resolve({ exists: false, data: function() { return {}; } }); },
          set: function(data) {
            try {
              var items = JSON.parse(localStorage.getItem('zag_col_' + name) || '[]');
              var idx = items.findIndex(function(x) { return x.id === id; });
              if (idx > -1) items[idx] = Object.assign({}, items[idx], data);
              else items.unshift(Object.assign({ id: id }, data));
              localStorage.setItem('zag_col_' + name, JSON.stringify(items));
            } catch(e) {}
            return Promise.resolve();
          },
          update: function(data) { return this.set(data); },
          delete: function() {
            try {
              var items = JSON.parse(localStorage.getItem('zag_col_' + name) || '[]');
              localStorage.setItem('zag_col_' + name, JSON.stringify(items.filter(function(x) { return x.id !== id; })));
            } catch(e) {}
            return Promise.resolve();
          }
        };
      },
      orderBy: function() { return this; },
      where: function() { return this; },
      limit: function() { return this; }
    };
  }

  return {
    collection: function(name) { return makeFakeRef(name); },
    runTransaction: function(fn) {
      // Simuler une transaction en mode hors-ligne (pas de garantie atomique)
      var fakeTransaction = {
        get: function(ref) { return Promise.resolve({ exists: false, data: function() { return {}; } }); },
        set: function() {},
        update: function() {}
      };
      return fn(fakeTransaction).catch(function() {});
    },
    batch: function() {
      return {
        set: function() {}, update: function() {}, delete: function() {},
        commit: function() { return Promise.resolve(); }
      };
    }
  };
}

// ══════════════════════════════════════════════
// INIT FIREBASE (chargement dynamique des scripts)
// ══════════════════════════════════════════════
function initFirebase(onReady, onFallback) {
  if (!navigator.onLine) {
    ZAG.db = createFakeDb();
    ZAG.FIREBASE_OK = false;
    if (onFallback) onFallback();
    return;
  }

  var timeout = setTimeout(function() {
    if (!ZAG.FIREBASE_OK && !ZAG._appStarted) {
      ZAG.db = createFakeDb();
      ZAG._appStarted = true;
      if (onFallback) onFallback();
    }
  }, 5000);

  var s1 = document.createElement('script');
  s1.src = 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js';
  s1.onload = function() {
    var s2 = document.createElement('script');
    s2.src = 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js';
    s2.onload = function() {
      try {
        if (!firebase.apps.length) {
          firebase.initializeApp(ZAG_FIREBASE_CONFIG);
        }
        ZAG.db = firebase.firestore();
        ZAG.FIREBASE_OK = true;
        clearTimeout(timeout);

        // enablePersistence pour le cache hors-ligne
        ZAG.db.enablePersistence({ synchronizeTabs: true })
          .catch(function(e) {
            if (e.code === 'failed-precondition') {
              console.warn('ZAG: Persistance — plusieurs onglets ouverts');
            }
          });

        // Charger les codes depuis Firestore et sauvegarder les hash
        ZAG.db.collection('app_config').doc('codes').get().then(function(doc) {
          if (doc.exists) {
            var d = doc.data();
            if (d.gest)  ZAG.CODES.gest  = d.gest;
            if (d.admin) ZAG.CODES.admin = d.admin;
            // Sauvegarder hash pour mode hors-ligne
            Promise.all([hashPin(ZAG.CODES.gest), hashPin(ZAG.CODES.admin)])
              .then(function(hashes) {
                try {
                  localStorage.setItem('zag_codes_hash', JSON.stringify({
                    gest: hashes[0], admin: hashes[1]
                  }));
                  ZAG.CODES_HASH.gest  = hashes[0];
                  ZAG.CODES_HASH.admin = hashes[1];
                } catch(e) {}
              });
          }
        }).catch(function() {});

        if (!ZAG._appStarted) {
          ZAG._appStarted = true;
          if (onReady) onReady(ZAG.db);
        }
      } catch(e) {
        clearTimeout(timeout);
        ZAG.db = createFakeDb();
        if (!ZAG._appStarted) {
          ZAG._appStarted = true;
          if (onFallback) onFallback();
        }
      }
    };
    s2.onerror = function() {
      clearTimeout(timeout);
      ZAG.db = createFakeDb();
      if (!ZAG._appStarted) { ZAG._appStarted = true; if (onFallback) onFallback(); }
    };
    document.head.appendChild(s2);
  };
  s1.onerror = function() {
    clearTimeout(timeout);
    ZAG.db = createFakeDb();
    if (!ZAG._appStarted) { ZAG._appStarted = true; if (onFallback) onFallback(); }
  };
  document.head.appendChild(s1);
}

// ══════════════════════════════════════════════
// SYNC BANNER (icône de sync offline)
// ══════════════════════════════════════════════
function updateSyncBanner() {
  var pending = [];
  try { pending = JSON.parse(localStorage.getItem('zag_sorties_pending') || '[]'); } catch(e) {}
  var pendingE = [];
  try { pendingE = JSON.parse(localStorage.getItem('zag_entrees_pending') || '[]'); } catch(e) {}
  var total = pending.length + pendingE.length;
  var banner = document.getElementById('syncBanner');
  var count  = document.getElementById('syncCount');
  if (!banner) return;
  if (total > 0) {
    banner.style.display = 'block';
    if (count) count.textContent = total + ' opération(s) en attente de sync';
  } else {
    banner.style.display = 'none';
  }
}

// ══════════════════════════════════════════════
// LOG SESSION FIRESTORE
// ══════════════════════════════════════════════
function logSession(gestionnaire, action) {
  if (!ZAG.FIREBASE_OK || !ZAG.db) return;
  ZAG.db.collection('sessions').add({
    gestionnaire: gestionnaire || 'Inconnu',
    action: action || 'connexion',
    date: firebase.firestore.Timestamp.now(),
    userAgent: navigator.userAgent.substring(0, 100)
  }).catch(function() {});
}

// ══════════════════════════════════════════════
// WHATSAPP HELPERS
// ══════════════════════════════════════════════
function ouvrirWhatsApp(message) {
  var url = 'https://wa.me/' + ZAG.WHATSAPP_NUM + '?text=' + encodeURIComponent(message);
  window.open(url, '_blank');
}

// ══════════════════════════════════════════════
// COMPRESSION IMAGE (Base64)
// ══════════════════════════════════════════════
function compresserImage(file, maxW, maxH, qualite, callback) {
  maxW    = maxW    || 400;
  maxH    = maxH    || 400;
  qualite = qualite || 0.7;
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var w = img.width, h = img.height;
      if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
      if (h > maxH) { w = Math.round(w * maxH / h); h = maxH; }
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      callback(canvas.toDataURL('image/jpeg', qualite));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ══════════════════════════════════════════════
// CONNECTIVITÉ
// ══════════════════════════════════════════════
function setConnStatus(ok) {
  var dot = document.getElementById('connDot');
  var lbl = document.getElementById('connLabel');
  if (dot) dot.className = 'status-dot ' + (ok ? 'dot-green' : 'dot-orange');
  if (lbl) lbl.textContent = ok ? 'Firebase connecté' : 'Mode hors-ligne';
}

window.addEventListener('online',  function() { setConnStatus(ZAG.FIREBASE_OK); });
window.addEventListener('offline', function() { setConnStatus(false); });

// ══════════════════════════════════════════════
// HORODATAGE CACHE
// ══════════════════════════════════════════════
function marquerCacheFrais() {
  try { localStorage.setItem('zag_cache_ts', String(Date.now())); } catch(e) {}
}

function getCacheAge() {
  try {
    var ts = parseInt(localStorage.getItem('zag_cache_ts') || '0');
    return ts > 0 ? Date.now() - ts : Infinity;
  } catch(e) { return Infinity; }
}

// Exporter sur window pour compatibilité avec le code existant
window.fmt          = fmt;
window.escapeHtml   = escapeHtml;
window.fmtDate      = fmtDate;
window.fmtDateCourt = fmtDateCourt;
window.genRecu      = genRecu;
window.today        = today;
window.todayStr     = todayStr;
window.yesterStr    = yesterStr;
window.daysAgo      = daysAgo;
window.startOfMonth = startOfMonth;
window.startOfYear  = startOfYear;
window.showToast    = showToast;
window.openOv       = openOv;
window.closeOv      = closeOv;
window.hashPin      = hashPin;
window.verifierPin  = verifierPin;
window.saveSession  = saveSession;
window.getSession   = getSession;
window.clearSession = clearSession;
window.renewSession = renewSession;
window.startSessionHeartbeat = startSessionHeartbeat;
window.createFakeDb = createFakeDb;
window.initFirebase = initFirebase;
window.updateSyncBanner = updateSyncBanner;
window.logSession   = logSession;
window.ouvrirWhatsApp = ouvrirWhatsApp;
window.compresserImage = compresserImage;
window.setConnStatus = setConnStatus;
window.marquerCacheFrais = marquerCacheFrais;
window.getCacheAge  = getCacheAge;
