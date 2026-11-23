"""What is on disk: the files, their Parquet schema, and whether a file's name agrees with the rows inside it."""
from __future__ import annotations

from collections import Counter

import pandas as pd

from pipeline.dataset import COLUMNS, EVENTS, RawData, short_ids
from pipeline.journeys import actor_by_file
from pipeline.profile.metrics import Metrics, Section

DEFINITIONS = {
    "files_total": "Regular files inside the February_* day folders.",
    "files_{day}": "Regular files inside {day}/.",
    "files_named_nakama0": "Files whose name ends in .nakama-0.",
    "files_named_parquet": "Files whose name ends in .parquet.",
    "files_par1_magic": "Files whose first four and last four bytes are both PAR1, the Parquet magic number.",
    "files_unreadable": "Files that a Parquet reader fails to open or read.",
    "rows_total": "Rows summed over all files.",
    "rows_{day}": "Rows summed over the files in {day}/.",
    "rows_per_file_min": "Smallest row count of any file.",
    "rows_per_file_median": "Median row count per file.",
    "rows_per_file_max": "Largest row count of any file.",
    "distinct_schemas": "Distinct combinations of column names, column types and nullability across files.",
    "null_values_total": "Null values summed over the eight data columns of all files.",
    "distinct_event_values": "Distinct values of the event column after decoding its bytes as UTF-8.",
    "event_values_not_utf8": "Rows whose event bytes are not valid UTF-8.",
    "files_name_differs_from_columns": (
        "Files whose name is not exactly '<user_id>_<match_id>' built from the file's own first row "
        "(the match_id column already ends in .nakama-0)."
    ),
    "files_with_several_user_ids": "Files containing more than one distinct user_id.",
    "files_with_several_match_ids": "Files containing more than one distinct match_id.",
    "files_with_several_map_ids": "Files containing more than one distinct map_id.",
    "match_ids_without_nakama_suffix": "Distinct match_id values that do not end in .nakama-0.",
    "distinct_map_ids": "Distinct values of the map_id column.",
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


def inventory(data: RawData) -> Section:
    """Files and rows, in total and per day folder, and the files that a Parquet reader cannot read."""
    files = pd.DataFrame([vars(f) for f in data.files])
    per_day = files.groupby("day").agg(files=("file", "size"), megabytes=("size_bytes", "sum"), rows=("rows", "sum"))
    per_day["megabytes"] = per_day["megabytes"] / 1e6
    rows_per_file = files.loc[files["error"].isna(), "rows"]
    unreadable = files[files["error"].notna()]

    found = Metrics(DEFINITIONS)
    found.add("files_total", len(files))
    for day, count in per_day["files"].items():
        found.add("files_{day}", count, day=day)
    found.add("files_named_nakama0", files["name"].str.endswith(".nakama-0").sum())
    found.add("files_named_parquet", files["name"].str.endswith(".parquet").sum())
    found.add("files_par1_magic", files["has_magic"].sum())
    found.add("files_unreadable", len(unreadable))
    found.add("rows_total", len(data.rows))
    for day, count in per_day["rows"].items():
        found.add("rows_{day}", count, day=day)
    found.add("rows_per_file_min", rows_per_file.min())
    found.add("rows_per_file_median", rows_per_file.median())
    found.add("rows_per_file_max", rows_per_file.max())
    details = {
        "per_day_folder": per_day.reset_index().to_dict("records"),
        # a file name and a reader's message can both carry full ids
        "unreadable_files": [{"file": short_ids(f.file), "error": short_ids(f.error)} for f in unreadable.itertuples()],
    }
    return found.as_dict(), details


def schema(data: RawData) -> Section:
    """The Parquet schema and writer of the files, null values, and the values of the event column."""
    readable = [f for f in data.files if f.error is None]
    signatures = Counter(f.schema for f in readable)
    nulls = data.rows[COLUMNS].isna().sum()
    event_values = sorted(data.rows["event"].unique())

    found = Metrics(DEFINITIONS)
    found.add("distinct_schemas", len(signatures))
    found.add("null_values_total", nulls.sum())
    found.add("distinct_event_values", len(event_values))
    found.add("event_values_not_utf8", data.undecodable_events)
    details = {
        "arrow_schema": [{"files": count, "columns": signature} for signature, count in signatures.items()],
        "parquet_writer": dict(Counter(f.created_by for f in readable)),
        "ts_parquet_logical_type": dict(Counter(f.ts_logical_type for f in readable)),
        "nulls_per_column": nulls.to_dict(),
        "event_values": event_values,
        "event_values_not_in_readme": sorted(set(event_values) - set(EVENTS)),
    }
    return found.as_dict(), details


def naming(rows: pd.DataFrame, files: pd.DataFrame) -> Section:
    """Whether a file's name is built from the ids in its rows, and whether a file holds one user, one match and one map."""
    distinct = rows.groupby("file", sort=False).agg(
        users=("user_id", "nunique"), matches=("match_id", "nunique"), maps=("map_id", "nunique")
    )
    file_names = files.index.str.split("/").str[1]
    expected = (files["user_id"] + "_" + files["match_id"]).to_numpy()
    match_ids = pd.Series(rows["match_id"].unique())

    found = Metrics(DEFINITIONS)
    found.add("files_name_differs_from_columns", (file_names != expected).sum())
    found.add("files_with_several_user_ids", (distinct["users"] > 1).sum())
    found.add("files_with_several_match_ids", (distinct["matches"] > 1).sum())
    found.add("files_with_several_map_ids", (distinct["maps"] > 1).sum())
    found.add("match_ids_without_nakama_suffix", (~match_ids.str.endswith(".nakama-0")).sum())
    found.add("distinct_map_ids", rows["map_id"].nunique())
    return found.as_dict(), {"map_ids": sorted(rows["map_id"].unique())}
