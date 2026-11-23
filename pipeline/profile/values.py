"""How values are written into the report: plain numbers, ids cut to their public length, times as UTC text."""
from __future__ import annotations

from datetime import datetime, timezone

import numpy as np
import pandas as pd

from pipeline.dataset import PUBLIC_ID_LENGTH


def plain(value: object) -> object:
    """A numpy scalar as a plain Python number, a float rounded to 4 decimals, NaN as None; anything else unchanged."""
    if isinstance(value, (bool, np.bool_)):
        return bool(value)
    if isinstance(value, (int, np.integer)):
        return int(value)
    if isinstance(value, (float, np.floating)):
        return None if np.isnan(value) else round(float(value), 4)
    return value


def json_ready(value: object) -> object:
    """The value as json.dumps takes it: dict keys as text, tuples as lists, every number made plain."""
    if isinstance(value, dict):
        return {str(k): json_ready(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_ready(v) for v in value]
    return plain(value)


def short_id(identifier: str) -> str:
    """The public part of a player or match id: its first characters."""
    return identifier[:PUBLIC_ID_LENGTH]


def short_file(file_id: str) -> str:
    """A file id '<day>/<user_id>_<match_id>' with both ids cut to their public part.

    The ids are cut by position, not by their format, so an id of an unexpected format is cut as well.
    """
    day, name = file_id.split("/")
    user_id, _, match_id = name.partition("_")
    return f"{day}/{short_id(user_id)}_{short_id(match_id)}"


def utc(seconds: int) -> str:
    """Unix seconds as text, for example '2026-02-10 12:39:21 UTC'."""
    return datetime.fromtimestamp(int(seconds), timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def spread(series: pd.Series) -> dict[str, object]:
    """Minimum, quartiles and maximum of a series."""
    return {
        "min": series.min(),
        "p25": series.quantile(0.25),
        "median": series.median(),
        "p75": series.quantile(0.75),
        "max": series.max(),
    }
