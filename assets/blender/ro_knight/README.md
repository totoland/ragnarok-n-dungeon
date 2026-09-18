# RO Knight

Stylized editable 3D model based on the supplied RO Knight illustration, created in Blender 5.2.2.

- `ro_knight.blend`: finished scene, separate from the hunter model.
- `ro_knight_preview.png`: portrait render.
- `ro_knight_grip_detail.png`: close-up of the adjusted sword grip.
- `ro_knight_before_grip.blend`: saved version before the grip adjustment.
- `ro_knight_before_depth.blend`: saved version before the depth pass below.

Includes silver and gold armor, raised heraldic crosses, individual scale-mail tiles, ruby belt emblem, spiky chestnut hair, amber eyes, a sculpted crimson cape, split surcoat, and a faceted sword with a crescent gold guard. The reference image is packed into the Blender file.

Body, armor, face and hair, cloth and cape, and sword have separate collections and parent handles. This is a static posed model, without an animation rig.

Build scripts run inside Blender in a shared namespace in this order: `build_knight.py`, `add_knight_details.py`, `finish_knight.py`, `polish_knight.py`. Update the source reference path in `finish_knight.py` if rebuilding on another machine.

Run `adjust_sword_grip.py` once after those scripts to reproduce the final bent forearm, four curled armored fingers, opposing thumb, and aligned hilt.

Run `raise_sword.py` once after the grip adjustment for the current upright sword pose. The hand rotates with the weapon and the forearm is repositioned to connect to the wrist. `ro_knight_sword_lowered.blend` preserves the preceding lowered-sword pose.

Run `thicken_knight.py` once after `raise_sword.py` for the current proportions. The model was
authored almost entirely from the front and read as a cardboard cutout in side view: flat legs,
no depth through the pelvis and neck, a wedge-shaped face. The pass scales world Y per body
part about the centreline, which preserves the front-to-back layering of the armour plates, and
translates the sword rather than scaling it so the blade stays a blade and the grip stays in
the hand. Depth-to-width went from 0.54 to 0.61.

It is **not idempotent** - running it twice doubles the effect. `ro_knight_before_depth.blend`
is the pre-pass state.

Changing depth moves two pivots that `tools/export_heroes.py` hardcodes for the knight,
`weapon` and `cape`. Both were updated to match; a stale pivot there swings the sword about
the wrong point and only shows up mid-attack.
