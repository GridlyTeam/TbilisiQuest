"""
Build the creature's assets from renders.

    python tools/build-creature.py <bare.png> [<layer-name> <worn.png> ...]

Takes a render of the bare creature on white and writes the eight colour
variants; takes renders of the same creature wearing something and writes each
garment as a transparent layer to hang over them.

Three ideas hold the whole thing up.

**One render makes eight colours.** The body is a single hue over soft matte
shading, so rotating hue while keeping each pixel's lightness and saturation
gives a believable second colour, and a third. The eyes are held out of that
rotation, which is why their whites stay cream on a blue creature.

**One render makes an outfit for all eight.** A garment is whatever differs
between the dressed render and the bare one, so it can be lifted out by
subtraction -- and since it carries its own colours it never needs recolouring.
That is the difference between one render per outfit and eight.

**Everything shares one canvas.** Body and garment are written at the same size
with the same origin, so the app stacks them with no offsets to get wrong. The
canvas is the union of every silhouette, because a hoodie is wider than the
body inside it.
"""

import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage
from skimage.morphology import convex_hull_image

OUT = os.path.join("apps", "mobile", "assets", "creature")

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


def load(path: str):
    """The render, and a mask of everything on it that is not the backdrop."""
    rgb = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    lum = rgb.mean(axis=2)
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)

    # Coloured, or darker than the white it was shot against. The eyes are pale
    # and nearly grey, so neither test alone finds them; filling the holes the
    # silhouette encloses does.
    solid = (sat > 0.10) | (lum < 225)
    solid = ndimage.binary_opening(solid, iterations=2)
    # Both, because the difference between them is the eyes: a region the
    # silhouette encloses but which has no colour of its own.
    return rgb, solid, ndimage.binary_fill_holes(solid)


def find_eyes(rgb: np.ndarray, solid: np.ndarray) -> np.ndarray:
    """
    The two eyes, so the hue rotation can be held off them.

    They are the only part of the creature without a colour of its own: the
    body sits around 0.64 saturation and the eyes below 0.35, whites and
    pupils alike. Thresholding there and keeping the two largest regions finds
    them whatever colour the render came in, where looking for enclosed holes
    only worked while the eyes happened to be pale enough to fall outside the
    silhouette.

    Both parts matter. Rotate the whites and the eye turns the body's colour;
    rotate the pupils and it loses its focus.
    """
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)

    candidates = ndimage.binary_opening(solid & (sat < 0.35), iterations=2)
    labels, count = ndimage.label(candidates)
    if count == 0:
        return np.zeros_like(solid)

    sizes = ndimage.sum(candidates, labels, range(1, count + 1))
    biggest = np.argsort(sizes)[::-1][:2]

    eyes = np.zeros_like(solid)
    for i in biggest:
        if sizes[i] > 300:
            # The convex hull of each white, not the white itself. The iris is
            # dark olive and saturated, so it fails the threshold that finds
            # the eye around it -- and it reaches the edge of the white rather
            # than sitting inside it, so filling holes does not recover it
            # either. An eye is convex; its hull is the whole eye.
            eyes |= convex_hull_image(labels == (i + 1))

    # Pulled back inside the white. The hull reaches a pixel or two past the
    # eye, and holding those out of the rotation leaves a ring of the original
    # green round each eye once the body has changed colour.
    return ndimage.binary_erosion(eyes, iterations=3)


def alpha_from(solid: np.ndarray) -> np.ndarray:
    """A soft edge, so the silhouette does not come out jagged."""
    return ndimage.gaussian_filter(solid.astype(np.float32), 0.7)


