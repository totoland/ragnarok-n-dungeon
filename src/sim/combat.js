// Hit detection and damage. Pure: no state beyond what is passed in.
import { FLOOR } from '../config.js';

// Does `box` (attacker-relative: +x forward along `facing`) overlap the target's hurtbox?
// Targets are upright cylinders: centre (x, z), feet at y, radius r, height h.
export function boxHits(src, facing, box, target, depth = FLOOR.hitDepth) {
  const hb = target.hurtbox;
  // `both` boxes are radial: distance along x from the attacker, either side.
  const rel = box.both ? Math.abs(target.x - src.x) : (target.x - src.x) * facing;
  const x0 = box.both ? 0 : box.x0;
  const x1 = box.both ? Math.max(Math.abs(box.x0), Math.abs(box.x1)) : box.x1;
  if (rel + hb.r < x0 || rel - hb.r > x1) return false;
  if (Math.abs(target.z - src.z) > depth + hb.r * 0.3) return false;
  const yLo = src.y + box.y0, yHi = src.y + box.y1;
  return target.y + hb.h >= yLo && target.y <= yHi;
}

// Damage roll: atk × multiplier × ±10 % variance; a crit (rate and multiplier from the
// resolved hero, 8 % / 1.6× by default) scales it. Integer result, min 1.
export function rollDamage(atk, mult, rng, crit = 0.08, critDmg = 1.6) {
  const variance = 0.9 + 0.2 * rng.next();
  const isCrit = rng.next() < crit;
  const dmg = Math.max(1, Math.round(atk * mult * variance * (isCrit ? critDmg : 1)));
  return { dmg, crit: isCrit };
}

// Apply a connected hit: hp, knockback, hit-stun and launch. `dir` is the push direction (±1).
// Heavier monsters take less knockback; anything knocked upward is "launched" and can be juggled.
export function applyHit(target, dmg, knock, stun, dir, mass = 1) {
  target.hp = Math.max(0, target.hp - dmg);
  const k = 1 / Math.max(0.35, mass);
  target.vx = knock[0] * dir * k;
  // Hyper armour. A boss used to keep 45 % of the stun, which reads as a flinch and is
  // enough to cut a wind-up - so the Sandman, who is hit constantly because he is enormous
  // and slow, almost never got an attack out at all. A boss now takes the hit without
  // breaking stride: the flash, the damage and a shove are the feedback, and the wind-up is
  // still the tell to read. Mass 3 and over is exactly the five bosses and none of the
  // minions, the Baphomet's brood included.
  if (mass >= 3) {
    target.flash = 0.12;
    return target.hp <= 0;
  }
  if (knock[1] > 0) {
    target.vy = Math.max(target.vy, knock[1] * Math.min(1, k * 1.2));
    target.launched = true;
  } else if (knock[1] < 0) {
    target.vy = knock[1];
  }
  target.hitstun = Math.max(target.hitstun, stun);
  target.flash = 0.12;
  return target.hp <= 0;
}

export function dist2d(a, b) {
  const dx = a.x - b.x, dz = a.z - b.z;
  return Math.hypot(dx, dz);
}
