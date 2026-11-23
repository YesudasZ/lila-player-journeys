"""How often a position is recorded: the time and the distance between consecutive movement rows of a file.

Part of the timestamps section, which pipeline/profile/timestamps.py puts together.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from pipeline.dataset import MOVEMENT_EVENTS
from pipeline.profile.metrics import Entries, Metrics

DEFINITIONS = {
    "movement_gaps_total": "Consecutive pairs of movement rows (Position or BotPosition) within a file, in file order.",
    "movement_gap_mode": "Most common raw ts difference between the two rows of such a pair.",
    "movement_gaps_equal_5": "Such pairs whose raw ts difference is exactly 5.",
    "movement_gap_median": "Median raw ts difference over such pairs.",
    "median_speed_{event}": (
        "Median of horizontal distance sqrt(dx^2 + dz^2) divided by raw ts difference, over consecutive {event} rows "
        "of a file sorted by (ts, file order); pairs with zero ts difference excluded."
    ),
    "max_speed_{event}": "Maximum of the same ratio over consecutive {event} rows.",
    "movement_pairs_gap_5_moving_under_half_unit": (
        "Consecutive movement rows of a file sorted by (ts, file order) whose raw ts difference is exactly 5 "
        "and whose horizontal distance is below 0.5."
    ),
    "Position_pairs_gap_over_6": (
        "Consecutive Position rows of a file sorted by (ts, file order) whose raw ts difference is greater than 6."
    ),
    "Position_gap_sum_in_gaps_over_6": "Sum of the raw ts differences of those pairs.",
    "Position_gap_sum": "Sum of the raw ts differences over all consecutive Position rows of a file sorted by (ts, file order).",
    "rows_same_ts_as_previous_row": "Rows whose raw ts equals the raw ts of the previous row of the same file, in file order.",
    "Position_pairs_gap_5": "Consecutive Position rows of a file sorted by (ts, file order) whose raw ts difference is exactly 5.",
    "Position_pairs_gap_5_moving_under_half_unit": "Of those pairs, the ones whose horizontal distance is below 0.5.",
    "Position_median_distance_gap_5": (
        "Median horizontal distance between the two rows of a Position pair whose raw ts difference is exactly 5."
    ),
    "Position_median_distance_gap_over_6": (
        "Median horizontal distance between the two rows of a Position pair whose raw ts difference is greater than 6."
    ),
}


def gaps_in_file_order(rows: pd.DataFrame) -> pd.Series:
    """The raw ts difference between every two consecutive movement rows of a file, in file order."""
    movement = rows[rows["event"].isin(MOVEMENT_EVENTS)]
    return movement.groupby("file", sort=False)["ts"].diff().dropna()


def gap_metrics(gap: pd.Series) -> Entries:
    """How many gaps between movement rows there are, and how long the usual one is."""
    found = Metrics(DEFINITIONS)
    found.add("movement_gaps_total", len(gap))
    found.add("movement_gap_mode", gap.mode().iloc[0])
    found.add("movement_gaps_equal_5", (gap == 5).sum())
    found.add("movement_gap_median", gap.median())
    return found.as_dict()


def movement_pairs(rows: pd.DataFrame) -> pd.DataFrame:
    """The movement rows sorted by (file, ts, file order), each with what separates it from the one before it in its file.

    ``seconds`` is the raw ts difference and ``distance`` the horizontal distance. Both are NaN on a file's first row.
    """
    ordered = rows[rows["event"].isin(MOVEMENT_EVENTS)].sort_values(["file", "ts", "row"])
    by_file = ordered.groupby("file", sort=False)
    return ordered.assign(seconds=by_file["ts"].diff(), distance=np.hypot(by_file["x"].diff(), by_file["z"].diff()))


def _speed(pairs: pd.DataFrame) -> pd.Series:
    """Distance divided by seconds, for every pair of movement rows that is more than 0 seconds apart."""
    moving = pairs["seconds"] > 0
    return pairs.loc[moving, "distance"] / pairs.loc[moving, "seconds"]


def speed_metrics(pairs: pd.DataFrame) -> Entries:
    """Median and maximum speed between consecutive Position rows, and between consecutive BotPosition rows."""
    speed = _speed(pairs)
    event_of_pair = pairs.loc[speed.index, "event"]
    found = Metrics(DEFINITIONS)
    for event in MOVEMENT_EVENTS:
        found.add("median_speed_{event}", speed[event_of_pair == event].median(), event=event)
        found.add("max_speed_{event}", speed[event_of_pair == event].max(), event=event)
    return found.as_dict()


def _first_gap(seconds_of_file: pd.Series) -> float:
    """The seconds between a file's first two movement rows. NaN for a file with one movement row."""
    known = seconds_of_file.dropna()
    return known.iloc[0] if len(known) else np.nan


