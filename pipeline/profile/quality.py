"""What the cleaning rules have to deal with: rows that repeat, and rows recorded around a death."""
from __future__ import annotations

import pandas as pd

from pipeline.dataset import COLUMNS, DEATH_EVENTS, MOVEMENT_EVENTS
from pipeline.profile.metrics import Metrics, Section
from pipeline.profile.timestamps import ts_steps
from pipeline.profile.values import short_file, spread

DEFINITIONS = {
    "duplicate_rows_within_file": (
        "Rows that repeat an earlier row of the same file on all eight columns. "
        "Surplus copies only: a row present three times counts twice."
    ),
    "duplicate_rows_within_file_{event}": "Of those surplus rows, the ones whose event is {event}.",
    "duplicate_rows_whole_dataset": "Rows that repeat an earlier row anywhere in the dataset on all eight columns (surplus copies only).",
    "files_with_death_row": "Files containing at least one row whose event is Killed, BotKilled or KilledByStorm.",
    "files_with_several_death_rows": "Files containing more than one such row.",
    "rows_after_first_death": (
        "Rows whose raw ts is strictly greater than the smallest raw ts of a death row "
        "(Killed, BotKilled, KilledByStorm) in the same file."
    ),
    "rows_after_first_death_{event}": "Of those rows, the ones whose event is {event}.",
    "rows_after_first_death_max_gap": "Largest (row raw ts - first death raw ts) among those rows.",
    "death_row_max_gap_to_file_end": "Largest (file's largest raw ts - death row's raw ts) over all death rows.",
    "death_row_max_gap_after_last_movement_row": (
        "Largest (death row's raw ts - largest raw ts of a movement row at or before it in the same file) over all death rows."
    ),
}


def with_fate(rows: pd.DataFrame, files: pd.DataFrame) -> pd.DataFrame:
    """The files with a ``fate`` column: the event of the file's first death row in (ts, file order), or 'no death row'."""
    death_rows = rows[rows["event"].isin(DEATH_EVENTS)]
    first_death = death_rows.sort_values(["ts", "row"]).drop_duplicates("file").set_index("file")["event"]
    return files.assign(fate=first_death.reindex(files.index).fillna("no death row"))


def duplicates(rows: pd.DataFrame) -> Section:
    """Rows that repeat an earlier row on all eight columns: how many, of which event, and where they sit in their file."""
    in_file = rows.duplicated(subset=["file", *COLUMNS], keep="first")
    anywhere = rows.duplicated(subset=COLUMNS, keep="first")
    by_event = rows.loc[in_file, "event"].value_counts()

    found = Metrics(DEFINITIONS)
    found.add("duplicate_rows_within_file", in_file.sum())
    for event, count in by_event.sort_index().items():
        found.add("duplicate_rows_within_file_{event}", count, event=event)
    found.add("duplicate_rows_whole_dataset", anywhere.sum())

    in_backwards = rows["file"].isin(set(rows.loc[ts_steps(rows) < 0, "file"]))  # files in which ts goes backwards
    after_twin = in_file & (rows[COLUMNS] == rows[COLUMNS].shift()).all(axis=1) & (rows["file"] == rows["file"].shift())
    loot_bursts = rows[rows["event"] == "Loot"].groupby(["file", "ts", "x", "y", "z"]).size()
    same_second = rows.duplicated(subset=["file", "ts", "event"], keep=False) & ~rows.duplicated(subset=["file", *COLUMNS], keep=False)
    details = {
        "within_file_by_event": by_event.to_dict(),
        "within_file_in_the_files_whose_ts_goes_backwards": rows.loc[in_file & in_backwards, "event"].value_counts().to_dict(),
        "within_file_in_all_other_files": rows.loc[in_file & ~in_backwards, "event"].value_counts().to_dict(),
        "within_file_copies_directly_after_their_twin": {"rows": int(after_twin.sum()), "share": after_twin.sum() / in_file.sum()},
        "extra_copies_only_found_across_files": int(anywhere.sum() - in_file.sum()),
        "loot_rows_per_identical_file_ts_position": loot_bursts.value_counts().sort_index().to_dict(),
        "rows_sharing_file_ts_event_but_not_position": rows.loc[same_second, "event"].value_counts().to_dict(),
    }
    return found.as_dict(), details


