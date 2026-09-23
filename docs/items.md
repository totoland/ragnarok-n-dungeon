# Items

_Generated from the game data by `tools/items_doc.mjs` — do not edit by hand._
_Run `npm run docs` after changing `src/sim/data/items.js`, a monster's `drops`, a town's `loot`, or re-exporting a model._

Slots: **Weapon** (`weapon`) · **Cape** (`cape`) · **Hat** (`hat`) · **Accessory** (`accessory`). One of each is worn at a time.

## Weapons

Every town boss pays one per class, always, and a duplicate refines the held one instead of stacking.
ATK is flat and on one curve across the towns.

| Item | Town | Class | ATK | Effect | Model | From |
|---|---|---|---|---|---|---|
| **Katana**<br>`katana` | Prontera | knight | 6 | +6 ATK, attack 10% faster, 30% crit rate | yes | Baphomet (boss, knight) · always |
| **Gakkung Bow**<br>`gakkung` | Prontera | hunter | 6 | +6 ATK, shoot 10% faster, 30% crit rate | no — shows the hero’s own weapon | Baphomet (boss, hunter) · always |
| **Tsurugi**<br>`tsurugi` | Morroc | knight | 16 | +16 ATK, 15% crit rate | no — shows the hero’s own weapon | Sandman (boss, knight) · always |
| **Arbalest**<br>`arbalest` | Morroc | hunter | 16 | +16 ATK, 15% crit rate | no — shows the hero’s own weapon | Sandman (boss, hunter) · always |
| **Crescentfang**<br>`crescentfang` | Phaelan | knight | 30 | +30 ATK, crits hit 30% harder | no — shows the hero’s own weapon | Moonraya (boss, knight) · always |
| **Moonstring**<br>`moonstring` | Phaelan | hunter | 30 | +30 ATK, crits hit 30% harder | no — shows the hero’s own weapon | Moonraya (boss, hunter) · always |
| **Under Water Sword [1]**<br>`underWaterSword` | Bairune | knight | 45 | +45 ATK, attack 15% faster, +50% damage to Fire monsters. 5% chance on hit: ice falls around you for 10% of ATK as magic, and what it hits may freeze | yes | Shellora · 4% |
| **Twinshot**<br>`twinshot` | Orvane | hunter | 50 | +50 ATK, 15% chance on hit: the shot lands twice | no — shows the hero’s own weapon | Dark Sword (boss, hunter) · always |
| **Meteor Edge**<br>`meteorEdge` | Orvane | knight | 55 | +55 ATK, 10% chance on hit: a meteor falls for 10% of ATK as magic | no — shows the hero’s own weapon | Dark Sword (boss, knight) · always |
| **Tidecleaver**<br>`tidecleaver` | Bairune | knight | 95 | +95 ATK, 18% chance on hit: Undertow drags them back to you | no — shows the hero’s own weapon | Nerakos (boss, knight) · always |
| **Coralbow**<br>`coralbow` | Bairune | hunter | 95 | +95 ATK, 18% chance on hit: Undertow drags them back to you | no — shows the hero’s own weapon | Nerakos (boss, hunter) · always |

## Hats

| Item | Town | Effect | Model | From |
|---|---|---|---|---|
| **Robin Hood Hat**<br>`robinHat` | Phaelan | +10 ATK | yes | Skelbow · 4% |
| **Crab Claw Hat**<br>`clawHat` | Bairune | +20 ATK | no — nothing appears | Craboon · 5% |
| **Coral Crown**<br>`coralCrown` | Bairune | +8 ATK, +5% crit rate | no — nothing appears | Hydrella · 5% |
| **Jelly Cap**<br>`jellyCap` | Bairune | +8% SP, +4% dodge | no — nothing appears | Jellune · 5% |
| **Tidefin Helm**<br>`tidefin` | Bairune | +16 ATK, crits hit 12% harder | no — nothing appears | Marinox · 5% |
| **Pearl Diadem**<br>`pearlDiadem` | Bairune | +10 ATK, +6% HP | no — nothing appears | Shellora · 5% |

