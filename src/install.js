// Install-to-device support, kept out of main.js because none of it touches the game: it
// registers the service worker and offers the browser's install prompt on the title screen.

// Inside the native shell none of this applies: the app is installed already, every file
// is in the bundle, and there is no worker to register - build-web.mjs does not ship one.
const native = !!(window.Capacitor?.isNativePlatform?.() ?? window.Capacitor?.isNative)
  || location.protocol === 'capacitor:';

const btn = document.getElementById('title-install');
const hint = document.getElementById('install-hint');

const standalone = window.matchMedia('(display-mode: standalone)').matches
  || window.matchMedia('(display-mode: fullscreen)').matches
  || window.navigator.standalone === true;

if (!native && 'serviceWorker' in navigator) {
  // After load, so the worker's first-run precache never competes with the GLBs for bandwidth.
  window.addEventListener('load', () => {
    // updateViaCache: 'none' - the worker script itself is always fetched past the HTTP cache.
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  });
  // A new deploy ships a new worker; take it the moment it is ready rather than waiting for
  // every tab to close, and reload once so the page and its modules come from one build.
  let reloading = false;
  navigator.serviceWorker.addEventListener?.('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}

// Chromium hands us the prompt; holding the event is the only way to trigger it later.
let deferred = null;
if (!native) window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e;
  if (!standalone && btn) btn.hidden = false;
});

btn?.addEventListener('click', async () => {
  if (!deferred) return;
  btn.hidden = true;
  deferred.prompt();
  await deferred.userChoice.catch(() => {});
  deferred = null;
});

window.addEventListener('appinstalled', () => { if (btn) btn.hidden = true; deferred = null; });

// Safari fires no prompt event at all, on iOS or on the Mac, so the only way to install is
// the menu - say which one rather than leaving a button that would never appear.
if (!native && !standalone && hint) {
  const ua = navigator.userAgent;
  const webkit = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(ua);
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (webkit && ios) {
    hint.textContent = 'To install: Share → Add to Home Screen.';
    hint.hidden = false;
  } else if (webkit) {
    hint.textContent = 'To install: File → Add to Dock.';
    hint.hidden = false;
  }
}
