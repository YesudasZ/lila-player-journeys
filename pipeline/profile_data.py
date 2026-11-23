"""Profile the raw telemetry and write an evidence report.

    python -m pipeline.profile_data --raw data/raw/player_data --out docs/profile

Read-only on the data. Writes profile_report.json (every number, plus the exact
definition of each named metric) and profile_report.md (the same, readable).
docs/DATA_NOTES.md cites these files. Player and match ids are cut to their
first eight characters in the output.
"""
from __future__ import annotations

import argparse
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image

from pipeline.clean import (
    after_death,
    drop_kills_mirroring_a_death,
    end_paths_at_death,
    keep_first_half_of_files_written_twice,
    keep_one_copy_per_journey,
    repeats_itself,
)
from pipeline.dataset import COLUMNS, DEATH_EVENTS, EVENTS, MOVEMENT_EVENTS, RawData, load_raw
from pipeline.journeys import actor_by_file
from pipeline.maps import MAPS, README_EXAMPLE, uv_to_pixel, world_to_uv

README_FILES_PER_DAY = {"February_10": 437, "February_11": 293, "February_12": 268, "February_13": 166, "February_14": 79}
README_SAMPLE_TS = ("1970-01-21 11:52:07.161", "1970-01-21 11:52:21.082")  # ts of the README's two sample rows, as printed
IST_OFFSET_SECONDS = 19_800  # UTC+05:30
DETAIL_DEFINITIONS = {
    "timestamps > speed_world_units_per_raw_ts_unit": "Horizontal distance divided by raw ts difference, over consecutive movement rows of a file sorted by (ts, file order). share_above_5 is the share of pairs above 5.001. median_first_gap is the median over files of the raw ts difference between a file's first two movement rows.",
    "timestamps > Position_distance_by_gap_length": "Consecutive Position rows of a file sorted by (ts, file order), grouped by their raw ts difference. median_distance_per_unit_of_gap divides each pair's horizontal distance by its ts difference.",
    "timestamps > human_file_starts_by_utc_hour": "Files with Position rows, counted by the UTC hour of their smallest raw ts read as Unix seconds. The six-hour windows wrap around midnight.",
    "matches > duration": "Largest minus smallest raw ts over the files recorded for a match. It is an observed span, not the length of the match.",
    "duplicates > within_file_copies_directly_after_their_twin": "Surplus identical rows whose previous row in file order is identical on all eight columns, as a share of all surplus identical rows within a file.",
    "deaths > files_by_actor_and_fate": "Fate is the event of the file's first death row in (ts, file order), or 'no death row'.",
    "deaths > storm_deaths_seconds_into_match_by_map": "Raw ts of the KilledByStorm row minus the smallest raw ts of its match.",
    "combat > rows_paired_with_rows_in_another_file": "For each row of the first kind: partner rows in the same match, in another file, with a raw ts at most 1 away. Distance is horizontal, to the nearest such partner.",
    "combat > distance_from_event_row_to_nearest_movement_sample_of_same_file": "Horizontal distance from each non-movement row to the movement row of the same file that is nearest in time.",
    "cleaning": "The four rules are applied in order, each to what the previous one left. Actor (human or bot) comes from the movement event of the file.",
}
ID_KINDS = "uuid = lowercase 8-4-4-4-12 hexadecimal, numeric = ASCII digits only"


class Metrics:
    """Named measurements, each stored with the exact definition used to compute it."""

    def __init__(self) -> None:
        self._topics: dict[str, dict[str, dict[str, object]]] = {}

    def add(self, topic: str, key: str, value: object, definition: str) -> None:
        self._topics.setdefault(topic, {})[key] = {"value": _plain(value), "definition": definition}

    def value(self, topic: str, key: str) -> object:
        return self._topics[topic][key]["value"]

    def as_dict(self) -> dict[str, dict[str, dict[str, object]]]:
        return self._topics


# --------------------------------------------------------------------------- helpers


def _plain(value: object) -> object:
    """Numpy scalars become plain Python numbers; floats are rounded to 4 decimals."""
    if isinstance(value, (bool, np.bool_)):
        return bool(value)
    if isinstance(value, (int, np.integer)):
        return int(value)
    if isinstance(value, (float, np.floating)):
        return None if np.isnan(value) else round(float(value), 4)
    return value


def _clean(value: object) -> object:
    if isinstance(value, dict):
        return {str(k): _clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_clean(v) for v in value]
    return _plain(value)


def _short(identifier: str) -> str:
    return identifier[:8]


def _short_file(file_id: str) -> str:
    day, name = file_id.split("/")
    user_id, _, match_id = name.partition("_")
    return f"{day}/{_short(user_id)}_{_short(match_id)}"


