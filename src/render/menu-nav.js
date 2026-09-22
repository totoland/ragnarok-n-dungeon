// Driving a menu with a pad.
//
// A screen that can only be reached with a mouse is a screen a player on a controller cannot
// use, and this game is played on a tablet as often as not. So every menu gets the same
// treatment: a stick or d-pad moves a real DOM focus between real buttons, confirm clicks the
// focused one, back leaves. Real focus rather than a cursor of our own, because then the
// keyboard, the mouse and the pad are all steering one thing and only one thing can be wrong.
//
// The character panel grew this first; it lives here so the title screen and the test panel
// do not each get their own slightly different version of it.

/** Every button on screen that can actually be pressed, in DOM order. */
export const focusablesIn = (root) => [...root.querySelectorAll('button:not([disabled])')]
  .filter((b) => b.offsetParent !== null);

/**
 * Move focus one step in `dir`, by where things are rather than by DOM order - which is what
 * a player means when they push a stick left.
 *
 * A cone, then how far it is in the direction pushed. Anything more than about 65 degrees off
 * the push is discarded outright; what survives is judged mostly on `along`, with a light
 * penalty for being off to the side.
 *
 * The weight on that penalty is the whole of it. At 2.5 - where this started - a button
 * directly below but a little across lost to a further one that lined up better, so a pad
 * walking down the title screen jumped past Profile and past the start button. At 0.5 the
 * next row down wins, which is what a player means by "down", and a grid still walks in
 * straight lines because in a grid the thing in the next column is not off to the side.
 */
export function moveFocus(list, dir) {
  if (!list.length) return;
  const cur = document.activeElement;
  if (!list.includes(cur)) { list[0].focus(); return; }
  const r = cur.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let best = null, score = Infinity;
  for (const b of list) {
    if (b === cur) continue;
    const q = b.getBoundingClientRect();
    const dx = q.left + q.width / 2 - cx, dy = q.top + q.height / 2 - cy;
    const along = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
    if (along <= 2) continue;                       // behind us, or level with us
    const across = (dir === 'left' || dir === 'right') ? Math.abs(dy) : Math.abs(dx);
    if (across > along * 2.2) continue;             // outside the cone: not that way at all
    const s = along + across * 0.5;                  // the next row down, not the best-aligned one
    if (s < score) { score = s; best = b; }
  }
  if (best) best.focus();
}

/**
 * A pad-driven focus loop over one element.
 *
 * `active()` says whether the loop should be doing anything this frame - a menu that is
 * hidden, or one sitting under another menu, answers false and the pad is left alone. The
 * loop keeps running either way: starting and stopping a rAF on every overlay open is more
 * moving parts than reading a gamepad that is not there.
 */
export function createMenuNav({ input, root, active, onConfirm, onBack }) {
  let raf = 0;
  const list = () => focusablesIn(root);

  function tick() {
    raf = requestAnimationFrame(tick);
    if (!active()) return;
    const nav = input.menuNav();
    if (nav.up) moveFocus(list(), 'up');
    if (nav.down) moveFocus(list(), 'down');
    if (nav.left) moveFocus(list(), 'left');
    if (nav.right) moveFocus(list(), 'right');
    if (nav.confirm) {
      const cur = document.activeElement;
      const all = list();
      if (all.includes(cur)) (onConfirm ? onConfirm(cur) : cur.click());
      else all[0]?.focus();                         // nothing focused yet: take the first
    }
    if (nav.back) onBack?.();
  }

  return {
    start() { if (!raf) raf = requestAnimationFrame(tick); },
    stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } },
    /** Put focus somewhere sensible, for when a screen opens. */
    focusFirst(preferred) {
      const all = list();
      const want = preferred && all.includes(preferred) ? preferred : all[0];
      want?.focus();
    },
    /** A re-render destroys the focused element; put focus back in its place afterwards. */
    keepFocus(fn) {
      const before = list();
      const at = before.indexOf(document.activeElement);
      fn();
      if (at < 0) return;
      const after = list();
      (after[Math.min(at, after.length - 1)] || after[0])?.focus();
    },
  };
}
