// Lets the player drag the on-screen controls where their thumbs actually are. Positions are
// stored as a fraction of the viewport (see settings.js), so a layout arranged in landscape
// stays proportionally right after a rotation instead of ending up off-screen.
//
// Editing deliberately seeds *every* control at once, even the ones left untouched. A layout
// that is half CSS grid and half hand-placed moves in confusing ways the moment the grid
// reflows, so the first drag makes the whole layout explicit.
import { TOUCH_CONTROLS } from '../settings.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const LO = 0.04, HI = 0.96;

function node(c, root = document) {
  return root.querySelector(c.sel);
}

/** Position every control from the stored layout, or clear back to the CSS defaults. */
export function applyLayout(settings, root = document) {
  const touch = settings?.touch || {};
  const layout = touch.layout || {};
  const custom = Object.keys(layout).length > 0;
  const tbtns = root.getElementById('tbtns');
  if (tbtns) tbtns.classList.toggle('free', custom);
  for (const c of TOUCH_CONTROLS) {
    const n = node(c, root);
    if (!n) continue;
    const p = layout[c.key];
    // A floating stick has no fixed home, so its saved position is ignored until the
    // player parks it. The entry is kept, not deleted, so toggling back restores it.
    const skip = c.key === 'stick' && touch.floating;
    if (p && !skip) {
      n.style.left = `${(p.x * 100).toFixed(3)}%`;
      n.style.top = `${(p.y * 100).toFixed(3)}%`;
      n.style.right = 'auto';
      n.style.bottom = 'auto';
      n.style.transform = 'translate(-50%, -50%)';
    } else {
      n.style.left = ''; n.style.top = ''; n.style.right = ''; n.style.bottom = ''; n.style.transform = '';
    }
  }
}

/** Read where the controls are right now and freeze that as the starting layout. */
function seedFromScreen(settings, root = document) {
  const layout = {};
  for (const c of TOUCH_CONTROLS) {
    const n = node(c, root);
    if (!n || !n.offsetWidth) continue;
    const r = n.getBoundingClientRect();
    layout[c.key] = {
      x: clamp((r.left + r.width / 2) / window.innerWidth, LO, HI),
      y: clamp((r.top + r.height / 2) / window.innerHeight, LO, HI),
    };
  }
  settings.touch.layout = layout;
  return layout;
}

/**
 * Drag-to-place mode. Returns a promise that resolves when the player is done, so the caller
 * can reopen whatever menu it came from.
 */
export function startEdit({ settings, onChange, root = document } = {}) {
  const touchEl = root.getElementById('touch');
  if (!touchEl) return Promise.resolve(false);

  // The controls have to be on screen to be dragged, even if the player has them set to
  // "off" or is editing from a desktop where auto-detect hides them.
  const wasHidden = touchEl.hidden;
  const hadClass = document.body.classList.contains('touch');
  touchEl.hidden = false;
  document.body.classList.add('touch', 'touch-edit');

  if (!Object.keys(settings.touch.layout || {}).length) seedFromScreen(settings, root);
  applyLayout(settings, root);

  const bar = el('div', 'tedit-bar');
  const hint = el('span', 'tedit-hint', 'Drag the controls where you want them');
  const reset = el('button', 'ghost', 'Reset positions');
  const done = el('button', 'tedit-done', 'Done');
  reset.type = 'button'; done.type = 'button';
  bar.append(hint, reset, done);
  document.body.append(bar);

  const drags = [];
  let active = null;

  for (const c of TOUCH_CONTROLS) {
    const n = node(c, root);
    if (!n) continue;
    if (c.key === 'stick' && settings.touch.floating) {
      n.classList.add('tedit-locked');
      continue;
    }
    n.classList.add('tedit-item');
    // Capture phase, and the event is swallowed: otherwise the same pointerdown also fires
    // the gameplay handler underneath and the hero attacks while you are arranging buttons.
    const down = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const r = n.getBoundingClientRect();
      active = { n, key: c.key, dx: e.clientX - (r.left + r.width / 2), dy: e.clientY - (r.top + r.height / 2), id: e.pointerId };
      n.classList.add('tedit-drag');
      try { n.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    };
    const move = (e) => {
      if (!active || active.n !== n || e.pointerId !== active.id) return;
      e.preventDefault(); e.stopPropagation();
      const x = clamp((e.clientX - active.dx) / window.innerWidth, LO, HI);
      const y = clamp((e.clientY - active.dy) / window.innerHeight, LO, HI);
      settings.touch.layout[active.key] = { x, y };
      n.style.left = `${(x * 100).toFixed(3)}%`;
      n.style.top = `${(y * 100).toFixed(3)}%`;
      n.style.right = 'auto'; n.style.bottom = 'auto';
      n.style.transform = 'translate(-50%, -50%)';
    };
    const up = (e) => {
      if (!active || active.n !== n) return;
      e.preventDefault(); e.stopPropagation();
      n.classList.remove('tedit-drag');
      active = null;
      onChange?.(settings);
    };
    n.addEventListener('pointerdown', down, true);
    n.addEventListener('pointermove', move, true);
    n.addEventListener('pointerup', up, true);
    n.addEventListener('pointercancel', up, true);
    drags.push(() => {
      n.removeEventListener('pointerdown', down, true);
      n.removeEventListener('pointermove', move, true);
      n.removeEventListener('pointerup', up, true);
      n.removeEventListener('pointercancel', up, true);
      n.classList.remove('tedit-item', 'tedit-drag', 'tedit-locked');
    });
  }

  return new Promise((resolve) => {
    const finish = () => {
      for (const off of drags) off();
      bar.remove();
      document.body.classList.remove('touch-edit');
      if (!hadClass) document.body.classList.remove('touch');
      touchEl.hidden = wasHidden;
      applyLayout(settings, root);
      onChange?.(settings);
      resolve(true);
    };
    reset.addEventListener('click', () => {
      settings.touch.layout = {};
      applyLayout(settings, root);
      seedFromScreen(settings, root);
      applyLayout(settings, root);
      onChange?.(settings);
    });
    done.addEventListener('click', finish);
  });
}