## Capes

| Item | Town | Effect | Model | From |
|---|---|---|---|---|
| **Moonveil**<br>`moonveil` | Phaelan | +6% move speed, +5% dodge | no — the knight keeps his own cape, the hunter has no cape node at all | Sorya · 5% |
| **Everwave Mantle**<br>`everwave` | Bairune | +8% move speed, +6% dodge, +5% HP | no — the knight keeps his own cape, the hunter has no cape node at all | Marinox · 5% |

## Accessories

No model, and no refine. Every drop is rolled on the run's own rng: a main attribute fixed by the kind,
at a value from its range, plus one secondary from the pool the kind allows.

**An accessory that names no `secondary` draws from the whole pool** (`rollItem`: `def.secondary || ATTR_IDS`),
which means a common Ring can roll Undertow, Auto Meteor, Auto Cold Bolt, Double Attack or SP Drain as its
second attribute, at about 7.1% each - and can roll `atkHi` (+5 - +15 ATK), which is five times its own main.
Only Orvane's three charms narrow it.

| Item | Town | Main | Secondary pool | Rarity | From |
|---|---|---|---|---|---|
| **Ring**<br>`ring` | Prontera, Morroc, Phaelan, Bairune | ATK +1 – +3 | the whole pool — any of 14 | common | Poring · 3%<br>PecoPeco · 3%<br>Bonku · 3%<br>Craboon · 3% |
| **Clip**<br>`clip` | Prontera, Morroc, Phaelan, Orvane, Bairune | SP 1% – 3% | the whole pool — any of 14 | common | Lunatic · 2.5%<br>Baby Desert Wolf · 2.5%<br>Famiru · 2.5%<br>Flittern · 2.5%<br>Jellune · 2.5% |
| **Bell**<br>`bell` | Prontera, Morroc, Phaelan, Orvane | ASPD 5% – 10% | the whole pool — any of 14 | uncommon | Skel Soldier · 2%<br>Andre · 2%<br>Munari · 2%<br>Stringen · 2% |
| **Brooch**<br>`brooch` | Prontera, Morroc, Phaelan, Orvane, Bairune | Crit rate 3% – 6% | the whole pool — any of 14 | uncommon | Skel Archer · 1%<br>Sand Wraith · 1%<br>Skelbow · 1%<br>Wispra · 1.5%<br>Hushling · 1.2%<br>Grinlit · 1.2%<br>Hydrella · 1.2% |
| **Amulet**<br>`amulet` | Morroc, Phaelan, Orvane, Bairune | HP 1% – 3% | the whole pool — any of 14 | rare | Golem · 0.5%<br>Sorya · 0.8%<br>Velmara · 1%<br>Nyxmare · 1.2%<br>Shellora · 1.2%<br>Marinox · 1.2% |
| **Rune Sigil**<br>`runeSigil` | Orvane | Auto Meteor 1% – 3% | ATK, SP Drain | rare | Grinlit · 3.5% |
| **Echo Band**<br>`echoBand` | Orvane | Double Attack 1% – 3% | ATK, SP Drain | rare | Hushling · 3.5% |
| **Mana Clasp**<br>`manaClasp` | Orvane | SP Drain 1% – 3% | ATK, Auto Meteor | uncommon | Velmara · 4% |

### The attribute pool

