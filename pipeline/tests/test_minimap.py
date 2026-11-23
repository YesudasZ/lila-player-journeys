"""The minimap helpers: downscaling, the black surround and the box of the artwork."""
import numpy as np
import pytest
from PIL import Image

from pipeline.minimap import artwork_box, black_surround, load_minimap

ARTWORK = (120, 90, 60)


def minimap(width, height, artwork, holes=()):
    """A black image with one rectangle of artwork (left, top, right, bottom in pixels) and black rectangles inside it."""
    pixels = np.zeros((height, width, 3), dtype=np.uint8)
    left, top, right, bottom = artwork
    pixels[top:bottom, left:right] = ARTWORK
    for hole_left, hole_top, hole_right, hole_bottom in holes:
        pixels[hole_top:hole_bottom, hole_left:hole_right] = 0
    return Image.fromarray(pixels)


def test_black_surround_is_the_black_connected_to_the_border_not_the_black_inside_the_artwork():
    surround = black_surround(minimap(40, 30, (10, 5, 30, 25), holes=[(15, 10, 20, 15)]))
    assert surround.shape == (30, 40)
    assert surround.sum() == 40 * 30 - 20 * 20
    assert not surround[12, 17] and surround[0, 0] and surround[29, 39] and not surround[5, 10]


def test_nearly_black_counts_as_black_and_anything_brighter_as_artwork():
    pixels = np.zeros((10, 10, 3), dtype=np.uint8)
    pixels[:, :5] = 13
    pixels[:, 5:] = (0, 14, 0)
    assert black_surround(Image.fromarray(pixels)).sum() == 50


def test_artwork_box_is_given_as_fractions_from_the_left_and_the_top():
    image = minimap(40, 30, (10, 5, 30, 25), holes=[(15, 10, 20, 15)])
    assert artwork_box(image) == {"left": 0.25, "top": 0.1667, "right": 0.75, "bottom": 0.8333}


def test_artwork_that_fills_the_image_gives_the_whole_image():
    assert artwork_box(Image.new("RGB", (40, 38), (30, 60, 90))) == {"left": 0.0, "top": 0.0, "right": 1.0, "bottom": 1.0}


def test_minimap_without_artwork_is_an_error():
    with pytest.raises(ValueError, match="black all over"):
        artwork_box(Image.new("RGB", (8, 8), (0, 0, 0)))


def test_minimap_is_downscaled_to_the_width_asked_for_and_keeps_its_aspect(tmp_path):
    minimap(60, 58, (0, 0, 60, 58)).save(tmp_path / "large.png")
    assert load_minimap(tmp_path / "large.png", 30).size == (30, 29)
    assert load_minimap(tmp_path / "large.png", 60).size == (60, 58)
    assert load_minimap(tmp_path / "large.png", 100).size == (60, 58)
