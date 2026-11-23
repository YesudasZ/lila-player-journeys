"""Coordinates: the range of x, y and z on every map, and whether the README's projection puts every row on the minimap."""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image

from pipeline.maps import MAPS, README_EXAMPLE, uv_to_pixel, world_to_uv
from pipeline.profile.metrics import Entries, Metrics, Section, joined

DEFINITIONS = {
    "{map_id}_{axis}_min": "Smallest {axis} among rows whose map_id is {map_id}.",
    "{map_id}_{axis}_max": "Largest {axis} among rows whose map_id is {map_id}.",
    "{map_id}_rows_outside_image": (
        "Rows of {map_id} whose u or v lies outside [0, 1], with u = (x - origin_x) / scale and v = (z - origin_z) / scale "
        "from the README table."
    ),
    "{map_id}_{uv}_min": "Smallest {uv} among rows of {map_id} (README formula).",
    "{map_id}_{uv}_max": "Largest {uv} among rows of {map_id} (README formula).",
    "{map_id}_minimap_width": "Pixel width of minimaps/{minimap_file}.",
    "{map_id}_minimap_height": "Pixel height of minimaps/{minimap_file}.",
    "rows_with_nan_or_infinite_coordinate": "Rows where x, y or z is NaN or infinite.",
    "rows_at_x0_z0": "Rows where x and z are both exactly 0.",
    "readme_example_pixel_x": (
        "README worked example (AmbroseValley, x=-301.45, z=-355.55, 1024 px image): pixel_x = u * 1024, "
        "rounded to the nearest integer."
    ),
    "readme_example_pixel_y": "Same example: pixel_y = (1 - v) * 1024, rounded to the nearest integer.",
}


def coordinates(rows: pd.DataFrame, raw_root: Path) -> Section:
    """Per map the range of x, y, z, u and v and the size of its minimap; rows without a position; the README's example."""
    per_map = {}
    metrics_of_maps = []
    for map_id, cfg in sorted(MAPS.items()):
        on_map = rows[rows["map_id"] == map_id]
        per_map[map_id] = _minimap(raw_root / "minimaps" / cfg.minimap_file) | {"rows": len(on_map)}
        metrics_of_maps.append(_map_metrics(map_id, on_map, per_map[map_id]))
    return joined(*metrics_of_maps, _dataset_metrics(rows)), {"per_map": per_map}


def _minimap(path: Path) -> dict[str, object]:
    """File name, image format, colour mode and pixel size of a minimap."""
    with Image.open(path) as image:
        width, height = image.size
        return {"minimap_file": path.name, "format": image.format, "mode": image.mode, "width": width, "height": height}


def _map_metrics(map_id: str, on_map: pd.DataFrame, minimap: dict[str, object]) -> Entries:
    """One map: the range of x, y and z, the range of u and v, the rows that fall off the image, the size of the minimap."""
    u, v = world_to_uv(map_id, on_map["x"].to_numpy(np.float64), on_map["z"].to_numpy(np.float64))
    outside = (u < 0) | (u > 1) | (v < 0) | (v > 1)
    minimap_file = minimap["minimap_file"]

    found = Metrics(DEFINITIONS)
    for axis in ("x", "y", "z"):
        found.add("{map_id}_{axis}_min", on_map[axis].min(), map_id=map_id, axis=axis)
        found.add("{map_id}_{axis}_max", on_map[axis].max(), map_id=map_id, axis=axis)
    found.add("{map_id}_rows_outside_image", outside.sum(), map_id=map_id)
    for uv, values in (("u", u), ("v", v)):
        found.add("{map_id}_{uv}_min", values.min(), map_id=map_id, uv=uv)
        found.add("{map_id}_{uv}_max", values.max(), map_id=map_id, uv=uv)
    found.add("{map_id}_minimap_width", minimap["width"], map_id=map_id, minimap_file=minimap_file)
    found.add("{map_id}_minimap_height", minimap["height"], map_id=map_id, minimap_file=minimap_file)
    return found.as_dict()


def _dataset_metrics(rows: pd.DataFrame) -> Entries:
    """Rows without a usable position, and the pixel the projection gives for the README's worked example."""
    xyz = rows[["x", "y", "z"]].to_numpy()
    u, v = world_to_uv(README_EXAMPLE.map_id, README_EXAMPLE.x, README_EXAMPLE.z)
    px, py = uv_to_pixel(u, v, README_EXAMPLE.image_size, README_EXAMPLE.image_size)

    found = Metrics(DEFINITIONS)
    found.add("rows_with_nan_or_infinite_coordinate", (~np.isfinite(xyz)).any(axis=1).sum())
    found.add("rows_at_x0_z0", ((rows["x"] == 0) & (rows["z"] == 0)).sum())
    found.add("readme_example_pixel_x", round(px))
    found.add("readme_example_pixel_y", round(py))
    return found.as_dict()