def deaths(rows: pd.DataFrame, files: pd.DataFrame) -> Section:
    """Death rows per file, what is recorded after a file's first death row, and when the storm kills."""
    death_rows = rows[rows["event"].isin(DEATH_EVENTS)]
    per_file = death_rows.groupby("file").agg(death_rows=("row", "size"), first_death_ts=("ts", "min"))
    with_death = rows.join(per_file["first_death_ts"], on="file")  # every row next to the ts of its file's first death row
    after = with_death[with_death["ts"] > with_death["first_death_ts"]]
    late_events = after[~after["event"].isin(MOVEMENT_EVENTS)]
    since_sample = _seconds_since_last_movement_row(rows, death_rows)
    actor_of_death = death_rows["file"].map(files["actor"]).rename("actor")
    fate = with_fate(rows, files)

    found = Metrics(DEFINITIONS)
    found.add("files_with_death_row", len(per_file))
    found.add("files_with_several_death_rows", (per_file["death_rows"] > 1).sum())
    found.add("rows_after_first_death", len(after))
    for event, count in after["event"].value_counts().sort_index().items():
        found.add("rows_after_first_death_{event}", count, event=event)
    found.add("rows_after_first_death_max_gap", (after["ts"] - after["first_death_ts"]).max())
    found.add("death_row_max_gap_to_file_end", (death_rows["file"].map(files["last_ts"]) - death_rows["ts"]).max())
    found.add("death_row_max_gap_after_last_movement_row", since_sample.max())
    details = {
        "death_rows_by_actor_and_event": pd.crosstab(actor_of_death, death_rows["event"]).reset_index().to_dict("records"),
        "files_by_actor_and_fate": pd.crosstab(fate["actor"], fate["fate"]).reset_index().to_dict("records"),
        "rows_after_first_death_by_actor": after["file"].map(files["actor"]).value_counts().to_dict(),
        "non_movement_rows_after_first_death": [
            {"file": short_file(r.file), "event": r.event, "seconds_after_death": r.ts - r.first_death_ts}
            for r in late_events.itertuples()
        ],
        "seconds_after_death": spread(after["ts"] - after["first_death_ts"]),
        "rows_in_the_same_second_as_the_death_but_later_in_file_order": (
            _same_second_but_later(with_death, death_rows)["event"].value_counts().to_dict()
        ),
        "seconds_from_last_movement_row_to_death_row": spread(since_sample) | {"p99": since_sample.quantile(0.99)},
        "storm_deaths_seconds_into_match_by_map": _storm_deaths_by_map(rows),
    }
    return found.as_dict(), details


def _seconds_since_last_movement_row(rows: pd.DataFrame, death_rows: pd.DataFrame) -> pd.Series:
    """For every death row: its raw ts minus that of the last movement row at or before it in the same file."""
    movement = rows[rows["event"].isin(MOVEMENT_EVENTS)].sort_values("ts")[["file", "ts"]].rename(columns={"ts": "sample_ts"})
    last_sample = pd.merge_asof(death_rows.sort_values("ts")[["file", "ts"]], movement, left_on="ts", right_on="sample_ts", by="file")
    return last_sample["ts"] - last_sample["sample_ts"]


def _same_second_but_later(with_death: pd.DataFrame, death_rows: pd.DataFrame) -> pd.DataFrame:
    """Rows that share the ts of their file's first death row, are not death rows, and come after it in file order."""
    first_death_row = death_rows.sort_values(["ts", "row"]).drop_duplicates("file").set_index("file")["row"]
    same_second = with_death[(with_death["ts"] == with_death["first_death_ts"]) & ~with_death["event"].isin(DEATH_EVENTS)]
    return same_second[same_second["row"] > same_second["file"].map(first_death_row)]


def _storm_deaths_by_map(rows: pd.DataFrame) -> dict[str, dict[str, object]]:
    """Per map: the storm deaths, and how many seconds after the first row of their match they happen."""
    match_start = rows.groupby("match_id")["ts"].min()
    storm = rows[rows["event"] == "KilledByStorm"]
    storm = storm.assign(seconds_into_match=storm["ts"] - storm["match_id"].map(match_start))
    return {map_id: {"deaths": len(part)} | spread(part["seconds_into_match"]) for map_id, part in storm.groupby("map_id")}
