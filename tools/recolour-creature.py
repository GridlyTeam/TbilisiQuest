"""
Derive the creature's whole palette from one render.

The body is a single hue over soft matte shading, so rotating hue while keeping
each pixel's lightness and saturation gives a believable second colour -- and a
third, and an eighth. That is why the character cost one generation rather than
eight, and why a new outfit or a new pose only ever needs one.

Run it again when a new base render arrives:

    python tools/recolour-creature.py <render.png> <x0> <x1>

where x0/x1 are the pixel columns bounding the front view in a turnaround
sheet. It writes apps/mobile/assets/creature/creature-<colour>.png.
"""

import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

OUT = os.path.join("apps", "mobile", "assets", "creature")

# Matched to the eight colours offered at sign-up.
PALETTE = {
    "red": 0.98,
    "orange": 0.06,
    "amber": 0.11,
    "green": 0.33,
    "cyan": 0.52,
    "blue": 0.60,
    "violet": 0.75,
    "pink": 0.89,
}


def hue_shift(rgb: np.ndarray, hue: float) -> np.ndarray:
    """Repaint every pixel at `hue`, keeping its own value and saturation."""
    r, g, b = rgb[..., 0] / 255, rgb[..., 1] / 255, rgb[..., 2] / 255
    mx = np.max([r, g, b], axis=0)
    mn = np.min([r, g, b], axis=0)
    v = mx
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)

    i = int(hue * 6) % 6
    f = hue * 6 - int(hue * 6)
    p, q, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
    channels = [(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)][i]
    return (np.clip(np.dstack(channels), 0, 1) * 255).astype(np.uint8)


def main(src: str, x0: int, x1: int) -> None:
    os.makedirs(OUT, exist_ok=True)

    img = Image.open(src).convert("RGB")
    a = np.asarray(img).astype(np.float32) / 255.0
    mx = a.max(axis=2)
    mn = a.min(axis=2)
    # The character is the only saturated thing in a render on white, so
    # saturation alone separates it from the floor and its shadow.
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)

    sub, ss = a[:, x0:x1], sat[:, x0:x1]
    solid = ss > 0.18
    ys = np.nonzero(solid.any(axis=1))[0]
    sub, ss, solid = sub[ys.min():ys.max() + 1], ss[ys.min():ys.max() + 1], solid[ys.min():ys.max() + 1]

    # The eyes are pale and fall out of a saturation mask; filling the holes
    # inside the silhouette puts them back.
    filled = ndimage.binary_fill_holes(solid)
    alpha = np.clip((ss - 0.08) / 0.12, 0, 1)
    alpha = ndimage.gaussian_filter(np.maximum(alpha, filled.astype(np.float32)), 0.6)
    alpha8 = (alpha * 255).astype(np.uint8)

    rgb = (sub * 255).astype(np.uint8)
    eyes = (ss < 0.22) & filled

    Image.fromarray(np.dstack([rgb, alpha8]), "RGBA").save(
        os.path.join(OUT, "creature-green.png")
    )

    for name, hue in PALETTE.items():
        shifted = hue_shift(rgb, hue)
        # The eyes are the same on every creature; rotating their hue would
        # tint the whites.
        shifted[eyes] = rgb[eyes]
        Image.fromarray(np.dstack([shifted, alpha8]), "RGBA").save(
            os.path.join(OUT, f"creature-{name}.png")
        )

    print(f"wrote {len(PALETTE) + 1} files at {rgb.shape[1]}x{rgb.shape[0]}")


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]), int(sys.argv[3]))