| Attribute | Key in `mods` | Range | How it combines | Can be rolled by |
|---|---|---|---|---|
| ATK<br>`atk` | `atkAdd` | +1 – +3 | sums across everything worn | Ring (main), Clip, Bell, Brooch, Amulet |
| Crit rate<br>`crit` | `critAdd` | 3% – 6% | sums across everything worn | Brooch (main), Ring, Clip, Bell, Amulet |
| Crit damage<br>`critDmg` | `critDmgAdd` | 5% – 10% | sums across everything worn | Ring, Clip, Bell, Brooch, Amulet |
| Dodge<br>`dodge` | `dodgeAdd` | 3% – 5% | sums across everything worn | Ring, Clip, Bell, Brooch, Amulet |
| MATK<br>`matk` | `matkAdd` | +1 – +3 | sums across everything worn | Ring, Clip, Bell, Brooch, Amulet |
| HP<br>`hp` | `hp` | 1% – 3% | multiplies | Amulet (main), Ring, Clip, Bell, Brooch |
| SP<br>`sp` | `mp` | 1% – 3% | multiplies | Clip (main), Ring, Bell, Brooch, Amulet |
| ASPD<br>`aspd` | `atkSpeed` | 5% – 10% | multiplies | Bell (main), Ring, Clip, Brooch, Amulet |
| Auto Meteor<br>`meteor` | `meteorAdd` | 1% – 3% | sums across everything worn | Rune Sigil (main), Ring, Clip, Bell, Brooch, Amulet, Mana Clasp |
| Double Attack<br>`twin` | `doubleAdd` | 1% – 3% | sums across everything worn | Echo Band (main), Ring, Clip, Bell, Brooch, Amulet |
| SP Drain<br>`drain` | `spDrainAdd` | 1% – 3% | sums across everything worn | Mana Clasp (main), Ring, Clip, Bell, Brooch, Amulet, Rune Sigil, Echo Band |
| Undertow<br>`pull` | `pullAdd` | 1% – 3% | sums across everything worn | Ring, Clip, Bell, Brooch, Amulet |
| ATK<br>`atkHi` | `atkAdd` | +5 – +15 | sums across everything worn | Ring, Clip, Bell, Brooch, Amulet, Rune Sigil, Echo Band, Mana Clasp |
| Auto Cold Bolt<br>`bolt` | `boltAdd` | 1% – 3% | sums across everything worn | Ring, Clip, Bell, Brooch, Amulet |
| Freeze<br>`freeze` | `freezeAdd` | 1% – 3% | sums across everything worn | Ring, Clip, Bell, Brooch, Amulet |

## Refine

A duplicate of something already held refines it by +1, up to **+10**, where further copies are lost.
A weapon gains **3% of its own ATK per level**; at **+5** and above it also gains
a one-off **×1.05 crit damage** (it does not grow past that), and the blade starts to glow.
Anything worn that is not a weapon gains **+2% HP per level** instead.

| Weapon | +0 | +5 | +10 |
|---|---|---|---|
| Katana | 6 | 6.9 | 7.8 |
| Gakkung Bow | 6 | 6.9 | 7.8 |
| Tsurugi | 16 | 18.4 | 20.8 |
| Arbalest | 16 | 18.4 | 20.8 |
| Crescentfang | 30 | 34.5 | 39 |
| Moonstring | 30 | 34.5 | 39 |
| Under Water Sword | 45 | 51.75 | 58.5 |
| Twinshot | 50 | 57.5 | 65 |
| Meteor Edge | 55 | 63.25 | 71.5 |
| Tidecleaver | 95 | 109.25 | 123.5 |
| Coralbow | 95 | 109.25 | 123.5 |

## What the rates actually do

These are the `*Add` attributes above, summed across the weapon and everything worn, then rolled once per
landed hit off the run's rng (`sim/game.js` `rollGearProcs`) — so a proc is as reproducible as a crit.
Each is capped at 50%, and none of them can roll off a hit that one of them caused.

| Rate | What lands | Notes |
|---|---|---|
| Auto Meteor | A meteor falls on the spot 0.55 s later, for 10% of ATK as magic | Hits everything within 1.6 × 1.1 units of where it lands. Never crits, never knocks. |
| Auto Cold Bolt | A shaft of ice, 0.32 s later, for 10% of ATK as magic | The same spell through a narrower hole: 0.9 × 0.8 units. Never crits, never knocks. |
| Double Attack | The same blow lands a second time | Same damage roll, no knockback of its own, and nothing if the first one killed. |
| SP Drain | 1% of max SP back | On the hit, not the kill. |
| Undertow | A reversed knockback of 6 ÷ mass, plus 0.2 s of stun | No damage. A boss (mass ≥ 3) keeps its hyper armour, so it takes the shove and not the stun. |

