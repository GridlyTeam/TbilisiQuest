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

Two things here exist because the first version of this script got them wrong
and it showed on every creature in the app:

  The eye mask was "any pale pixel inside the silhouette", which is not the
  eyes -- it is the eyes plus every rim-light highlight on the body. Those
  highlights kept their original near-white colour through the hue rotation
  and read as pale streaks down a blue creature. The eyes are found properly
  now, as the holes binary_fill_holes closes: a region enclosed by body is an
  eye, a highlight on the body's edge is not.

  And cutting the character off a light background leaves a rim of pixels that
  are part background, which survives as a white halo once the alpha is
  applied. Every pixel's colour is now taken from the nearest fully opaque
  pixel before the alpha goes on, so the semi-transparent edge carries body
  colour rather than a blend with whatever it was photographed against.
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


def unfringe(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """
    Push body colour outwards into the soft edge.

    Anything not fully opaque is part background, and keeping its colour is
    what produces a white halo on a character cut from a pale render. Each
    such pixel takes the colour of the nearest solid one instead.
    """
    core = alpha > 0.92
    if not core.any():
        return rgb
    _, (iy, ix) = ndimage.distance_transform_edt(~core, return_indices=True)
    return rgb[iy, ix]


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
    top, bottom = ys.min(), ys.max() + 1
    sub, ss, solid = sub[top:bottom], ss[top:bottom], solid[top:bottom]

    filled = ndimage.binary_fill_holes(solid)

    # The eyes are exactly the holes: regions with no colour of their own that
    # the body encloses. A highlight on the body is not enclosed, so it stays
    # part of the body and gets recoloured with it.
    eyes = ndimage.binary_dilation(filled & ~solid, iterations=1)

    alpha = np.clip((ss - 0.08) / 0.12, 0, 1)
    alpha = ndimage.gaussian_filter(np.maximum(alpha, filled.astype(np.float32)), 0.6)
    alpha8 = (alpha * 255).astype(np.uint8)

    rgb = unfringe((sub * 255).astype(np.uint8), alpha)

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
