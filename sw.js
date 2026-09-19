// Service worker: makes Dungeon RO installable and playable offline.
//
// deploy.sh rewrites __BUILD__ to the image tag on the Pi after the rsync, so every deploy
// ships a byte-different worker. The browser notices, installs it, and `activate` drops every
// cache that is not this build's - which is the whole cache-busting story. Without that the
// runtime cache below would serve the previous deploy's modules for one more load, and this
// project has already lost an afternoon to "the deploy did not work" twice.
const BUILD = '__BUILD__';
const CACHE = `dro-${BUILD}`;
const DEV = BUILD.includes('BUILD');   // unsubstituted: running off `npm run dev`

// Enough to paint the title screen with no network. Everything else - the module graph, three,
// the GLBs - lands in the same cache on first play, so there is no file list here to go stale
// in a project with no build step.
const SHELL = ['./', './index.html', './style.css', './manifest.webmanifest',
               './assets/icons/icon-192.png'];

self.addEventListener('install', (e) => {
  if (DEV) return self.skipWaiting();
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(SHELL))
    .catch(() => {})            // a miss here must not block the worker from installing
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (DEV || req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/gamepad.html') return;        // a diagnostic must never read from cache

  // Navigations go to the network first so a new deploy is picked up the moment it exists,
  // and fall back to the cached shell only when there is no network at all.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req)
      .then((res) => { put(req, res.clone()); return res; })
      .catch(() => caches.match('./index.html').then((r) => r || fetch(req))));
    return;
  }

  // Everything else is cache-first. Within one build these files never change - the cache is
  // thrown away wholesale when the next build's worker activates - so revalidating each of
  // ~10 MB of models and vendored three.js on every launch would buy nothing.
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res && res.ok && res.type === 'basic') put(req, res.clone());
    return res;
  })));
});

function put(req, res) {
  caches.open(CACHE).then((c) => c.put(req, res)).catch(() => {});
}
