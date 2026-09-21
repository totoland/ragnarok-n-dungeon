// Worn gear that has a model of its own.
//
// A weapon is baked into each hero as a `weapon_<id>` node next to the hero's own (see
// heroes.js weaponNodes) because it has to sit in a hand whose grip only that hero knows.
// A hat has no such tie: it lands on top of a skull. So a hat is its own GLB, exported by
// tools/export_heroes.py into assets/gear/, and one file dresses either class - a new hat
// is a new file rather than a re-export of every character in the game.
//
// The hat rides the head node, so it nods, leans and blinks with the head the sim already
// poses. Nothing here animates.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const HAT_FILES = { robinHat: 'robinHat.glb' };

// Where a hat lands on a head. The exporter puts a hat's origin in the middle of its head
// band, so `y` is simply how high off the floor that band sits - a little below the top of
// the hair, so the brim cuts into it rather than hovering over it - and `scale` answers the
// head underneath: the hunter's is a third wider than the knight's.
const FIT = {
  knight: { y: 1.74, scale: 1.0 },
  hunter: { y: 1.60, scale: 1.14 },
};

export async function loadGearAssets(base = 'assets/gear/') {
  const loader = new GLTFLoader();
  const ids = Object.keys(HAT_FILES);
  const scenes = await Promise.all(ids.map((id) => loader.loadAsync(base + HAT_FILES[id])));
  const hats = {};
  ids.forEach((id, i) => { hats[id] = scenes[i].scene; });
  return { hats };
}

export const hasModel = (gear, id) => !!gear?.hats?.[id];

// A fresh copy of a hat, at the size the hero asks for and with its own materials, framed on
// its own origin. Used for the inventory icon, which draws the item alone.
export function hatNode(gear, id, heroKey = 'knight') {
  const src = gear?.hats?.[id];
  if (!src) return null;
  const node = src.clone(true);
  const s = FIT[heroKey]?.scale ?? 1;
  node.scale.setScalar(s);
  node.position.set(0, 0, 0);
  node.rotation.set(0, 0, 0);
  return node;
}

// The hat slot on a live hero. Returns show(hatId): a hat is cloned the first time it is
// worn and then kept, hidden, so swapping back never builds a material - and never hands a
// shader program back to be recompiled mid-fight, which is what the frame spikes were.
export function createHatSlot(rig, heroKey, gear, headPivotY = 0) {
  const fit = FIT[heroKey] || FIT.knight;
  const worn = new Map();
  let shown = null;
  // Returns the node it put on, but only the first time a hat is worn - the caller that
  // wants to recolour or re-material a hat only needs it then.
  return function show(hatId) {
    if (hatId === shown) return null;
    shown = hatId;
    for (const [id, node] of worn) node.visible = id === hatId;
    if (!hatId || worn.has(hatId) || !rig.head) return null;
    const node = hatNode(gear, hatId, heroKey);
    if (!node) return null;
    // The head node's origin is the neck, so the band's height above the floor becomes a
    // height above the neck. x/z stay 0: the hat is centred on the skull.
    node.position.set(0, fit.y - headPivotY, 0);
    node.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    rig.head.add(node);
    worn.set(hatId, node);
    return node;
  };
}
