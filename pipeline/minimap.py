"""The minimap images: loading them at a usable size, and telling the map artwork from the black around it."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

BLACK_BELOW = 14  # a pixel counts as black when all three channels are below this


def load_minimap(path: Path, width: int) -> Image.Image:
    """The minimap as RGB, at most ``width`` pixels wide, aspect ratio kept."""
    with Image.open(path) as image:
        image.draft("RGB", (width * 2, width * 2))  # lets the JPEG decoder skip most of a 9000 px image
        rgb = image.convert("RGB")
    if rgb.width <= width:
        return rgb
    height = round(width * rgb.height / rgb.width)
    return rgb.resize((width, height), Image.Resampling.LANCZOS)


def black_surround(minimap: Image.Image) -> np.ndarray:
    """Mask of the black area around the map artwork: black pixels connected to the image border.

    Black linework inside the artwork (zone outlines, label strokes) is not part of it.
    """
    black = np.asarray(minimap).max(axis=2) < BLACK_BELOW
    mask = Image.fromarray(black.astype(np.uint8) * 255).copy()  # a copy, because floodfill needs a writable image
    width, height = mask.size
    pixels = mask.load()
    border = [(x, y) for x in range(width) for y in (0, height - 1)] + [(x, y) for y in range(height) for x in (0, width - 1)]
    for seed in border:
        if pixels[seed] == 255:
            ImageDraw.floodfill(mask, seed, 128)
    return np.asarray(mask) == 128


def artwork_box(minimap: Image.Image) -> dict[str, float]:
    """The box around everything that is not black surround, as fractions of the image.

    left and right are measured from the left edge, top and bottom from the
    top edge. The app fits this box to the window, not the whole image.
    """
    artwork = ~black_surround(minimap)
    columns, rows = np.flatnonzero(artwork.any(axis=0)), np.flatnonzero(artwork.any(axis=1))
    if len(columns) == 0:
        raise ValueError("the minimap is black all over: it has no artwork")
    height, width = artwork.shape
    box = {"left": columns[0] / width, "top": rows[0] / height, "right": (columns[-1] + 1) / width, "bottom": (rows[-1] + 1) / height}
    return {side: round(float(share), 4) for side, share in box.items()}
