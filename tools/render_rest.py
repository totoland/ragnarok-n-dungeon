"""Per-type rest offsets, mirroring REST in src/render/monsters.js.

Kept next to the preview tool rather than parsed out of the JS: it is two numbers, and a
preview that silently diverged from the game's rest pose would be worse than no preview.
"""
REST = {
    "baphomet": {"tx": -0.24, "hx": 0.16},
    "baphometling": {"tx": -0.24, "hx": 0.16},
}