Undertow's shove decays against the enemy step's own friction, so how far something is actually dragged
depends entirely on its mass:

| Target | Mass | Dragged |
|---|---|---|
| Flittern<br>`flittern` | 0.4 | 2.14 units |
| Famiru<br>`famiru` | 0.45 | 1.90 units |
| Lunatic<br>`lunatic` | 0.5 | 1.71 units |
| Poring<br>`poring` | 0.6 | 1.42 units |
| Andre<br>`ant` | 0.7 | 1.22 units |
| Grinlit<br>`grinlit` | 0.8 | 1.06 units |
| Baphometling<br>`baphometling` | 0.85 | 1.00 units |
| Skel Archer<br>`skelArcher` | 0.9 | 0.95 units |
| Skel Soldier<br>`skeleton` | 1 | 0.85 units |
| Sand Wraith<br>`sandWraith` | 1.2 | 0.71 units |
| Bonku<br>`bonku` | 1.3 | 0.65 units |
| Sorya<br>`sorya` | 1.4 | 0.61 units |
| Craboon<br>`craboon` | 1.6 | 0.53 units |
| Marinox<br>`marinox` | 2 | 0.42 units |
| Nyxmare<br>`nyxmare` | 2.4 | 0.35 units |
| Golem<br>`golem` | 2.6 | 0.32 units |
| Orc Lord (boss)<br>`orcLord` | 4 | 0.21 units |
| Baphomet (boss)<br>`baphomet` | 4.5 | 0.18 units |
| Phreeoni (boss)<br>`phreeoni` | 5 | 0.16 units |
| Moonraya (boss)<br>`moonraya` | 5.2 | 0.16 units |
| Dark Sword (boss)<br>`darkSword` | 5.5 | 0.15 units |
| Nerakos (boss)<br>`nerakos` | 5.8 | 0.14 units |
| Sandman (boss)<br>`sandman` | 6 | 0.14 units |

## Who drops what

### Prontera — Culvert of Prontera

Boss: **Baphomet**, who pays Katana (knight) / Gakkung Bow (hunter) every time.

| Monster | Drops | Slot | Chance |
|---|---|---|---|
| Poring | Ring (`ring`) | Accessory | 3% |
| Lunatic | Clip (`clip`) | Accessory | 2.5% |
| Skel Soldier | Bell (`bell`) | Accessory | 2% |
| Skel Archer | Brooch (`brooch`) | Accessory | 1% |

### Morroc — Sograt Desert

Boss: **Sandman**, who pays Tsurugi (knight) / Arbalest (hunter) every time.

| Monster | Drops | Slot | Chance |
|---|---|---|---|
| PecoPeco | Ring (`ring`) | Accessory | 3% |
| Andre | Bell (`bell`) | Accessory | 2% |
| Baby Desert Wolf | Clip (`clip`) | Accessory | 2.5% |
| Sand Wraith | Brooch (`brooch`) | Accessory | 1% |
| Golem | Amulet (`amulet`) | Accessory | 0.5% |

### Phaelan — Phaelan Woods

Boss: **Moonraya**, who pays Crescentfang (knight) / Moonstring (hunter) every time.

| Monster | Drops | Slot | Chance |
|---|---|---|---|
| Famiru | Clip (`clip`) | Accessory | 2.5% |
| Munari | Bell (`bell`) | Accessory | 2% |
| Bonku | Ring (`ring`) | Accessory | 3% |
| Skelbow | Robin Hood Hat (`robinHat`) | Hat | 4% |
| Skelbow | Brooch (`brooch`) | Accessory | 1% |
| Wispra | Brooch (`brooch`) | Accessory | 1.5% |
| Sorya | Moonveil (`moonveil`) | Cape | 5% |
| Sorya | Amulet (`amulet`) | Accessory | 0.8% |