def unfringe(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """
    Push body colour outwards into the soft edge.

    Anything not fully opaque is part backdrop, and keeping its colour is what
    leaves a white halo around a character cut from a pale render. Each such
    pixel takes the colour of the nearest solid one instead.
    """
    core = alpha > 0.92
    if not core.any():
        return rgb
    _, (iy, ix) = ndimage.distance_transform_edt(~core, return_indices=True)
    return rgb[iy, ix]


def tame_rim(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """
    Pull down the render's rim light and leave a contour in its place.

    These renders are lit with a bright edge round the silhouette. Rotating its
    hue keeps that brightness, so every colour comes out haloed just inside its
    outline -- the thing that reads as a cheap cut-out. The band nearest the
    edge has its highlights compressed towards the body's own mid-tone and then
    darkens, so the character ends in a defined edge the way a drawn asset does.
    """
    solid = alpha > 0.5
    depth = ndimage.distance_transform_edt(solid)
    band = 6.0
    t = np.clip(depth / band, 0, 1)[..., None]

    deep = solid & (depth > band)
    mid = np.median(rgb[deep], axis=0) if deep.any() else rgb.mean(axis=(0, 1))

    out = rgb * t + (rgb * 0.55 + mid * 0.45) * (1 - t)
    out *= 0.80 + 0.20 * t
    return np.clip(out, 0, 255)


def hue_of(rgb: np.ndarray) -> np.ndarray:
    """Hue in turns, 0 to 1."""
    r, g, b = rgb[..., 0] / 255, rgb[..., 1] / 255, rgb[..., 2] / 255
    mx = np.max([r, g, b], axis=0)
    mn = np.min([r, g, b], axis=0)
    d = np.maximum(mx - mn, 1e-6)
    h = np.where(
        mx == r, ((g - b) / d) % 6,
        np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4),
    )
    return (h / 6) % 1.0


def drop_body_pixels(
    worn: np.ndarray, bare: np.ndarray, mask: np.ndarray
) -> np.ndarray:
    """
    Take the body back out of a layer that caught some of it.

    Subtracting one render from another finds more than the garment: it finds
    the shadow the garment casts on the body and the body reflected in a lens.
    Those pixels are the body, not the thing being worn, so keeping them
    dresses every creature in a patch of the green one it was rendered on.

    Two earlier tests were wrong in instructive ways. Matching the body's hue
    and recolouring those pixels turned a green smudge into a pale one, which
    is the white outline it was meant to fix. Matching the hue and dropping
    them shattered the frame, because black over green reads near that hue.
    Asking whether a pixel was the bare one scaled down missed the worst of
    them, because a shadow does not dim every channel equally -- under these
    glasses blue falls away twice as fast as red.

    What separates them here is plain: leftover body is bright and keeps the
    body's chromaticity, while the garment itself is dark. Chromaticity because
    it ignores how much light there is, and a brightness floor because black
    has no reliable chromaticity to compare.
    """
    total_w = worn.sum(axis=2, keepdims=True) + 1e-6
    total_b = bare.sum(axis=2, keepdims=True) + 1e-6
    chroma_shift = np.linalg.norm(
        worn[..., :2] / total_w - bare[..., :2] / total_b, axis=2
    )

    lit = worn.mean(axis=2) > 48
    return mask & ~(lit & (chroma_shift < 0.075))


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


def save(rgb: np.ndarray, alpha: np.ndarray, name: str) -> None:
    img = np.dstack([np.clip(rgb, 0, 255).astype(np.uint8), (np.clip(alpha, 0, 1) * 255).astype(np.uint8)])
    Image.fromarray(img, "RGBA").save(os.path.join(OUT, name))


def main() -> None:
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(1)

    os.makedirs(OUT, exist_ok=True)

    naked_path = args[0]
    outfits = list(zip(args[1::2], args[2::2]))

    base_rgb, base_raw, base_solid = load(naked_path)
    masks = [base_solid]
    dressed = []
    for name, path in outfits:
        rgb, raw, solid = load(path)
        dressed.append((name, rgb, solid))
        masks.append(solid)

    # One canvas for everything, so the app can stack layers with no offsets.
    union = np.zeros_like(base_solid)
    for m in masks:
        union |= m
    ys, xs = np.nonzero(union)
    pad = 4
    y0, y1 = max(ys.min() - pad, 0), min(ys.max() + 1 + pad, union.shape[0])
    x0, x1 = max(xs.min() - pad, 0), min(xs.max() + 1 + pad, union.shape[1])

    def crop(arr):
        return arr[y0:y1, x0:x1]

    base_rgb, base_raw, base_solid = crop(base_rgb), crop(base_raw), crop(base_solid)
    base_alpha = alpha_from(base_solid)

    eyes = find_eyes(base_rgb, base_solid)

    body = tame_rim(unfringe(base_rgb, base_alpha), base_alpha)


    save(body, base_alpha, "creature-green.png")
    for name, hue in PALETTE.items():
        shifted = hue_shift(body, hue).astype(np.float32)
        shifted[eyes] = body[eyes]
        save(shifted, base_alpha, f"creature-{name}.png")

    for name, rgb, solid in dressed:
        rgb, solid = crop(rgb), crop(solid)
        # The garment is what changed. Comparing against the bare render finds
        # it without anyone having to mask anything by hand.
        diff = np.linalg.norm(rgb - base_rgb, axis=2)
        garment = solid & (diff > 45)
        garment = ndimage.binary_closing(garment, iterations=3)
        garment = ndimage.binary_fill_holes(garment)
        garment = ndimage.binary_opening(garment, iterations=2)
        # Pulled back off the body's own edge. Without this the garment layer
        # carries a ring of the body it was rendered on, which shows as the
        # original green fringing every recoloured creature.
        garment = ndimage.binary_erosion(garment, iterations=2)

        garment = drop_body_pixels(rgb, base_rgb, garment)
        garment = ndimage.binary_closing(garment, iterations=2)
        garment = ndimage.binary_opening(garment, iterations=2)

        g_alpha = alpha_from(garment)
        g_rgb = unfringe(rgb, g_alpha)
        save(g_rgb, g_alpha, f"layer-{name}.png")
        print(f"  outfit {name}: {int(garment.sum())}px")

    print(f"canvas {x1 - x0} x {y1 - y0}, {len(PALETTE) + 1} bodies, {len(outfits)} outfits")


if __name__ == "__main__":
    main()
