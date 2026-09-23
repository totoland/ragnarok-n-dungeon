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
//
// `knock` is a [x, y] pair, or 0 for a hit that carries no shove at all - a meteor, a Cold
// Bolt, the second half of a doubled blow. That 0 has to be checked rather than indexed:
// (0)[0] is undefined, undefined * dir * k is NaN, and the NaN goes into vx, into x on the
// very next step, and never comes back out. A monster at x = NaN is still alive, still
// counted by the wave and still drawn - drawn nowhere. That was the boss that disappeared
// the moment you hit it, and why it only ever happened to a hero carrying Orvane's gear:
// Auto Meteor and Double Attack are the only two things in the game that pass 0 here.
export function applyHit(target, dmg, knock, stun, dir, mass = 1) {
  // Armour: a share of the damage that never lands. It is a PERCENTAGE and not a flat
  // subtraction on purpose - a flat one is brutal against a level-1 hero swinging for 12
  // and worth nothing against one swinging for 89, and this game's ATK moves by 7x across
  // a run. Negative armour is a real value: the Orc Sword carries -0.5, which is the
  // drawback its crit and its dodge are paid for with.
  //
  // It is named `armor` and not `def` because both the player and every enemy already carry
  // a `def` - the resolved stat table they were built from.
  if (dmg > 0) dmg = Math.max(1, Math.round(dmg * (1 - (target.armor || 0))));
  target.hp = Math.max(0, target.hp - dmg);
  const k = 1 / Math.max(0.35, mass);
  if (knock) target.vx = knock[0] * dir * k;
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
  if (knock && knock[1] > 0) {
    target.vy = Math.max(target.vy, knock[1] * Math.min(1, k * 1.2));
    target.launched = true;
  } else if (knock && knock[1] < 0) {
    target.vy = knock[1];
  }
  target.hitstun = Math.max(target.hitstun, stun);
  target.flash = 0.12;
  return target.hp <= 0;
}

// Elemental advantage. A weapon names what it is strong against (`vsFire`, and whatever
// follows it); a monster names what it is (`element`). No monster has one yet - Toto is
// assigning them later - so today this returns 1 on every hit in the game. It is here now
// because a weapon that claims the bonus has to mean it the day the elements land, and a
// multiplier bolted on afterwards is a multiplier applied in three places out of four.
export function elementMult(p, target) {
  const el = target?.def?.element;
  if (!el) return 1;
  return p?.def?.mods?.[`vs${el[0].toUpperCase()}${el.slice(1)}`] ?? 1;
}

export function dist2d(a, b) {
  const dx = a.x - b.x, dz = a.z - b.z;
  return Math.hypot(dx, dz);
}
