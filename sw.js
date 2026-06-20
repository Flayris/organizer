/*
 * sw.js — Service Worker: permette all'app di installarsi e di funzionare offline.
 *
 * Strategia (pensata per non restare mai con versioni vecchie):
 *  - La PAGINA (index.html): prima la rete (così gli aggiornamenti si vedono
 *    subito quando sei online), e solo se offline usa la copia salvata.
 *  - Gli altri file (css/js/icone): prima la copia salvata, poi la rete. Tanto
 *    css e js cambiano indirizzo con "?v=N" a ogni modifica, quindi si aggiornano.
 *  - Le chiamate al foglio Google: SEMPRE dalla rete, mai salvate (dati live).
 */
const CACHE = 'organizer-v24';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// Installazione: salva l'ossatura dell'app.
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

// Attivazione: elimina le cache vecchie.
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((chiavi) => Promise.all(chiavi.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Arrivo di una notifica push (anche ad app CHIUSA): mostra la notifica.
self.addEventListener('push', (e) => {
  let dati = {};
  try { dati = e.data ? e.data.json() : {}; }
  catch (err) { dati = { titolo: 'Organizer', corpo: e.data ? e.data.text() : '' }; }
  const titolo = dati.titolo || 'Rinnovi in arrivo';
  e.waitUntil(self.registration.showNotification(titolo, {
    body: dati.corpo || '',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: 'rinnovi',
  }));
});

// Tocco sulla notifica di sistema: porta in primo piano l'app (o la apre).
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((finestre) => {
      for (const f of finestre) {
        if ('focus' in f) return f.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // I dati del foglio Google non si toccano: passa sempre dalla rete.
  if (url.hostname.includes('script.google')) return;

  // La pagina: prima la rete, poi (se offline) la copia salvata.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((risposta) => {
          const copia = risposta.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copia));
          return risposta;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Altri file: prima la copia salvata, poi la rete (e la salva per la prossima volta).
  e.respondWith(
    caches.match(e.request).then((salvata) =>
      salvata || fetch(e.request).then((risposta) => {
        const copia = risposta.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copia));
        return risposta;
      })
    )
  );
});
