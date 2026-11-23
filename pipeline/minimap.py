"""Loading the minimap images, which are far larger than anything that is drawn."""
from __future__ import annotations

from pathlib import Path

from PIL import Image


def load_minimap(path: Path, width: int) -> Image.Image:
    """The minimap as RGB, at most ``width`` pixels wide, aspect ratio kept."""
    with Image.open(path) as image:
        image.draft("RGB", (width * 2, width * 2))  # lets the JPEG decoder skip most of a 9000 px image
        rgb = image.convert("RGB")
    if rgb.width <= width:
        return rgb
    height = round(width * rgb.height / rgb.width)
    return rgb.resize((width, height), Image.Resampling.LANCZOS)