### Orvane — Orvane, the Hollow Tower

Boss: **Dark Sword**, who pays Meteor Edge (knight) / Twinshot (hunter) every time.

| Monster | Drops | Slot | Chance |
|---|---|---|---|
| Flittern | Clip (`clip`) | Accessory | 2.5% |
| Stringen | Bell (`bell`) | Accessory | 2% |
| Hushling | Echo Band (`echoBand`) | Accessory | 3.5% |
| Hushling | Brooch (`brooch`) | Accessory | 1.2% |
| Grinlit | Rune Sigil (`runeSigil`) | Accessory | 3.5% |
| Grinlit | Brooch (`brooch`) | Accessory | 1.2% |
| Velmara | Mana Clasp (`manaClasp`) | Accessory | 4% |
| Velmara | Amulet (`amulet`) | Accessory | 1% |
| Nyxmare | Amulet (`amulet`) | Accessory | 1.2% |

### Bairune — Bairune, the Drowned Temple

Boss: **Nerakos**, who pays Tidecleaver (knight) / Coralbow (hunter) every time.

| Monster | Drops | Slot | Chance |
|---|---|---|---|
| Craboon | Crab Claw Hat (`clawHat`) | Hat | 5% |
| Craboon | Ring (`ring`) | Accessory | 3% |
| Jellune | Jelly Cap (`jellyCap`) | Hat | 5% |
| Jellune | Clip (`clip`) | Accessory | 2.5% |
| Hydrella | Coral Crown (`coralCrown`) | Hat | 5% |
| Hydrella | Brooch (`brooch`) | Accessory | 1.2% |
| Shellora | Pearl Diadem (`pearlDiadem`) | Hat | 5% |
| Shellora | Under Water Sword (`underWaterSword`) | Weapon | 4% |
| Shellora | Amulet (`amulet`) | Accessory | 1.2% |
| Marinox | Everwave Mantle (`everwave`) | Cape | 5% |
| Marinox | Tidefin Helm (`tidefin`) | Hat | 5% |
| Marinox | Amulet (`amulet`) | Accessory | 1.2% |

## Gaps

**16 of 19 worn things have no model of their own** (accessories are excluded — they are meant to have none):

- Gakkung Bow (`gakkung`, weapon) — shows the hero’s own weapon
- Tsurugi (`tsurugi`, weapon) — shows the hero’s own weapon
- Arbalest (`arbalest`, weapon) — shows the hero’s own weapon
- Crescentfang (`crescentfang`, weapon) — shows the hero’s own weapon
- Moonstring (`moonstring`, weapon) — shows the hero’s own weapon
- Moonveil (`moonveil`, cape) — the knight keeps his own cape, the hunter has no cape node at all
- Meteor Edge (`meteorEdge`, weapon) — shows the hero’s own weapon
- Twinshot (`twinshot`, weapon) — shows the hero’s own weapon
- Crab Claw Hat (`clawHat`, hat) — nothing appears
- Coral Crown (`coralCrown`, hat) — nothing appears
- Jelly Cap (`jellyCap`, hat) — nothing appears
- Tidefin Helm (`tidefin`, hat) — nothing appears
- Pearl Diadem (`pearlDiadem`, hat) — nothing appears
- Everwave Mantle (`everwave`, cape) — the knight keeps his own cape, the hunter has no cape node at all
- Tidecleaver (`tidecleaver`, weapon) — shows the hero’s own weapon
- Coralbow (`coralbow`, weapon) — shows the hero’s own weapon

**Every attribute in the pool is reachable.** The five common accessories name no `secondary`, so each of them can roll any of the others.

**Attributes no accessory carries as its _main_:** Crit damage (`critDmg`), Dodge (`dodge`), MATK (`matk`), Undertow (`pull`), ATK (`atkHi`), Auto Cold Bolt (`bolt`), Freeze (`freeze`) — reachable only as a second roll, so never at a chosen value.

