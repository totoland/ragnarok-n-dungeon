# Hunter & Falcon

Stylized 3D interpretation of the supplied hunter sprite, built in Blender 5.2.2.

- `hunter_falcon.blend` — finished editable Blender scene with materials, lighting, portrait camera, and packed source reference.
- `hunter_falcon_preview.png` — rendered preview.

The character, clothing, hair and face, bow and quiver, and falcon are grouped separately. The model is a static pose; an animation rig and animation-ready retopology are not included. The original startup scene is preserved as `Scene`; the model opens in `Hunter & Falcon | Studio`.

To rebuild, execute `build_model.py`, `add_details.py`, and `finish_model.py` in that order in a shared Python namespace inside Blender. The original reference path in `add_details.py` can be changed if rebuilding on a different machine. The finished blend already contains the packed reference.