def speed_by_mover(pairs: pd.DataFrame) -> list[dict[str, object]]:
    """Speed, and the gap after a file's first movement row, for bots, humans with a UUID and humans with a numeric id."""
    speed = _speed(pairs)
    of_human = np.where(pairs["id_kind"] == "uuid", "Position rows, uuid id", "Position rows, numeric id")
    mover = pd.Series(np.where(pairs["event"] == "BotPosition", "BotPosition rows", of_human), index=pairs.index)
    first_gap = pairs["seconds"].groupby(pairs["file"], sort=False).apply(_first_gap)
    first_gap_by_mover = first_gap.groupby(mover.groupby(pairs["file"], sort=False).first()).median()
    return [
        {
            "movement": name,
            "pairs": len(part),
            "median": part.median(),
            "p99": part.quantile(0.99),
            "max": part.max(),
            "share_above_5": (part > 5.001).mean(),
            "median_first_gap": first_gap_by_mover[name],
        }
        for name, part in speed.groupby(mover[speed.index])
    ]


def standing_still(pairs: pd.DataFrame, step: pd.Series) -> tuple[Entries, dict[str, object]]:
    """Is the sampler a fixed 5-unit clock, or does it skip while a player stands still? Its metrics, and three shares.

    ``step`` is the raw ts difference between each row, of any event, and the row before it in file order.
    """
    seconds, distance = pairs["seconds"], pairs["distance"]
    is_position = pairs["event"] == "Position"
    still_5 = (seconds == 5) & (distance < 0.5)
    long_gap = is_position & (seconds > 6)
    position_5 = is_position & (seconds == 5)

    found = Metrics(DEFINITIONS)
    found.add("movement_pairs_gap_5_moving_under_half_unit", still_5.sum())
    found.add("Position_pairs_gap_over_6", long_gap.sum())
    found.add("Position_gap_sum_in_gaps_over_6", seconds[long_gap].sum())
    found.add("Position_gap_sum", seconds[is_position].sum())
    found.add("rows_same_ts_as_previous_row", (step == 0).sum())
    found.add("Position_pairs_gap_5", position_5.sum())
    found.add("Position_pairs_gap_5_moving_under_half_unit", (position_5 & (distance < 0.5)).sum())
    found.add("Position_median_distance_gap_5", distance[position_5].median())
    found.add("Position_median_distance_gap_over_6", distance[long_gap].median())
    shares = {
        "share_of_gap_5_pairs_moving_under_half_unit": still_5.sum() / (seconds == 5).sum(),
        "share_of_Position_pairs_with_gap_over_6": long_gap.sum() / (is_position & seconds.notna()).sum(),
        "share_of_Position_time_inside_gaps_over_6": seconds[long_gap].sum() / seconds[is_position].sum(),
    }
    return found.as_dict(), shares


def distance_by_gap_length(pairs: pd.DataFrame) -> list[dict[str, object]]:
    """How far apart two consecutive Position rows are, by the length of the gap between them."""
    seconds, distance = pairs["seconds"], pairs["distance"]
    is_position = pairs["event"] == "Position"
    gap_bucket = pd.cut(seconds[is_position], [4, 5, 10, 20, 60, np.inf], labels=["5", "6 to 10", "11 to 20", "21 to 60", "over 60"])
    return [
        {
            "gap": name,
            "pairs": len(part),
            "median_distance": part.median(),
            "median_distance_per_unit_of_gap": (part / seconds[part.index]).median(),
        }
        for name, part in distance[is_position].groupby(gap_bucket, observed=True)
    ]