def _utc(seconds: int) -> str:
    return datetime.fromtimestamp(int(seconds), timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def _folder_label(seconds: pd.Series, offset_seconds: int = 0) -> pd.Series:
    """The day-folder name ('February_10') of each timestamp, read as Unix seconds at a UTC offset."""
    return pd.to_datetime(seconds + offset_seconds, unit="s").dt.strftime("%B_%d")


def _spread(series: pd.Series) -> dict[str, object]:
    return {
        "min": series.min(),
        "p25": series.quantile(0.25),
        "median": series.median(),
        "p75": series.quantile(0.75),
        "max": series.max(),
    }


def file_table(rows: pd.DataFrame) -> pd.DataFrame:
    """One line per file: owner, match, time range, row count per event, and the actor type.

    The actor type comes from the movement event the file contains (Position ->
    human, BotPosition -> bot), not from the format of the user_id.
    """
    meta = rows.groupby("file", sort=False).agg(
        day=("day", "first"),
        user_id=("user_id", "first"),
        id_kind=("id_kind", "first"),
        match_id=("match_id", "first"),
        map_id=("map_id", "first"),
        rows=("row", "size"),
        first_ts=("ts", "min"),
        last_ts=("ts", "max"),
    )
    counts = pd.crosstab(rows["file"], rows["event"]).reindex(columns=list(EVENTS), fill_value=0)
    table = meta.join(counts)
    table["actor"] = actor_by_file(rows)
    return table


# --------------------------------------------------------------------------- sections


def inventory(data: RawData, m: Metrics) -> dict[str, object]:
    topic = "files_schema"
    files = pd.DataFrame([vars(f) for f in data.files])
    per_day = files.groupby("day").agg(files=("file", "size"), megabytes=("size_bytes", "sum"), rows=("rows", "sum"))
    per_day["megabytes"] = per_day["megabytes"] / 1e6
    rows_per_file = files.loc[files["error"].isna(), "rows"]

    m.add(topic, "files_total", len(files), "Regular files inside the February_* day folders.")
    for day, count in per_day["files"].items():
        m.add(topic, f"files_{day}", count, f"Regular files inside {day}/.")
    m.add(topic, "files_named_nakama0", files["name"].str.endswith(".nakama-0").sum(), "Files whose name ends in .nakama-0.")
    m.add(topic, "files_named_parquet", files["name"].str.endswith(".parquet").sum(), "Files whose name ends in .parquet.")
    m.add(topic, "files_par1_magic", files["has_magic"].sum(), "Files whose first four and last four bytes are both PAR1, the Parquet magic number.")
    m.add(topic, "files_unreadable", files["error"].notna().sum(), "Files that a Parquet reader fails to open or read.")
    m.add(topic, "rows_total", len(data.rows), "Rows summed over all files.")
    for day, count in per_day["rows"].items():
        m.add(topic, f"rows_{day}", count, f"Rows summed over the files in {day}/.")
    m.add(topic, "rows_per_file_min", rows_per_file.min(), "Smallest row count of any file.")
    m.add(topic, "rows_per_file_median", rows_per_file.median(), "Median row count per file.")
    m.add(topic, "rows_per_file_max", rows_per_file.max(), "Largest row count of any file.")
    return {
        "per_day_folder": per_day.reset_index().to_dict("records"),
        "unreadable_files": files.loc[files["error"].notna(), ["file", "error"]].to_dict("records"),
    }


def schema(data: RawData, m: Metrics) -> dict[str, object]:
    topic = "files_schema"
    readable = [f for f in data.files if f.error is None]
    signatures = Counter(f.schema for f in readable)
    nulls = data.rows[COLUMNS].isna().sum()
    event_values = sorted(data.rows["event"].unique())

    m.add(topic, "distinct_schemas", len(signatures), "Distinct combinations of column names, column types and nullability across files.")
    m.add(topic, "null_values_total", nulls.sum(), "Null values summed over the eight data columns of all files.")
    m.add(topic, "distinct_event_values", len(event_values), "Distinct values of the event column after decoding its bytes as UTF-8.")
    m.add(topic, "event_values_not_utf8", data.undecodable_events, "Rows whose event bytes are not valid UTF-8.")
    return {
        "arrow_schema": [{"files": count, "columns": signature} for signature, count in signatures.items()],
        "parquet_writer": dict(Counter(f.created_by for f in readable)),
        "ts_parquet_logical_type": dict(Counter(f.ts_logical_type for f in readable)),
        "nulls_per_column": nulls.to_dict(),
        "event_values": event_values,
        "event_values_not_in_readme": sorted(set(event_values) - set(EVENTS)),
    }


def naming(rows: pd.DataFrame, files: pd.DataFrame, m: Metrics) -> dict[str, object]:
    topic = "files_schema"
    distinct = rows.groupby("file", sort=False).agg(users=("user_id", "nunique"), matches=("match_id", "nunique"), maps=("map_id", "nunique"))
    file_names = files.index.str.split("/").str[1]
    expected = (files["user_id"] + "_" + files["match_id"]).to_numpy()
    match_ids = pd.Series(rows["match_id"].unique())

    m.add(topic, "files_name_differs_from_columns", (file_names != expected).sum(), "Files whose name is not exactly '<user_id>_<match_id>' built from the file's own first row (the match_id column already ends in .nakama-0).")
    m.add(topic, "files_with_several_user_ids", (distinct["users"] > 1).sum(), "Files containing more than one distinct user_id.")
    m.add(topic, "files_with_several_match_ids", (distinct["matches"] > 1).sum(), "Files containing more than one distinct match_id.")
    m.add(topic, "files_with_several_map_ids", (distinct["maps"] > 1).sum(), "Files containing more than one distinct map_id.")
    m.add(topic, "match_ids_without_nakama_suffix", (~match_ids.str.endswith(".nakama-0")).sum(), "Distinct match_id values that do not end in .nakama-0.")
    m.add(topic, "distinct_map_ids", rows["map_id"].nunique(), "Distinct values of the map_id column.")
    return {"map_ids": sorted(rows["map_id"].unique())}


def events(rows: pd.DataFrame, m: Metrics) -> dict[str, object]:
    topic = "actors_events"
    counts = rows["event"].value_counts()
    by_kind = pd.crosstab(rows["id_kind"], rows["event"])
    by_map = pd.crosstab(rows["map_id"], rows["event"])

    for event, count in counts.sort_index().items():
        m.add(topic, f"rows_event_{event}", count, f"Rows whose event is {event}.")
    for kind in by_kind.index:
        for event in by_kind.columns:
            m.add(topic, f"rows_{kind}_{event}", by_kind.loc[kind, event], f"Rows whose event is {event} and whose user_id is {kind} ({ID_KINDS}).")
    return {
        "share_of_rows": (counts / len(rows)).sort_values(ascending=False).to_dict(),
        "movement_share_of_rows": counts.reindex(list(MOVEMENT_EVENTS)).sum() / len(rows),
        "rows_by_map_and_event": by_map.reset_index().to_dict("records"),
        "rows_by_id_kind_and_event": by_kind.reset_index().to_dict("records"),
    }


def actors(rows: pd.DataFrame, files: pd.DataFrame, m: Metrics) -> dict[str, object]:
    topic = "actors_events"
    users = rows.drop_duplicates("user_id")["id_kind"].value_counts()
    numeric = files[files["id_kind"] == "numeric"]
    human_like = numeric[numeric["Position"] > 0]
    human_like_ids = set(human_like["user_id"])
    bot_like_ids = set(numeric.loc[numeric["BotPosition"] > 0, "user_id"])

    m.add(topic, "distinct_user_ids", users.sum(), "Distinct user_id values.")
    for kind in ("uuid", "numeric", "other"):
        m.add(topic, f"distinct_{kind}_user_ids", users.get(kind, 0), f"Distinct user_id values of kind {kind} ({ID_KINDS}, other = anything else).")
    for kind in ("uuid", "numeric"):
        m.add(topic, f"files_{kind}", (files["id_kind"] == kind).sum(), f"Files whose user_id is {kind}.")
    m.add(topic, "files_with_Position_and_BotPosition", ((files["Position"] > 0) & (files["BotPosition"] > 0)).sum(), "Files containing both Position and BotPosition rows.")
    m.add(topic, "files_without_movement_rows", ((files["Position"] == 0) & (files["BotPosition"] == 0)).sum(), "Files containing neither Position nor BotPosition rows.")
    m.add(topic, "files_uuid_with_BotPosition", ((files["id_kind"] == "uuid") & (files["BotPosition"] > 0)).sum(), "Files with a UUID user_id that contain at least one BotPosition row.")
    m.add(topic, "files_numeric_with_Position", len(human_like), "Files with a numeric user_id that contain at least one Position row.")
    m.add(topic, "files_numeric_with_BotPosition", (numeric["BotPosition"] > 0).sum(), "Files with a numeric user_id that contain at least one BotPosition row.")
    m.add(topic, "numeric_user_ids_with_Position", len(human_like_ids), "Distinct numeric user_ids that have at least one file containing Position rows.")
    m.add(topic, "numeric_user_ids_in_both_roles", len(human_like_ids & bot_like_ids), "Distinct numeric user_ids that have Position rows in one file and BotPosition rows in another.")
    m.add(topic, "rows_Loot_in_files_with_BotPosition", files.loc[files["BotPosition"] > 0, "Loot"].sum(), "Loot rows inside files that contain BotPosition rows.")
    m.add(topic, "distinct_user_ids_with_Position", files.loc[files["Position"] > 0, "user_id"].nunique(), "Distinct user_ids of any format that have at least one file containing Position rows.")
    m.add(topic, "distinct_user_ids_with_BotPosition", files.loc[files["BotPosition"] > 0, "user_id"].nunique(), "Distinct user_ids of any format that have at least one file containing BotPosition rows.")

    has_death = files[list(DEATH_EVENTS)].sum(axis=1) > 0
    m.add(topic, "files_numeric_with_Position_and_death_row", (has_death & (files["id_kind"] == "numeric") & (files["Position"] > 0)).sum(), "Files with a numeric user_id and Position rows that contain a death row (Killed, BotKilled or KilledByStorm).")
    m.add(topic, "files_uuid_with_death_row", (has_death & (files["id_kind"] == "uuid")).sum(), "Files with a UUID user_id that contain a death row.")

    # Are the numeric ids on Position files player identities, or one placeholder per map?
    bots = numeric[numeric["BotPosition"] > 0]
    bot_numbers = bots["user_id"].astype(int)
    per_map = [
        {
            "map_id": map_id,
            "numeric_id_on_Position_files": ", ".join(sorted(part["user_id"].unique(), key=int)),
            "Position_files": len(part),
            "lowest_bot_id": bot_numbers[bots["map_id"] == map_id].min(),
            "highest_bot_id": bot_numbers[bots["map_id"] == map_id].max(),
        }
        for map_id, part in human_like.groupby("map_id")
    ]
    shared = bots[bots["user_id"].isin(human_like_ids)]
    span = files["last_ts"] - files["first_ts"]

    uuid_users_per_match = files[files["id_kind"] == "uuid"].groupby("match_id")["user_id"].nunique()
    listing = human_like.reset_index()
    listing["uuid_users_in_match"] = listing["match_id"].map(uuid_users_per_match).fillna(0).astype(int)
    listing["file"] = listing["file"].map(_short_file)
    roles = [
        {
            "user_id": user_id,
            "files_with_Position": int(((numeric["user_id"] == user_id) & (numeric["Position"] > 0)).sum()),
            "files_with_BotPosition": int(((numeric["user_id"] == user_id) & (numeric["BotPosition"] > 0)).sum()),
        }
        for user_id in sorted(human_like_ids, key=int)
    ]
    return {
        "numeric_ids_with_Position_files": roles,
        "numeric_id_on_Position_files_against_bot_id_range_by_map": per_map,
        "BotPosition_files_of_those_ids_by_map": shared.groupby(["user_id", "map_id"]).size().reset_index(name="BotPosition_files").to_dict("records"),
        "median_seconds_recorded_per_file": {"numeric id with Position": span[human_like.index].median(), "uuid id": span[files["id_kind"] == "uuid"].median()},
        "their_Position_files": listing[["file", "map_id", "rows", "Position", "Loot", "BotKill", "BotKilled", "uuid_users_in_match"]].to_dict("records"),
        "files_by_actor_from_movement_event": files["actor"].value_counts().to_dict(),
        "files_by_id_kind_and_actor": pd.crosstab(files["id_kind"], files["actor"]).reset_index().to_dict("records"),
    }


def timestamps(rows: pd.DataFrame, files: pd.DataFrame, m: Metrics) -> dict[str, object]:
    topic = "time"
    ts = rows["ts"]
    file_span = files["last_ts"] - files["first_ts"]
    match_range = rows.groupby("match_id")["ts"].agg(["min", "max"])
    match_span = match_range["max"] - match_range["min"]
    step = rows.groupby("file", sort=False)["ts"].diff()
    backwards = step < 0
    movement = rows[rows["event"].isin(MOVEMENT_EVENTS)]
    gap = movement.groupby("file", sort=False)["ts"].diff().dropna()

    m.add(topic, "raw_ts_min", ts.min(), "Smallest integer stored in the ts column (the raw int64, no unit conversion).")
    m.add(topic, "raw_ts_max", ts.max(), "Largest integer stored in the ts column (the raw int64, no unit conversion).")
    m.add(topic, "file_span_median", file_span.median(), "Median over files of (largest raw ts - smallest raw ts) within the file.")
    m.add(topic, "file_span_max", file_span.max(), "Maximum over files of (largest raw ts - smallest raw ts) within the file.")
    m.add(topic, "match_span_median", match_span.median(), "Median over match_ids of (largest raw ts - smallest raw ts) across all rows of the match.")
    m.add(topic, "match_span_max", match_span.max(), "Maximum over match_ids of (largest raw ts - smallest raw ts) across all rows of the match.")
    m.add(topic, "rows_ts_goes_backwards", backwards.sum(), "Rows whose raw ts is smaller than the raw ts of the previous row of the same file, in file order.")
    m.add(topic, "files_ts_goes_backwards", rows.loc[backwards, "file"].nunique(), "Files containing at least one row whose raw ts is smaller than that of the previous row.")
    m.add(topic, "movement_gaps_total", len(gap), "Consecutive pairs of movement rows (Position or BotPosition) within a file, in file order.")
    m.add(topic, "movement_gap_mode", gap.mode().iloc[0], "Most common raw ts difference between the two rows of such a pair.")
    m.add(topic, "movement_gaps_equal_5", (gap == 5).sum(), "Such pairs whose raw ts difference is exactly 5.")
    m.add(topic, "movement_gap_median", gap.median(), "Median raw ts difference over such pairs.")
    mismatch = {}
    for label, offset, zone in (("utc", 0, "UTC"), ("ist", IST_OFFSET_SECONDS, "UTC+05:30")):
        first = (_folder_label(files["first_ts"], offset) != files["day"]).sum()
        last = (_folder_label(files["last_ts"], offset) != files["day"]).sum()
        m.add(topic, f"files_first_row_date_differs_from_folder_{label}", first, f"Files where the calendar date of the file's smallest raw ts, read as Unix seconds in {zone}, is not the date in its folder name.")
        m.add(topic, f"files_last_row_date_differs_from_folder_{label}", last, f"Files where the calendar date of the file's largest raw ts, read as Unix seconds in {zone}, is not the date in its folder name.")
        mismatch[zone] = {"first_row": first, "last_row": last}
    m.add(topic, "matches_in_several_day_folders", (rows.groupby("match_id")["day"].nunique() > 1).sum(), "match_ids that have files in more than one day folder.")

    doubled = rows.groupby("file", sort=False)[COLUMNS].apply(repeats_itself)
    m.add(topic, "files_written_twice", doubled.sum(), "Files with an even row count whose second half repeats the first half exactly, row for row, on all eight columns.")

    ordered = movement.sort_values(["file", "ts", "row"])
    by_file = ordered.groupby("file", sort=False)
    seconds = by_file["ts"].diff()
    distance = np.hypot(by_file["x"].diff(), by_file["z"].diff())
    moving = seconds > 0
    speed = distance[moving] / seconds[moving]
    for event in MOVEMENT_EVENTS:
        m.add(topic, f"median_speed_{event}", speed[ordered.loc[moving, "event"] == event].median(), f"Median of horizontal distance sqrt(dx^2 + dz^2) divided by raw ts difference, over consecutive {event} rows of a file sorted by (ts, file order); pairs with zero ts difference excluded.")
        m.add(topic, f"max_speed_{event}", speed[ordered.loc[moving, "event"] == event].max(), f"Maximum of the same ratio over consecutive {event} rows.")
    mover = pd.Series(
        np.where(ordered["event"] == "BotPosition", "BotPosition rows", np.where(ordered["id_kind"] == "uuid", "Position rows, uuid id", "Position rows, numeric id")),
        index=ordered.index,
    )
    first_gap = seconds.groupby(ordered["file"], sort=False).apply(lambda s: s.dropna().iloc[0] if s.notna().any() else np.nan)
    first_gap_by_mover = first_gap.groupby(mover.groupby(ordered["file"], sort=False).first()).median()

    # Is the sampler a fixed 5-unit clock, or does it skip while the player stands still?
    is_position = ordered["event"] == "Position"
    still_5 = (seconds == 5) & (distance < 0.5)
    long_gap = is_position & (seconds > 6)
    m.add(topic, "movement_pairs_gap_5_moving_under_half_unit", still_5.sum(), "Consecutive movement rows of a file sorted by (ts, file order) whose raw ts difference is exactly 5 and whose horizontal distance is below 0.5.")
    m.add(topic, "Position_pairs_gap_over_6", long_gap.sum(), "Consecutive Position rows of a file sorted by (ts, file order) whose raw ts difference is greater than 6.")
    m.add(topic, "Position_gap_sum_in_gaps_over_6", seconds[long_gap].sum(), "Sum of the raw ts differences of those pairs.")
    m.add(topic, "Position_gap_sum", seconds[is_position].sum(), "Sum of the raw ts differences over all consecutive Position rows of a file sorted by (ts, file order).")
    m.add(topic, "rows_same_ts_as_previous_row", (step == 0).sum(), "Rows whose raw ts equals the raw ts of the previous row of the same file, in file order.")
    position_5 = is_position & (seconds == 5)
    m.add(topic, "Position_pairs_gap_5", position_5.sum(), "Consecutive Position rows of a file sorted by (ts, file order) whose raw ts difference is exactly 5.")
    m.add(topic, "Position_pairs_gap_5_moving_under_half_unit", (position_5 & (distance < 0.5)).sum(), "Of those pairs, the ones whose horizontal distance is below 0.5.")
    m.add(topic, "Position_median_distance_gap_5", distance[position_5].median(), "Median horizontal distance between the two rows of a Position pair whose raw ts difference is exactly 5.")
    m.add(topic, "Position_median_distance_gap_over_6", distance[long_gap].median(), "Median horizontal distance between the two rows of a Position pair whose raw ts difference is greater than 6.")
    gap_bucket = pd.cut(seconds[is_position], [4, 5, 10, 20, 60, np.inf], labels=["5", "6 to 10", "11 to 20", "21 to 60", "over 60"])
    distance_by_gap = [
        {"gap": name, "pairs": len(part), "median_distance": part.median(), "median_distance_per_unit_of_gap": (part / seconds[part.index]).median()}
        for name, part in distance[is_position].groupby(gap_bucket, observed=True)
    ]
    human_files = files[files["actor"] == "human"]
    starts_by_hour = ((human_files["first_ts"] % 86_400) // 3_600).value_counts().reindex(range(24), fill_value=0)
    six_hours = pd.Series({hour: int(sum(starts_by_hour[(hour + k) % 24] for k in range(6))) for hour in range(24)})

    fits = {hours: int((_folder_label(files["first_ts"], int(hours * 3600)) == files["day"]).sum()) for hours in np.arange(-12, 14.5, 0.5)}
    best_offset = max(fits, key=fits.get)
    per_folder = files.groupby("day").agg(first=("first_ts", "min"), last=("last_ts", "max"))
    return {
        "raw_range_read_as_unix_seconds": {"first": _utc(ts.min()), "last": _utc(ts.max())},
        "raw_range_read_as_milliseconds": {
            "first": str(pd.to_datetime(ts.min(), unit="ms")),
            "last": str(pd.to_datetime(ts.max(), unit="ms")),
        },
        "file_span": {"if_seconds": _spread(file_span), "if_milliseconds_in_seconds": _spread(file_span / 1000)},
        "match_span": {"if_seconds": _spread(match_span), "if_milliseconds_in_seconds": _spread(match_span / 1000)},
        "movement_gap_top_values": gap.value_counts().head(6).to_dict(),
        "movement_gap_share_equal_5": (gap == 5).mean(),
        "speed_world_units_per_raw_ts_unit": [
            {
                "movement": name,
                "pairs": len(part),
                "median": part.median(),
                "p99": part.quantile(0.99),
                "max": part.max(),
                "share_above_5": (part > 5.001).mean(),
                "median_first_gap": first_gap_by_mover[name],
            }
            for name, part in speed.groupby(mover[moving])
        ],
        "Position_distance_by_gap_length": distance_by_gap,
        "human_file_starts_by_utc_hour": {
            "busiest_six_hours": {"from_utc_hour": six_hours.idxmax(), "files": six_hours.max()},
            "quietest_six_hours": {"from_utc_hour": six_hours.idxmin(), "files": six_hours.min()},
        },
        "readme_sample_rows": [
            {"readme_prints": text, "raw_integer": int(pd.Timestamp(text).value // 1_000_000), "read_as_unix_seconds": _utc(pd.Timestamp(text).value // 1_000_000)}
            for text in README_SAMPLE_TS
        ],
        "sampling_skips_while_standing_still": {
            "share_of_gap_5_pairs_moving_under_half_unit": still_5.sum() / (seconds == 5).sum(),
            "share_of_Position_pairs_with_gap_over_6": long_gap.sum() / (is_position & seconds.notna()).sum(),
            "share_of_Position_time_inside_gaps_over_6": seconds[long_gap].sum() / seconds[is_position].sum(),
        },
        "rows_where_ts_goes_backwards": [
            {"file": _short_file(r.file), "file_rows": int(files.loc[r.file, "rows"]), "row": r.row, "event": r.event, "jump": step[r.Index], "file_written_twice": bool(doubled[r.file])}
            for r in rows[backwards].itertuples()
        ],
        "files_whose_date_differs_from_folder": mismatch,
        "files_whose_last_row_utc_date_differs_from_folder": [
            {"file": _short_file(file), "last_row": _utc(last)}
            for file, last in files.loc[_folder_label(files["last_ts"]) != files["day"], "last_ts"].items()
        ],
        "utc_offset_hours_that_best_matches_folders": {"offset": best_offset, "files_matching": fits[best_offset], "files": len(files)},
        "per_folder_range_utc": [{"folder": day, "first": _utc(r["first"]), "last": _utc(r["last"])} for day, r in per_folder.iterrows()],
    }


def matches(rows: pd.DataFrame, files: pd.DataFrame, m: Metrics) -> dict[str, object]:
    topic = "matches_quality"
    flat = files.reset_index()
    per_match = flat.groupby("match_id").agg(
        map_id=("map_id", "first"),
        day=("day", "min"),
        files=("file", "size"),
        rows=("rows", "sum"),
        first_ts=("first_ts", "min"),
        last_ts=("last_ts", "max"),
    )
    for column, mask in (
        ("uuid_users", flat["id_kind"] == "uuid"),
        ("numeric_users", flat["id_kind"] == "numeric"),
        ("human_journeys", flat["actor"] == "human"),
        ("bot_journeys", flat["actor"] == "bot"),
    ):
        per_match[column] = flat[mask].groupby("match_id")["user_id"].nunique().reindex(per_match.index, fill_value=0)
    per_match["duration"] = per_match["last_ts"] - per_match["first_ts"]
    journeys = flat.groupby(["user_id", "match_id"])["file"].size()

    m.add(topic, "distinct_matches", len(per_match), "Distinct match_id values.")
    for map_id, count in per_match["map_id"].value_counts().sort_index().items():
        m.add(topic, f"matches_{map_id}", count, f"Distinct match_ids whose map_id is {map_id}.")
    for day, count in flat.groupby("day")["match_id"].nunique().items():
        m.add(topic, f"matches_in_{day}", count, f"Distinct match_ids with at least one file in {day}/.")
    m.add(topic, "matches_single_file", (per_match["files"] == 1).sum(), "match_ids that have exactly one file in the dataset.")
    m.add(topic, "matches_max_files", per_match["files"].max(), "Largest number of files sharing one match_id.")
    for count, total in per_match["uuid_users"].value_counts().sort_index().items():
        m.add(topic, f"matches_with_{count}_uuid_users", total, f"match_ids with exactly {count} distinct UUID user_ids.")
    for count, total in per_match["human_journeys"].value_counts().sort_index().items():
        m.add(topic, f"matches_with_{count}_Position_users", total, f"match_ids with exactly {count} distinct user_ids whose file contains Position rows.")
    m.add(topic, "matches_with_numeric_id_files", (per_match["numeric_users"] > 0).sum(), "match_ids with at least one file whose user_id is numeric.")
    m.add(topic, "matches_with_BotPosition_files", (per_match["bot_journeys"] > 0).sum(), "match_ids with at least one file containing BotPosition rows.")
    m.add(topic, "journeys", len(journeys), "Distinct (user_id, match_id) pairs.")
    m.add(topic, "journeys_in_several_files", (journeys > 1).sum(), "Distinct (user_id, match_id) pairs that occur in more than one file.")
    single_file_matches = per_match.index[per_match["files"] == 1]
    m.add(topic, "BotKill_rows_in_single_file_matches", flat.loc[flat["match_id"].isin(single_file_matches), "BotKill"].sum(), "BotKill rows in matches that have exactly one file in the dataset.")
    m.add(topic, "rows_median_single_file_matches", per_match.loc[single_file_matches, "rows"].median(), "Median row count of the matches that have exactly one file.")
    m.add(topic, "distinct_match_id_prefixes_8", pd.Series(per_match.index).str[:8].nunique(), "Distinct values of the first eight characters of match_id.")
    uuid_ids = pd.Series(flat.loc[flat["id_kind"] == "uuid", "user_id"].unique())
    m.add(topic, "distinct_uuid_user_id_prefixes_8", uuid_ids.str[:8].nunique(), "Distinct values of the first eight characters of the UUID user_ids.")
    human_only = per_match[(per_match["bot_journeys"] == 0)]
    with_bot_files = per_match[(per_match["bot_journeys"] > 0)]
    m.add(topic, "match_span_median_without_bot_files", human_only["duration"].median(), "Median (largest raw ts - smallest raw ts) over matches that have no file with BotPosition rows.")
    m.add(topic, "match_span_median_with_bot_files", with_bot_files["duration"].median(), "Median (largest raw ts - smallest raw ts) over matches that have at least one file with BotPosition rows.")

    storm_rows = rows[rows["event"] == "KilledByStorm"].groupby("match_id").size()
    examples = {
        "most files": per_match["files"].idxmax(),
        "largest single-file match": per_match.loc[single_file_matches, "rows"].idxmax(),
        "largest match with a storm death": per_match.loc[storm_rows.index, "rows"].idxmax(),
    }

    split = []
    for (user_id, match_id), _ in journeys[journeys > 1].items():
        copies = [part.sort_values("row")[COLUMNS].reset_index(drop=True) for _, part in rows[(rows["user_id"] == user_id) & (rows["match_id"] == match_id)].groupby("file")]
        split.append({
            "journey": f"{_short(user_id)}_{_short(match_id)}",
            "folders": sorted(flat.loc[(flat["user_id"] == user_id) & (flat["match_id"] == match_id), "day"]),
            "rows_per_copy": [len(c) for c in copies],
            "copies_identical": all(c.equals(copies[0]) for c in copies[1:]),
            "first_row_utc": _utc(copies[0]["ts"].min()),
            "last_row_utc": _utc(copies[0]["ts"].max()),
            "files_of_its_match_per_folder": flat[flat["match_id"] == match_id].groupby("day").size().to_dict(),
        })
    busiest = per_match.sort_values(["files", "rows"], ascending=False).head(10).reset_index()
    busiest["match_id"] = busiest["match_id"].map(_short)
    with_bots = per_match.index[per_match["bot_journeys"] > 0]
    in_bot_matches = flat[flat["match_id"].isin(with_bots)]
    start_offset = in_bot_matches["first_ts"] - in_bot_matches["match_id"].map(per_match["first_ts"])
    return {
        "files_per_match": per_match["files"].value_counts().sort_index().to_dict(),
        "bot_journeys_per_match": per_match["bot_journeys"].value_counts().sort_index().to_dict(),
        "human_files_in_matches_that_have_bot_files_by_id_kind": in_bot_matches.loc[in_bot_matches["actor"] == "human", "id_kind"].value_counts().to_dict(),
        "seconds_from_match_start_to_first_row_in_matches_with_bot_files": {actor: _spread(part) for actor, part in start_offset.groupby(in_bot_matches["actor"])},
        "share_of_matches_with_one_file": (per_match["files"] == 1).mean(),
        "matches_by_map_and_folder": pd.crosstab(flat.drop_duplicates(["match_id", "day"])["map_id"], flat.drop_duplicates(["match_id", "day"])["day"]).reset_index().to_dict("records"),
        "duration_seconds_by_map": {map_id: _spread(part["duration"]) for map_id, part in per_match.groupby("map_id")},
        "busiest_matches": busiest[["match_id", "map_id", "day", "files", "human_journeys", "bot_journeys", "rows", "duration"]].to_dict("records"),
        "journeys_split_across_files": split,
        "matches_per_uuid_user": _spread(flat[flat["id_kind"] == "uuid"].groupby("user_id")["match_id"].nunique()),
        "example_matches": [
            {"example": name, "match_id": _short(match_id), "map_id": per_match.loc[match_id, "map_id"], "files": per_match.loc[match_id, "files"], "rows": per_match.loc[match_id, "rows"]}
            for name, match_id in examples.items()
        ],
    }


def duplicates(rows: pd.DataFrame, m: Metrics) -> dict[str, object]:
    topic = "matches_quality"
    in_file = rows.duplicated(subset=["file", *COLUMNS], keep="first")
    anywhere = rows.duplicated(subset=COLUMNS, keep="first")
    by_event = rows.loc[in_file, "event"].value_counts()

    m.add(topic, "duplicate_rows_within_file", in_file.sum(), "Rows that repeat an earlier row of the same file on all eight columns. Surplus copies only: a row present three times counts twice.")
    for event, count in by_event.sort_index().items():
        m.add(topic, f"duplicate_rows_within_file_{event}", count, f"Of those surplus rows, the ones whose event is {event}.")
    m.add(topic, "duplicate_rows_whole_dataset", anywhere.sum(), "Rows that repeat an earlier row anywhere in the dataset on all eight columns (surplus copies only).")

    backwards_files = set(rows.loc[rows.groupby("file", sort=False)["ts"].diff() < 0, "file"])
    in_backwards = rows["file"].isin(backwards_files)
    previous_identical = (rows[COLUMNS] == rows[COLUMNS].shift()).all(axis=1) & (rows["file"] == rows["file"].shift())
    loot_bursts = rows[rows["event"] == "Loot"].groupby(["file", "ts", "x", "y", "z"]).size()
    same_second = rows.duplicated(subset=["file", "ts", "event"], keep=False) & ~rows.duplicated(subset=["file", *COLUMNS], keep=False)
    return {
        "within_file_by_event": by_event.to_dict(),
        "within_file_in_the_files_whose_ts_goes_backwards": rows.loc[in_file & in_backwards, "event"].value_counts().to_dict(),
        "within_file_in_all_other_files": rows.loc[in_file & ~in_backwards, "event"].value_counts().to_dict(),
        "within_file_copies_directly_after_their_twin": {"rows": int((in_file & previous_identical).sum()), "share": (in_file & previous_identical).sum() / in_file.sum()},
        "extra_copies_only_found_across_files": int(anywhere.sum() - in_file.sum()),
        "loot_rows_per_identical_file_ts_position": loot_bursts.value_counts().sort_index().to_dict(),
        "rows_sharing_file_ts_event_but_not_position": rows.loc[same_second, "event"].value_counts().to_dict(),
    }


def deaths(rows: pd.DataFrame, files: pd.DataFrame, m: Metrics) -> dict[str, object]:
    topic = "matches_quality"
    death_rows = rows[rows["event"].isin(DEATH_EVENTS)]
    per_file = death_rows.groupby("file").agg(death_rows=("row", "size"), first_death_ts=("ts", "min"))
    joined = rows.join(per_file["first_death_ts"], on="file")
    after = joined[joined["ts"] > joined["first_death_ts"]]
    to_end = death_rows["file"].map(files["last_ts"]) - death_rows["ts"]

    m.add(topic, "files_with_death_row", len(per_file), "Files containing at least one row whose event is Killed, BotKilled or KilledByStorm.")
    m.add(topic, "files_with_several_death_rows", (per_file["death_rows"] > 1).sum(), "Files containing more than one such row.")
    m.add(topic, "rows_after_first_death", len(after), "Rows whose raw ts is strictly greater than the smallest raw ts of a death row (Killed, BotKilled, KilledByStorm) in the same file.")
    for event, count in after["event"].value_counts().sort_index().items():
        m.add(topic, f"rows_after_first_death_{event}", count, f"Of those rows, the ones whose event is {event}.")
    m.add(topic, "rows_after_first_death_max_gap", (after["ts"] - after["first_death_ts"]).max(), "Largest (row raw ts - first death raw ts) among those rows.")
    m.add(topic, "death_row_max_gap_to_file_end", to_end.max(), "Largest (file's largest raw ts - death row's raw ts) over all death rows.")
    movement = rows[rows["event"].isin(MOVEMENT_EVENTS)].sort_values("ts")[["file", "ts"]].rename(columns={"ts": "sample_ts"})
    last_sample = pd.merge_asof(death_rows.sort_values("ts")[["file", "ts"]], movement, left_on="ts", right_on="sample_ts", by="file")
    since_sample = last_sample["ts"] - last_sample["sample_ts"]
    m.add(topic, "death_row_max_gap_after_last_movement_row", since_sample.max(), "Largest (death row's raw ts - largest raw ts of a movement row at or before it in the same file) over all death rows.")
    same_second_later = joined[(joined["ts"] == joined["first_death_ts"]) & ~joined["event"].isin(DEATH_EVENTS)]
    first_death_row = death_rows.sort_values(["ts", "row"]).drop_duplicates("file").set_index("file")["row"]
    same_second_later = same_second_later[same_second_later["row"] > same_second_later["file"].map(first_death_row)]

    first_death = death_rows.sort_values(["ts", "row"]).drop_duplicates("file").set_index("file")["event"]
    fate = files.assign(fate=first_death.reindex(files.index).fillna("no death row"))
    match_start = rows.groupby("match_id")["ts"].min()
    storm = rows[rows["event"] == "KilledByStorm"]
    storm = storm.assign(seconds_into_match=storm["ts"] - storm["match_id"].map(match_start))
    late_events = after[~after["event"].isin(MOVEMENT_EVENTS)]
    return {
        "death_rows_by_actor_and_event": pd.crosstab(death_rows["file"].map(files["actor"]).rename("actor"), death_rows["event"]).reset_index().to_dict("records"),
        "files_by_actor_and_fate": pd.crosstab(fate["actor"], fate["fate"]).reset_index().to_dict("records"),
        "rows_after_first_death_by_actor": after["file"].map(files["actor"]).value_counts().to_dict(),
        "non_movement_rows_after_first_death": [
            {"file": _short_file(r.file), "event": r.event, "seconds_after_death": r.ts - r.first_death_ts} for r in late_events.itertuples()
        ],
        "seconds_after_death": _spread(after["ts"] - after["first_death_ts"]),
        "rows_in_the_same_second_as_the_death_but_later_in_file_order": same_second_later["event"].value_counts().to_dict(),
        "seconds_from_last_movement_row_to_death_row": _spread(since_sample) | {"p99": since_sample.quantile(0.99)},
        "storm_deaths_seconds_into_match_by_map": {map_id: {"deaths": len(part)} | _spread(part["seconds_into_match"]) for map_id, part in storm.groupby("map_id")},
    }


def cleaning(rows: pd.DataFrame, files: pd.DataFrame, m: Metrics) -> dict[str, object]:
    """What the four rules of pipeline/clean.py remove, applied in order, and what is left."""
    topic = "cleaning"
    flat = files.reset_index()
    after_rule_1 = keep_one_copy_per_journey(rows)
    after_rule_2 = keep_first_half_of_files_written_twice(after_rule_1)
    after_rule_3 = drop_kills_mirroring_a_death(after_rule_2)
    clean = end_paths_at_death(after_rule_3)
    spare_files = set(rows["file"]) - set(after_rule_1["file"])

    # Rule 4's input in the order the rule uses, to describe the rows it removed.
    ordered = after_rule_3.sort_values(["file", "ts", "row"])
    is_death = ordered["event"].isin(DEATH_EVENTS)
    comes_after_death = after_death(ordered)
    death_ts = ordered["ts"].where(is_death).groupby(ordered["file"], sort=False).transform("min")
    late = ~ordered.index.isin(clean.index)

    m.add(topic, "rows_removed_spare_copy_of_journey", len(rows) - len(after_rule_1), "Rule 1. Rows of files holding a (user_id, match_id) journey that another file also holds. Among such files the one kept is the one whose day folder holds the most files of the same match (ties: first by name).")
    m.add(topic, "rows_removed_second_half_of_file_written_twice", len(after_rule_1) - len(after_rule_2), "Rule 2. Rows in the second half of the remaining files whose second half repeats the first half exactly.")
    m.add(topic, "rows_removed_Kill_mirroring_Killed", len(after_rule_2) - len(after_rule_3), "Rule 3. Remaining Kill rows for which a Killed row exists in the same file with identical raw ts, x, y and z.")
    m.add(topic, "rows_removed_movement_after_death", late.sum(), "Rule 4. Remaining Position or BotPosition rows that come after a death row (Killed, BotKilled, KilledByStorm) of the same file, rows ordered by (raw ts, file order).")
    m.add(topic, "rows_removed_movement_after_death_with_later_ts", (late & (ordered["ts"] > death_ts)).sum(), "Of the rule 4 rows, the ones whose raw ts is greater than that of the file's first death row. The rest share the death row's ts and follow it in file order.")
    m.add(topic, "rows_after_cleaning", len(clean), "Rows left after rules 1 to 4.")
    for event in EVENTS:
        m.add(topic, f"rows_after_cleaning_{event}", (clean["event"] == event).sum(), f"Rows left after rules 1 to 4 whose event is {event}.")

    actor = clean["file"].map(files["actor"])
    death_rows = clean[clean["event"].isin(DEATH_EVENTS)]
    deaths_per_journey = death_rows.groupby("file").size()
    surplus = clean.duplicated(subset=["file", *COLUMNS], keep="first")
    directly_after_twin = surplus & (clean[COLUMNS] == clean[COLUMNS].shift()).all(axis=1)
    kept_after_death = clean[comes_after_death[clean.index] & ~clean["event"].isin(DEATH_EVENTS)]
    m.add(topic, "journeys_after_cleaning", clean["file"].nunique(), "Files left after rules 1 to 4; each holds one (user_id, match_id) journey.")
    m.add(topic, "journeys_after_cleaning_Position", clean.loc[actor == "human", "file"].nunique(), "Of those journeys, the ones with Position rows.")
    m.add(topic, "journeys_after_cleaning_BotPosition", clean.loc[actor == "bot", "file"].nunique(), "Of those journeys, the ones with BotPosition rows.")
    m.add(topic, "journeys_after_cleaning_with_death_row", len(deaths_per_journey), "Journeys left after rules 1 to 4 that contain a death row.")
    m.add(topic, "journeys_after_cleaning_with_several_death_rows", (deaths_per_journey > 1).sum(), "Journeys left after rules 1 to 4 that contain more than one death row.")
    m.add(topic, "journeys_after_cleaning_Position_with_death_row", death_rows.loc[death_rows["file"].map(files["actor"]) == "human", "file"].nunique(), "Journeys with Position rows left after rules 1 to 4 that contain a death row.")
    m.add(topic, "rows_kept_after_death_row", len(kept_after_death), "Rows left after rules 1 to 4 that come after a death row of the same file in (raw ts, file order) and are not death rows themselves.")
    m.add(topic, "identical_rows_left_after_cleaning", surplus.sum(), "Rows left after rules 1 to 4 that repeat an earlier row of the same file on all eight columns (surplus copies only).")
    for event, count in clean.loc[surplus, "event"].value_counts().sort_index().items():
        m.add(topic, f"identical_rows_left_after_cleaning_{event}", count, f"Of those surplus rows, the ones whose event is {event}.")
    m.add(topic, "identical_rows_left_directly_after_twin", directly_after_twin.sum(), "Of those surplus rows, the ones identical to the row directly before them in (raw ts, file order).")
    m.add(topic, "matches_in_several_day_folders_after_cleaning", (clean.groupby("match_id")["day"].nunique() > 1).sum(), "match_ids left with files in more than one day folder after rules 1 to 4.")
    for day, count in clean.groupby("day")["match_id"].nunique().items():
        m.add(topic, f"matches_after_cleaning_in_{day}", count, f"Distinct match_ids with at least one file in {day}/ after rules 1 to 4.")
    span = clean.groupby("match_id")["ts"].max() - clean.groupby("match_id")["ts"].min()
    span_lost = (rows.groupby("match_id")["ts"].max() - rows.groupby("match_id")["ts"].min()) - span
    m.add(topic, "match_span_median_after_cleaning", span.median(), "Median over match_ids of (largest raw ts - smallest raw ts) across the rows left after rules 1 to 4.")
    m.add(topic, "match_span_max_after_cleaning", span.max(), "Maximum over match_ids of (largest raw ts - smallest raw ts) across the rows left after rules 1 to 4.")
    m.add(topic, "matches_with_shorter_span_after_cleaning", (span_lost > 0).sum(), "match_ids whose span over the rows left after rules 1 to 4 is smaller than their span over all rows.")
    m.add(topic, "match_span_largest_loss_from_cleaning", span_lost.max(), "Largest difference, over match_ids, between the span over all rows and the span over the rows left after rules 1 to 4.")
    for who in ("human", "bot"):
        for event in ("BotKill", "BotKilled", "Killed", "KilledByStorm", "Loot"):
            m.add(topic, f"rows_after_cleaning_{who}_{event}", ((actor == who) & (clean["event"] == event)).sum(), f"Rows left after rules 1 to 4 whose event is {event}, in files with {'Position' if who == 'human' else 'BotPosition'} rows.")

    first_death = death_rows.drop_duplicates("file").set_index("file")["event"]
    journeys = files.loc[clean["file"].unique()]
    fate = journeys.assign(fate=first_death.reindex(journeys.index).fillna("no death row"))
    who = np.where(fate["actor"] == "bot", "bot", np.where(fate["id_kind"] == "uuid", "human, uuid id", "human, numeric id"))
    return {
        "copy_kept_of_journeys_stored_twice": sorted(_short_file(f) for f in flat.loc[flat.duplicated(["user_id", "match_id"], keep=False) & ~flat["file"].isin(spare_files), "file"]),
        "journeys_by_fate_after_cleaning": pd.crosstab(pd.Series(who, index=fate.index, name="journey"), fate["fate"]).reset_index().to_dict("records"),
        "rows_kept_after_death_row_by_event": kept_after_death["event"].value_counts().to_dict(),
    }


def _partners_in_other_files(first: pd.DataFrame, partner: pd.DataFrame) -> dict[str, object]:
    """Rows of ``first`` that have a ``partner`` row in the same match, in another file, within one second."""
    both = first.merge(partner, on="match_id", suffixes=("_a", "_b"))
    both = both[(both["file_a"] != both["file_b"]) & ((both["ts_a"] - both["ts_b"]).abs() <= 1)]
    distance = np.hypot(both["x_a"] - both["x_b"], both["z_a"] - both["z_b"])
    nearest = distance.groupby([both["file_a"], both["row_a"]]).min()
    return {
        "rows": len(first),
        "rows_with_a_partner_within_1s": len(nearest),
        "median_distance_to_nearest_partner": nearest.median() if len(nearest) else None,
        "partners_at_identical_position": int((nearest == 0).sum()),
    }


def combat(rows: pd.DataFrame, files: pd.DataFrame, m: Metrics) -> dict[str, object]:
    topic = "actors_events"
    actor = rows["file"].map(files["actor"])
    kills, killed = rows[rows["event"] == "Kill"], rows[rows["event"] == "Killed"]
    twins = kills.merge(killed, on=["file", "ts", "x", "y", "z"])
    seconds_to_end = twins["file"].map(files["last_ts"]) - twins["ts"]

    def of(event: str, who: str) -> pd.DataFrame:
        return rows[(rows["event"] == event) & (actor == who)]

    m.add(topic, "files_with_Kill_or_Killed", rows.loc[rows["event"].isin(["Kill", "Killed"]), "file"].nunique(), "Files containing at least one Kill or Killed row.")
    m.add(topic, "Kill_rows_with_Killed_twin_in_same_file", len(twins), "Kill rows for which a Killed row exists in the same file with identical raw ts, x, y and z.")
    humans_in_match = files[files["actor"] == "human"].groupby("match_id")["user_id"].nunique()
    m.add(topic, "Kill_twins_in_matches_with_several_Position_users", (twins["file"].map(files["match_id"]).map(humans_in_match) > 1).sum(), "Kill rows with such a twin whose match has more than one distinct user_id with Position rows.")
    m.add(topic, "Kill_twins_in_single_file_matches", (twins["file"].map(files["match_id"]).map(files.groupby("match_id").size()) == 1).sum(), "Kill rows with such a twin whose match has exactly one file in the dataset.")
    bot_deaths_with_killer = _partners_in_other_files(of("BotKilled", "bot"), rows[rows["event"] == "BotKill"])
    m.add(topic, "bot_BotKilled_rows_with_BotKill_in_another_file_within_1", bot_deaths_with_killer["rows_with_a_partner_within_1s"], "BotKilled rows in files with BotPosition rows for which a BotKill row exists in another file of the same match with a raw ts at most 1 away.")

    movement = rows[rows["event"].isin(MOVEMENT_EVENTS)].sort_values("ts")[["file", "ts", "x", "z"]]
    others = rows[~rows["event"].isin(MOVEMENT_EVENTS)].sort_values("ts")[["file", "ts", "x", "z", "event"]]
    near = pd.merge_asof(others, movement.rename(columns={"ts": "sample_ts", "x": "sample_x", "z": "sample_z"}), left_on="ts", right_on="sample_ts", by="file", direction="nearest")
    near["distance"] = np.hypot(near["x"] - near["sample_x"], near["z"] - near["sample_z"])
    near["actor"] = near["file"].map(files["actor"])
    to_own_path = near.groupby(["actor", "event"])["distance"].agg(rows="size", median="median", p90=lambda s: s.quantile(0.9), max="max")

    return {
        "Kill_and_Killed_twins": {"twins": len(twins), "max_seconds_from_twin_to_end_of_file": seconds_to_end.max() if len(twins) else None},
        "rows_paired_with_rows_in_another_file": {
            "human BotKill, partner bot BotKilled": _partners_in_other_files(of("BotKill", "human"), of("BotKilled", "bot")),
            "bot BotKill, partner human BotKilled": _partners_in_other_files(of("BotKill", "bot"), of("BotKilled", "human")),
            "bot BotKill, partner bot BotKilled": _partners_in_other_files(of("BotKill", "bot"), of("BotKilled", "bot")),
            "bot BotKilled, partner any BotKill": bot_deaths_with_killer,
        },
        "distance_from_event_row_to_nearest_movement_sample_of_same_file": to_own_path.reset_index().to_dict("records"),
    }


def coordinates(rows: pd.DataFrame, raw_root: Path, m: Metrics) -> dict[str, object]:
    topic = "coordinates"
    detail = {}
    for map_id, cfg in sorted(MAPS.items()):
        part = rows[rows["map_id"] == map_id]
        for axis in ("x", "y", "z"):
            m.add(topic, f"{map_id}_{axis}_min", part[axis].min(), f"Smallest {axis} among rows whose map_id is {map_id}.")
            m.add(topic, f"{map_id}_{axis}_max", part[axis].max(), f"Largest {axis} among rows whose map_id is {map_id}.")
        u, v = world_to_uv(map_id, part["x"].to_numpy(np.float64), part["z"].to_numpy(np.float64))
        outside = (u < 0) | (u > 1) | (v < 0) | (v > 1)
        m.add(topic, f"{map_id}_rows_outside_image", outside.sum(), f"Rows of {map_id} whose u or v lies outside [0, 1], with u = (x - origin_x) / scale and v = (z - origin_z) / scale from the README table.")
        for name, values in (("u", u), ("v", v)):
            m.add(topic, f"{map_id}_{name}_min", values.min(), f"Smallest {name} among rows of {map_id} (README formula).")
            m.add(topic, f"{map_id}_{name}_max", values.max(), f"Largest {name} among rows of {map_id} (README formula).")
        with Image.open(raw_root / "minimaps" / cfg.minimap_file) as image:
            width, height = image.size
            detail[map_id] = {"minimap_file": cfg.minimap_file, "format": image.format, "mode": image.mode, "width": width, "height": height, "rows": len(part)}
        m.add(topic, f"{map_id}_minimap_width", width, f"Pixel width of minimaps/{cfg.minimap_file}.")
        m.add(topic, f"{map_id}_minimap_height", height, f"Pixel height of minimaps/{cfg.minimap_file}.")
    xyz = rows[["x", "y", "z"]].to_numpy()
    m.add(topic, "rows_with_nan_or_infinite_coordinate", (~np.isfinite(xyz)).any(axis=1).sum(), "Rows where x, y or z is NaN or infinite.")
    m.add(topic, "rows_at_x0_z0", ((rows["x"] == 0) & (rows["z"] == 0)).sum(), "Rows where x and z are both exactly 0.")
    u, v = world_to_uv(README_EXAMPLE.map_id, README_EXAMPLE.x, README_EXAMPLE.z)
    px, py = uv_to_pixel(u, v, README_EXAMPLE.image_size, README_EXAMPLE.image_size)
    m.add(topic, "readme_example_pixel_x", round(px), "README worked example (AmbroseValley, x=-301.45, z=-355.55, 1024 px image): pixel_x = u * 1024, rounded to the nearest integer.")
    m.add(topic, "readme_example_pixel_y", round(py), "Same example: pixel_y = (1 - v) * 1024, rounded to the nearest integer.")
    return {"per_map": detail}


def readme_check(m: Metrics, details: dict[str, dict[str, object]]) -> list[dict[str, object]]:
    """The README's checkable claims next to what the files contain."""
    files = m.value("files_schema", "files_total")
    rows = m.value("files_schema", "rows_total")
    sizes = {k: f"{v['width']}x{v['height']}" for k, v in details["coordinates"]["per_map"].items()}
    per_day = {day: m.value("files_schema", f"files_{day}") for day in README_FILES_PER_DAY}
    movement_share = details["events"]["movement_share_of_rows"]
    uuid_ids = m.value("actors_events", "distinct_uuid_user_ids")
    numeric_ids = m.value("actors_events", "distinct_numeric_user_ids")
    placeholder_ids = m.value("actors_events", "numeric_user_ids_with_Position")
    matches_total = m.value("matches_quality", "distinct_matches")
    numeric_human_files = m.value("actors_events", "files_numeric_with_Position")
    file_span = details["timestamps"]["file_span"]["if_seconds"]
    checks = [
        ("Total files", 1243, files, files == 1243),
        ("Files per day folder", README_FILES_PER_DAY, per_day, per_day == README_FILES_PER_DAY),
        ("Total event rows", "~89,000", rows, round(rows, -3) == 89_000),
        ("Unique matches", 796, matches_total, matches_total == 796),
        ("Unique players", 339, f"{m.value('actors_events', 'distinct_user_ids')} distinct user_ids = {uuid_ids} UUIDs + {numeric_ids} numeric ids. The numeric ids are bot ids, except {placeholder_ids} that stand on {numeric_human_files} files with Position rows, one id per map", "partly"),
        ("Event types", 8, m.value("files_schema", "distinct_event_values"), not details["schema"]["event_values_not_in_readme"]),
        ("Position events are ~85%+ of rows", ">= 85%", f"{movement_share:.1%} (Position + BotPosition)", movement_share >= 0.85),
        ("Minimap images are 1024x1024", "1024x1024", sizes, all(s == "1024x1024" for s in sizes.values())),
        ("ts is milliseconds elapsed within the match", "match-relative ms", f"raw values {m.value('time', 'raw_ts_min')} to {m.value('time', 'raw_ts_max')} are Unix seconds ({details['timestamps']['raw_range_read_as_unix_seconds']['first']} to {details['timestamps']['raw_range_read_as_unix_seconds']['last']}); a file spans {file_span['median']:.0f} raw units at the median", False),
        ("UUID user_id = human, numeric user_id = bot", "no exceptions", f"{numeric_human_files} files with a numeric user_id contain Position rows", numeric_human_files == 0),
    ]
    verdict = {True: "yes", False: "no"}
    return [{"claim": claim, "readme": readme, "data": data, "holds": verdict.get(holds, holds)} for claim, readme, data, holds in checks]


# --------------------------------------------------------------------------- report


def build_report(raw_root: Path) -> dict[str, object]:
    data = load_raw(raw_root)
    rows = data.rows
    files = file_table(rows)
    m = Metrics()
    details = {
        "inventory": inventory(data, m),
        "schema": schema(data, m),
        "naming": naming(rows, files, m),
        "events": events(rows, m),
        "actors": actors(rows, files, m),
        "timestamps": timestamps(rows, files, m),
        "matches": matches(rows, files, m),
        "duplicates": duplicates(rows, m),
        "deaths": deaths(rows, files, m),
        "combat": combat(rows, files, m),
        "coordinates": coordinates(rows, raw_root, m),
        "cleaning": cleaning(rows, files, m),
    }
    return _clean({"readme_check": readme_check(m, details), "metrics": m.as_dict(), "detail_definitions": DETAIL_DEFINITIONS, "details": details})


def _title(key: str) -> str:
    return key.replace("_", " ").capitalize()


def _cell(value: object) -> str:
    if isinstance(value, dict):
        return ", ".join(f"{k}: {_cell(v)}" for k, v in value.items())
    if isinstance(value, list):
        return ", ".join(_cell(v) for v in value)
    if isinstance(value, int) and not isinstance(value, bool) and abs(value) < 10**9:
        return f"{value:,}"
    return str(value).replace("|", "\\|")


def _table(header: list[str], body: list[list[object]]) -> list[str]:
    lines = ["| " + " | ".join(header) + " |", "|" + "---|" * len(header)]
    lines += ["| " + " | ".join(_cell(c) for c in line) + " |" for line in body]
    return lines + [""]


def _render(value: object, level: int) -> list[str]:
    """Nested dicts become headings; flat dicts and lists of flat dicts become tables."""
    if isinstance(value, list) and value and all(isinstance(v, dict) for v in value):
        header = list(value[0])
        return _table(header, [[item.get(column, "") for column in header] for item in value])
    if isinstance(value, dict) and value and not any(isinstance(v, (dict, list)) for v in value.values()):
        return _table(["", "value"], [[key, item] for key, item in value.items()])
    if isinstance(value, dict):
        lines = []
        for key, item in value.items():
            if isinstance(item, (dict, list)) and item:
                lines += ["#" * level + " " + _title(key), "", *_render(item, level + 1)]
            else:
                lines += [f"{_title(key)}: {_cell(item) if item not in ([], {}) else 'none'}", ""]
        return lines
    return [_cell(value), ""]


def render_markdown(report: dict[str, object]) -> str:
    lines = [
        "# Data profile of player_data.zip",
        "",
        "Generated by `make profile` (pipeline/profile_data.py). Do not edit by hand.",
        "Every number comes from the 1,243 raw files; ids are cut to eight characters.",
        "`ts` values are the raw integers stored in the files.",
        "",
        "## README claims against the data",
        "",
        *_table(["Claim", "README", "Data", "Holds"], [[c["claim"], c["readme"], c["data"], c["holds"]] for c in report["readme_check"]]),
        "## Metrics",
        "",
        "Each value is listed with the exact definition used to compute it.",
        "",
    ]
    for topic, entries in report["metrics"].items():
        lines += [f"### {_title(topic)}", "", *_table(["Metric", "Value", "Definition"], [[f"`{key}`", entry["value"], entry["definition"]] for key, entry in entries.items()])]
    lines += ["## Details", "", *_table(["Entry", "How it is computed"], [[key, text] for key, text in report["detail_definitions"].items()])]
    for section, detail in report["details"].items():
        lines += [f"### {_title(section)}", "", *_render(detail, 4)]
    return "\n".join(lines).rstrip() + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--raw", type=Path, default=Path("data/raw/player_data"), help="the unzipped player_data folder")
    parser.add_argument("--out", type=Path, default=Path("docs/profile"), help="folder for profile_report.json and .md")
    args = parser.parse_args()

    report = build_report(args.raw)
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "profile_report.json").write_text(json.dumps(report, indent=2) + "\n")
    (args.out / "profile_report.md").write_text(render_markdown(report))
    metric_count = sum(len(t) for t in report["metrics"].values())
    print(f"{metric_count} metrics written to {args.out}/profile_report.json and .md")
    print("README claims against the data:")
    for check in report["readme_check"]:
        print(f"  {check['holds']:>6}  {check['claim']}")


if __name__ == "__main__":
    main()
