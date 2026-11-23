"""The ts column: its unit and range, its order within a file, and how it relates to the day folders.

The timestamps section also covers how often a position is recorded; that part is measured in sampling.py.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from pipeline.clean import files_written_twice
from pipeline.profile import sampling
from pipeline.profile.metrics import Entries, Metrics, Section, joined
from pipeline.profile.values import short_file, spread, utc

README_SAMPLE_TS = ("1970-01-21 11:52:07.161", "1970-01-21 11:52:21.082")  # ts of the README's two sample rows, as printed
ZONES = {"utc": ("UTC", 0), "ist": ("UTC+05:30", 19_800)}  # label in a metric's key: the zone's name and its offset in seconds
DEFINITIONS = {
    "raw_ts_min": "Smallest integer stored in the ts column (the raw int64, no unit conversion).",
    "raw_ts_max": "Largest integer stored in the ts column (the raw int64, no unit conversion).",
    "file_span_median": "Median over files of (largest raw ts - smallest raw ts) within the file.",
    "file_span_max": "Maximum over files of (largest raw ts - smallest raw ts) within the file.",
    "match_span_median": "Median over match_ids of (largest raw ts - smallest raw ts) across all rows of the match.",
    "match_span_max": "Maximum over match_ids of (largest raw ts - smallest raw ts) across all rows of the match.",
    "rows_ts_goes_backwards": "Rows whose raw ts is smaller than the raw ts of the previous row of the same file, in file order.",
    "files_ts_goes_backwards": "Files containing at least one row whose raw ts is smaller than that of the previous row.",
    "files_first_row_date_differs_from_folder_{label}": (
        "Files where the calendar date of the file's smallest raw ts, read as Unix seconds in {zone}, "
        "is not the date in its folder name."
    ),
    "files_last_row_date_differs_from_folder_{label}": (
        "Files where the calendar date of the file's largest raw ts, read as Unix seconds in {zone}, "
        "is not the date in its folder name."
    ),
    "matches_in_several_day_folders": "match_ids that have files in more than one day folder.",
    "files_written_twice": (
        "Files with an even row count whose second half repeats the first half exactly, row for row, on all eight columns."
    ),
}


def ts_steps(rows: pd.DataFrame) -> pd.Series:
    """The raw ts of each row minus that of the row before it in its file, in file order. NaN on a file's first row."""
    return rows.groupby("file", sort=False)["ts"].diff()


def match_span(rows: pd.DataFrame) -> pd.Series:
    """Largest minus smallest raw ts of every match over the rows given: what was recorded, not the length of the match."""
    ts_range = rows.groupby("match_id")["ts"].agg(["min", "max"])
    return ts_range["max"] - ts_range["min"]


def timestamps(rows: pd.DataFrame, files: pd.DataFrame) -> Section:
    """What the ts column holds, its order within a file, the day folders, and how often a position is recorded."""
    ts = rows["ts"]
    step = ts_steps(rows)
    file_span = files["last_ts"] - files["first_ts"]
    span = match_span(rows)
    written_twice = files_written_twice(rows)
    off_date = _files_off_their_folder_date(files)
    gap = sampling.gaps_in_file_order(rows)
    pairs = sampling.movement_pairs(rows)
    still_metrics, skipped_shares = sampling.standing_still(pairs, step)
    metrics = joined(
        _range_and_order_metrics(rows, file_span, span, step),
        sampling.gap_metrics(gap),
        _filing_metrics(rows, off_date, written_twice),
        sampling.speed_metrics(pairs),
        still_metrics,
    )
    details = {
        "raw_range_read_as_unix_seconds": {"first": utc(ts.min()), "last": utc(ts.max())},
        "raw_range_read_as_milliseconds": {
            "first": str(pd.to_datetime(ts.min(), unit="ms")),
            "last": str(pd.to_datetime(ts.max(), unit="ms")),
        },
        "file_span": {"if_seconds": spread(file_span), "if_milliseconds_in_seconds": spread(file_span / 1000)},
        "match_span": {"if_seconds": spread(span), "if_milliseconds_in_seconds": spread(span / 1000)},
        "movement_gap_top_values": gap.value_counts().head(6).to_dict(),
        "movement_gap_share_equal_5": (gap == 5).mean(),
        "speed_world_units_per_raw_ts_unit": sampling.speed_by_mover(pairs),
        "Position_distance_by_gap_length": sampling.distance_by_gap_length(pairs),
        "human_file_starts_by_utc_hour": _busiest_and_quietest_six_hours(files),
        "readme_sample_rows": _readme_sample_rows(),
        "sampling_skips_while_standing_still": skipped_shares,
        "rows_where_ts_goes_backwards": _rows_going_backwards(rows, files, step, written_twice),
        "files_whose_date_differs_from_folder": off_date,
        "files_whose_last_row_utc_date_differs_from_folder": _files_ending_on_another_utc_date(files),
        "utc_offset_hours_that_best_matches_folders": _best_utc_offset(files),
        "per_folder_range_utc": _range_per_folder(files),
    }
    return metrics, details


