// Worn gear that has a model of its own.
//
// Everything here is its own GLB in assets/gear/, exported by tools/export_heroes.py, and
// mounted onto a node the hero rig already has. A new piece of gear is then a new file
// rather than a re-export of every character in the game.
//
// The Katana is the one exception and the reason the rule is written down. It was baked into
// the knight as a `weapon_katana` node beside his own sword, because a weapon has to sit in a
// fist whose grip only that hero knows - which was true, and answered the wrong way. The grip
// IS the hero's `weapon` node: an origin already in the hand. A sword exported about its own
// grip drops straight into it, and heroes.js mounts it as one more variant, so nothing
// downstream can tell the difference between a baked weapon and a loaded one.
//
// Nothing here animates: a hat rides the head node and a weapon rides the weapon node, both
// of which the sim already poses.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const HAT_FILES = { robinHat: 'robinHat.glb' };
const WEAPON_FILES = { underWaterSword: 'underWaterSword.glb' };

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
  const load = async (files) => {
    const ids = Object.keys(files);
    const scenes = await Promise.all(ids.map((id) => loader.loadAsync(base + files[id])));
    return Object.fromEntries(ids.map((id, i) => [id, scenes[i].scene]));
  };
  const [hats, weapons] = await Promise.all([load(HAT_FILES), load(WEAPON_FILES)]);
  return { hats, weapons };
}

export const hasModel = (gear, id) => !!(gear?.hats?.[id] || gear?.weapons?.[id]);

/** The weapon model for an item, or null - the node the exporter named `weapon`, not the
 *  wrapper around it, so what comes back is already about its own grip. */
export function weaponNode(gear, id) {
  const src = gear?.weapons?.[id];
  const node = src && (src.getObjectByName('weapon') || src.children[0]);
  return node ? node.clone(true) : null;
}

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
