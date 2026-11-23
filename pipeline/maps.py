"""Per-map minimap configuration and the single world -> minimap projection.

Source: the dataset README, "Map Configuration" and "World-to-Minimap
Coordinate Conversion". These constants live here and nowhere else; the web
app receives them through the generated manifest.

The projection is done in two steps so that it never depends on image size:

1. world (x, z) -> UV in [0, 1]. u grows to the right, v grows upward.
   The y column is elevation and is not used for 2D plotting.
2. UV -> pixels of an image of any size. Image rows grow downward, so v is
   flipped here.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import TypeVar

import numpy as np

Coord = TypeVar("Coord", float, np.ndarray)


@dataclass(frozen=True)
class MapConfig:
    map_id: str  # value of the map_id column
    name: str  # the map's name as the README writes it for people
    scale: float  # world units spanned by the full image width (and height)
    origin_x: float  # world x at u = 0, the left edge of the image
    origin_z: float  # world z at v = 0, the bottom edge of the image
    minimap_file: str  # file name inside minimaps/


MAPS: dict[str, MapConfig] = {
    cfg.map_id: cfg
    for cfg in (
        MapConfig("AmbroseValley", "Ambrose Valley", 900.0, -370.0, -473.0, "AmbroseValley_Minimap.png"),
        MapConfig("GrandRift", "Grand Rift", 581.0, -290.0, -290.0, "GrandRift_Minimap.png"),
        MapConfig("Lockdown", "Lockdown", 1000.0, -500.0, -500.0, "Lockdown_Minimap.jpg"),
    )
}


def world_to_uv(map_id: str, x: Coord, z: Coord) -> tuple[Coord, Coord]:
    """Project world (x, z) on a map to UV. Values outside [0, 1] are off the image."""
    cfg = MAPS[map_id]
    return (x - cfg.origin_x) / cfg.scale, (z - cfg.origin_z) / cfg.scale


def uv_to_world(map_id: str, u: Coord, v: Coord) -> tuple[Coord, Coord]:
    """The inverse of ``world_to_uv``: UV on a map back to world (x, z)."""
    cfg = MAPS[map_id]
    return u * cfg.scale + cfg.origin_x, v * cfg.scale + cfg.origin_z


def uv_to_pixel(u: Coord, v: Coord, width: int, height: int) -> tuple[Coord, Coord]:
    """Convert UV to pixel coordinates of a width x height image (origin top-left)."""
    return u * width, (1.0 - v) * height
