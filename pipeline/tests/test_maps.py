"""world_to_uv and uv_to_pixel, checked against the dataset README's own worked example."""
import numpy as np
import pytest

from pipeline.maps import MAPS, uv_to_pixel, uv_to_world, world_to_uv


@pytest.mark.parametrize("map_id", sorted(MAPS))
def test_uv_to_world_undoes_world_to_uv(map_id):
    x, z = np.array([-301.45, 0.0, 256.6]), np.array([-355.55, 12.5, -194.0])
    back_x, back_z = uv_to_world(map_id, *world_to_uv(map_id, x, z))
    np.testing.assert_allclose(back_x, x)
    np.testing.assert_allclose(back_z, z)


def test_readme_worked_example():
    # README: AmbroseValley, x=-301.45, z=-355.55 -> u=0.0762, v=0.1305 -> pixel (78, 890) on a 1024 image
    u, v = world_to_uv("AmbroseValley", -301.45, -355.55)
    assert u == pytest.approx(0.0762, abs=5e-5)
    assert v == pytest.approx(0.1305, abs=5e-5)
    px, py = uv_to_pixel(u, v, 1024, 1024)
    assert (round(px), round(py)) == (78, 890)


@pytest.mark.parametrize("map_id", sorted(MAPS))
def test_origin_is_bottom_left_and_far_corner_is_top_right(map_id):
    cfg = MAPS[map_id]
    assert world_to_uv(map_id, cfg.origin_x, cfg.origin_z) == (0.0, 0.0)
    assert world_to_uv(map_id, cfg.origin_x + cfg.scale, cfg.origin_z + cfg.scale) == (1.0, 1.0)
    assert uv_to_pixel(0.0, 0.0, 800, 600) == (0.0, 600.0)
    assert uv_to_pixel(1.0, 1.0, 800, 600) == (800.0, 0.0)


def test_centre_of_a_non_square_minimap():
    # GrandRift's minimap is 2160 x 2158, so width and height must be applied separately
    cfg = MAPS["GrandRift"]
    u, v = world_to_uv("GrandRift", cfg.origin_x + cfg.scale / 2, cfg.origin_z + cfg.scale / 2)
    assert uv_to_pixel(u, v, 2160, 2158) == (1080.0, 1079.0)


def test_larger_z_is_higher_on_the_image():
    _, py_low_z = uv_to_pixel(*world_to_uv("Lockdown", 0.0, -100.0), 1000, 1000)
    _, py_high_z = uv_to_pixel(*world_to_uv("Lockdown", 0.0, 100.0), 1000, 1000)
    assert py_high_z < py_low_z


def test_points_off_the_image_fall_outside_zero_one():
    u, v = world_to_uv("GrandRift", -300.0, 300.0)
    assert u < 0.0
    assert v > 1.0


def test_arrays_are_projected_elementwise():
    x = np.array([-370.0, 80.0, 530.0], dtype=np.float32)
    z = np.array([-473.0, -23.0, 427.0], dtype=np.float32)
    u, v = world_to_uv("AmbroseValley", x, z)
    np.testing.assert_allclose(u, [0.0, 0.5, 1.0])
    np.testing.assert_allclose(v, [0.0, 0.5, 1.0])


def test_unknown_map_is_an_error():
    with pytest.raises(KeyError):
        world_to_uv("Atlantis", 0.0, 0.0)