def _range_and_order_metrics(rows: pd.DataFrame, file_span: pd.Series, span: pd.Series, step: pd.Series) -> Entries:
    """The range of the raw ts values, the span of files and of matches, and how often ts goes backwards within a file."""
    backwards = step < 0
    found = Metrics(DEFINITIONS)
    found.add("raw_ts_min", rows["ts"].min())
    found.add("raw_ts_max", rows["ts"].max())
    found.add("file_span_median", file_span.median())
    found.add("file_span_max", file_span.max())
    found.add("match_span_median", span.median())
    found.add("match_span_max", span.max())
    found.add("rows_ts_goes_backwards", backwards.sum())
    found.add("files_ts_goes_backwards", rows.loc[backwards, "file"].nunique())
    return found.as_dict()


def _folder_label(seconds: pd.Series, offset_seconds: int = 0) -> pd.Series:
    """The day-folder name ('February_10') of each timestamp, read as Unix seconds at a UTC offset."""
    return pd.to_datetime(seconds + offset_seconds, unit="s").dt.strftime("%B_%d")


def _files_off_their_folder_date(files: pd.DataFrame) -> dict[str, dict[str, object]]:
    """Per time zone: the files whose first row, and whose last row, falls on another date than their folder's name."""
    return {
        zone: {
            "first_row": (_folder_label(files["first_ts"], offset) != files["day"]).sum(),
            "last_row": (_folder_label(files["last_ts"], offset) != files["day"]).sum(),
        }
        for zone, offset in ZONES.values()
    }


def _filing_metrics(rows: pd.DataFrame, off_date: dict[str, dict[str, object]], written_twice: pd.Series) -> Entries:
    """Files under another date than their rows', matches spread over several day folders, and files written twice."""
    found = Metrics(DEFINITIONS)
    for label, (zone, _) in ZONES.items():
        found.add("files_first_row_date_differs_from_folder_{label}", off_date[zone]["first_row"], label=label, zone=zone)
        found.add("files_last_row_date_differs_from_folder_{label}", off_date[zone]["last_row"], label=label, zone=zone)
    found.add("matches_in_several_day_folders", (rows.groupby("match_id")["day"].nunique() > 1).sum())
    found.add("files_written_twice", written_twice.sum())
    return found.as_dict()


def _busiest_and_quietest_six_hours(files: pd.DataFrame) -> dict[str, dict[str, object]]:
    """The six hours of the UTC day in which the most, and the fewest, human files start. A window may wrap around midnight."""
    human_files = files[files["actor"] == "human"]
    starts_by_hour = ((human_files["first_ts"] % 86_400) // 3_600).value_counts().reindex(range(24), fill_value=0)
    six_hours = pd.Series({hour: int(sum(starts_by_hour[(hour + k) % 24] for k in range(6))) for hour in range(24)})
    return {
        "busiest_six_hours": {"from_utc_hour": six_hours.idxmax(), "files": six_hours.max()},
        "quietest_six_hours": {"from_utc_hour": six_hours.idxmin(), "files": six_hours.min()},
    }


def _readme_sample_rows() -> list[dict[str, object]]:
    """The two ts values the README prints, as the integers they stand for and as dates when those are Unix seconds."""
    samples = []
    for text in README_SAMPLE_TS:
        raw = int(pd.Timestamp(text).value // 1_000_000)  # the README printed the integer as milliseconds
        samples.append({"readme_prints": text, "raw_integer": raw, "read_as_unix_seconds": utc(raw)})
    return samples


def _rows_going_backwards(rows: pd.DataFrame, files: pd.DataFrame, step: pd.Series, written_twice: pd.Series) -> list[dict[str, object]]:
    """Every row whose ts is smaller than that of the row before it, and whether its file was written twice."""
    return [
        {
            "file": short_file(r.file),
            "file_rows": int(files.loc[r.file, "rows"]),
            "row": r.row,
            "event": r.event,
            "jump": step[r.Index],
            "file_written_twice": bool(written_twice[r.file]),
        }
        for r in rows[step < 0].itertuples()
    ]


def _files_ending_on_another_utc_date(files: pd.DataFrame) -> list[dict[str, object]]:
    """The files whose last row, read as UTC, is on another date than their folder's name."""
    off_date = _folder_label(files["last_ts"]) != files["day"]
    return [{"file": short_file(file), "last_row": utc(last)} for file, last in files.loc[off_date, "last_ts"].items()]


def _best_utc_offset(files: pd.DataFrame) -> dict[str, object]:
    """The UTC offset, in half hours from -12 to +14, at which the most files start on the date of their folder."""
    offsets = np.arange(-12, 14.5, 0.5)
    fits = {hours: int((_folder_label(files["first_ts"], int(hours * 3600)) == files["day"]).sum()) for hours in offsets}
    best_offset = max(fits, key=fits.get)
    return {"offset": best_offset, "files_matching": fits[best_offset], "files": len(files)}


def _range_per_folder(files: pd.DataFrame) -> list[dict[str, object]]:
    """The first and the last row of every day folder, as UTC."""
    per_folder = files.groupby("day").agg(first=("first_ts", "min"), last=("last_ts", "max"))
    return [{"folder": day, "first": utc(r["first"]), "last": utc(r["last"])} for day, r in per_folder.iterrows()]
