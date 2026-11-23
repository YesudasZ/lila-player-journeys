"""The four cleaning rules, applied in order (docs/DATA_NOTES.md, "Cleaning").

Each rule is a pure function from rows to rows, where rows are what
``pipeline.dataset.load_raw`` returns. ``clean`` runs the rules in order and
reports how many rows each one removed.
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import pandas as pd

from pipeline.dataset import COLUMNS, DEATH_EVENTS, MOVEMENT_EVENTS


@dataclass(frozen=True)
class Cleaned:
    rows: pd.DataFrame  # ordered by file, then by (ts, row order in the file)
    removed: dict[str, int]  # rows removed per rule, in the order the rules ran


def _content(rows: pd.DataFrame, file: str) -> pd.DataFrame:
    return rows.loc[rows["file"] == file].sort_values("row")[COLUMNS].reset_index(drop=True)


def keep_one_copy_per_journey(rows: pd.DataFrame) -> pd.DataFrame:
    """Rule 1. A journey stored in several files keeps the copy filed with most of its match.

    "Filed with" means the day folder; a tie goes to the first file by name.
    The copies have to be identical. A journey really split over several files
    would need merging, not dropping, so differing copies are an error.
    """
    files = rows.drop_duplicates("file")[["file", "day", "user_id", "match_id"]]
    weight = files.groupby(["match_id", "day"])["file"].transform("size")
    ranked = files.assign(weight=weight).sort_values(["weight", "file"], ascending=[False, True])
    kept = ranked.drop_duplicates(["user_id", "match_id"]).set_index(["user_id", "match_id"])["file"]
    spare = ranked[ranked.duplicated(["user_id", "match_id"])]
    for copy in spare.itertuples():
        original = kept[(copy.user_id, copy.match_id)]
        if not _content(rows, copy.file).equals(_content(rows, original)):
            raise ValueError(f"{copy.file} and {original} hold the same journey with different rows")
    return rows[~rows["file"].isin(spare["file"])]


def repeats_itself(file_rows: pd.DataFrame) -> bool:
    """True when a file's rows are its first half followed by an exact copy of that half."""
    half, odd = divmod(len(file_rows), 2)
    if odd or half == 0:
        return False
    return file_rows.iloc[:half].reset_index(drop=True).equals(file_rows.iloc[half:].reset_index(drop=True))


def keep_first_half_of_files_written_twice(rows: pd.DataFrame) -> pd.DataFrame:
    """Rule 2. A file whose second half repeats its first half, row for row, keeps the first half."""
    in_file_order = rows.sort_values(["file", "row"])
    by_file = in_file_order.groupby("file", sort=False)
    written_twice = by_file[COLUMNS].apply(repeats_itself)
    position = by_file.cumcount()
    half = by_file["row"].transform("size") // 2
    second_half = in_file_order["file"].map(written_twice) & (position >= half)
    return rows.drop(index=in_file_order.index[second_half])


def drop_kills_mirroring_a_death(rows: pd.DataFrame) -> pd.DataFrame:
    """Rule 3. A Kill row is not a kill when a Killed row of the same file has the same ts, x, y and z."""
    key = ["file", "ts", "x", "y", "z"]
    deaths = rows.loc[rows["event"] == "Killed", key].drop_duplicates()
    mirrored = rows.loc[rows["event"] == "Kill", key].reset_index().merge(deaths, on=key)["index"]
    return rows.drop(index=mirrored)


def end_paths_at_death(rows: pd.DataFrame) -> pd.DataFrame:
    """Rule 4. Movement rows that come after a death row of the same file, in (ts, file order), are dropped.

    Other rows after the death, such as a kill that lands late, are kept.
    The result is ordered by file, then by (ts, row order in the file).
    """
    ordered = rows.sort_values(["file", "ts", "row"])
    is_death = ordered["event"].isin(DEATH_EVENTS)
    after_death = (is_death.groupby(ordered["file"], sort=False).cumsum() - is_death) > 0
    return ordered[~(after_death & ordered["event"].isin(MOVEMENT_EVENTS))]


RULES: tuple[tuple[str, Callable[[pd.DataFrame], pd.DataFrame]], ...] = (
    ("spare_copy_of_journey", keep_one_copy_per_journey),
    ("second_half_of_file_written_twice", keep_first_half_of_files_written_twice),
    ("kill_mirroring_killed", drop_kills_mirroring_a_death),
    ("movement_after_death", end_paths_at_death),
)


def clean(rows: pd.DataFrame) -> Cleaned:
    """Apply the four rules in order."""
    removed = {}
    for name, rule in RULES:
        kept = rule(rows)
        removed[name] = len(rows) - len(kept)
        rows = kept
    return Cleaned(rows=rows.reset_index(drop=True), removed=removed)
