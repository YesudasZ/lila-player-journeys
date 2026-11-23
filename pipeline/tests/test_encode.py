"""Positions survive the integer encoding used in the app's data files."""
import numpy as np
import pytest

from pipeline.encode import UV_STEPS, decode_elevation, decode_uv, encode_elevation, encode_uv
from pipeline.maps import MAPS, uv_to_world, world_to_uv


@pytest.mark.parametrize("map_id", sorted(MAPS))
def test_world_position_survives_encoding_to_a_fraction_of_a_unit(map_id):
    cfg = MAPS[map_id]
    rng = np.random.default_rng(7)
    x = cfg.origin_x + rng.random(5_000) * cfg.scale
    z = cfg.origin_z + rng.random(5_000) * cfg.scale
    u, v = world_to_uv(map_id, x, z)
    back_x, back_z = uv_to_world(map_id, decode_uv(encode_uv(u)), decode_uv(encode_uv(v)))
    assert np.hypot(back_x - x, back_z - z).max() < 0.02


def test_corners_map_to_the_ends_of_the_grid():
    assert encode_uv(np.array([0.0, 1.0])).tolist() == [0, UV_STEPS]


def test_position_off_the_image_is_an_error():
    with pytest.raises(ValueError, match="off the minimap"):
        encode_uv(np.array([0.5, 1.01]))


def test_elevation_keeps_a_tenth_of_a_unit():
    y = np.array([8.1387, 100.0, 162.6662], dtype=np.float32)
    assert encode_elevation(y).tolist() == [81, 1000, 1627]
    assert np.abs(decode_elevation(encode_elevation(y)) - y).max() <= 0.05
