// Install-to-device support, kept out of main.js because none of it touches the game: it
// registers the service worker and offers the browser's install prompt on the title screen.

const btn = document.getElementById('title-install');
const hint = document.getElementById('install-hint');

const standalone = window.matchMedia('(display-mode: standalone)').matches
  || window.matchMedia('(display-mode: fullscreen)').matches
  || window.navigator.standalone === true;

if ('serviceWorker' in navigator) {
  // After load, so the worker's first-run precache never competes with the GLBs for bandwidth.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
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
window.addEventListener('beforeinstallprompt', (e) => {
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
if (!standalone && hint) {
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
