"""Integer encoding of positions for the app's data files.

u and v are stored on a grid of 65,535 steps across the map, which is finer
than 0.02 world units on the largest map. Elevation is stored in tenths of a
world unit. The manifest carries both constants, so the app does not repeat them.
"""
from __future__ import annotations

import numpy as np

UV_STEPS = 65_535
ELEVATION_STEPS_PER_UNIT = 10


def encode_uv(values: np.ndarray) -> np.ndarray:
    """u or v in [0, 1] as integers 0..UV_STEPS. A value off the image is an error, not clipped."""
    values = np.asarray(values, dtype=np.float64)
    if ((values < 0.0) | (values > 1.0)).any():
        raise ValueError("u or v outside [0, 1]: the position is off the minimap")
    return np.rint(values * UV_STEPS).astype(np.int64)


def decode_uv(codes: np.ndarray) -> np.ndarray:
    """Codes back to u or v. The app does the same division; the projection fixture is computed with this function."""
    return np.asarray(codes, dtype=np.float64) / UV_STEPS


def encode_elevation(y: np.ndarray) -> np.ndarray:
    """Elevation in world units as whole tenths of a unit."""
    return np.rint(np.asarray(y, dtype=np.float64) * ELEVATION_STEPS_PER_UNIT).astype(np.int64)


def decode_elevation(codes: np.ndarray) -> np.ndarray:
    """Codes back to elevation in world units."""
    return np.asarray(codes, dtype=np.float64) / ELEVATION_STEPS_PER_UNIT
