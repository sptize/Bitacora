/* sw.js — Service worker de Bitácora Dev.
 * Todas las rutas son relativas al propio sw.js, por lo que funciona
 * en la raíz o bajo una subruta (https://usuario.github.io/repositorio/).
 * Al cambiar cualquier archivo de la app, sube el número de CACHE_VERSION. */
const CACHE_VERSION = 'v1';
const CACHE_NAME = 'bitacora-dev-' + CACHE_VERSION;

const APP_SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'db.js',
  'manifest.webmanifest',
  'icons/favicon.ico',
  'icons/icon-32.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-192.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) {
        // cache: 'reload' evita copiar versiones viejas desde la caché HTTP.
        return cache.addAll(APP_SHELL.map(function (u) { return new Request(u, { cache: 'reload' }); }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys
          .filter(function (k) { return k.indexOf('bitacora-dev-') === 0 && k !== CACHE_NAME; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  const req = event.request;
  const url = new URL(req.url);

  // Solo GET del mismo origen; lo demás pasa directo a la red.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (cached) {
      // Actualiza en segundo plano; si no hay red, se usa lo cacheado.
      const network = fetch(req).then(function (res) {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      }).catch(function () { return null; });

      if (cached) {
        event.waitUntil(network);
        return cached;
      }
      return network.then(function (res) {
        if (res) return res;
        // Sin red y sin caché: para navegaciones, devuelve la app.
        if (req.mode === 'navigate') return caches.match('index.html');
        return new Response('', { status: 504, statusText: 'Sin conexión' });
      });
    })
  );
});
