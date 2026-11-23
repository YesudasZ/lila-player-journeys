"""The four cleaning rules, applied in order (docs/DATA_NOTES.md, "Cleaning").

Each rule is a pure function from rows to rows, where rows are what
``pipeline.dataset.load_raw`` returns. ``clean`` runs the rules in order,
reports how many rows each one removed, and stops when what is left is not
what the rules were written for.
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import pandas as pd

from pipeline.dataset import COLUMNS, DEATH_EVENTS, MOVEMENT_EVENTS, short_ids


@dataclass(frozen=True)
class Cleaned:
    rows: pd.DataFrame  # ordered by file, then by (ts, row order in the file)
    removed: dict[str, int]  # rows removed per rule, in the order the rules ran


def repeats_itself(file_rows: pd.DataFrame) -> bool:
    """True when a file's rows are its first half followed by an exact copy of that half."""
    half, odd = divmod(len(file_rows), 2)
    if odd or half == 0:
        return False
    return file_rows.iloc[:half].reset_index(drop=True).equals(file_rows.iloc[half:].reset_index(drop=True))


def files_written_twice(rows: pd.DataFrame) -> pd.Series:
    """For every file, whether it ``repeats_itself``. The rows may come in any order."""
    return rows.sort_values(["file", "row"]).groupby("file", sort=False)[COLUMNS].apply(repeats_itself)


def _written_once(rows: pd.DataFrame, file: str) -> pd.DataFrame:
    """A file's rows in file order, without the second half of a file written twice (rule 2)."""
    content = rows.loc[rows["file"] == file].sort_values("row")[COLUMNS].reset_index(drop=True)
    return content.iloc[: len(content) // 2] if repeats_itself(content) else content


def keep_one_copy_per_journey(rows: pd.DataFrame) -> pd.DataFrame:
    """Rule 1. A journey stored in several files keeps the copy filed with most of its match.

    "Filed with" means the day folder; on a tie the folder that sorts first by
    name wins. The copies have to hold the same rows. A journey really split
    over several files would need merging, not dropping, so differing copies
    are an error.
    """
    files = rows.drop_duplicates("file")[["file", "day", "user_id", "match_id"]]
    weight = files.groupby(["match_id", "day"])["file"].transform("size")
    ranked = files.assign(weight=weight).sort_values(["weight", "file"], ascending=[False, True])
    kept = ranked.drop_duplicates(["user_id", "match_id"]).set_index(["user_id", "match_id"])["file"]
    spare = ranked[ranked.duplicated(["user_id", "match_id"])]
    for copy in spare.itertuples():
        original = kept[(copy.user_id, copy.match_id)]
        if not _written_once(rows, copy.file).equals(_written_once(rows, original)):
            raise ValueError(short_ids(f"{copy.file} and {original} hold the same journey with different rows"))
    return rows[~rows["file"].isin(spare["file"])]


def keep_first_half_of_files_written_twice(rows: pd.DataFrame) -> pd.DataFrame:
    """Rule 2. A file whose second half repeats its first half, row for row, keeps the first half."""
    by_file = rows.groupby("file", sort=False)["row"]
    place_in_file = by_file.rank(method="first") - 1
    in_second_half = rows["file"].map(files_written_twice(rows)) & (place_in_file >= by_file.transform("size") // 2)
    return rows[~in_second_half]


def drop_kills_mirroring_a_death(rows: pd.DataFrame) -> pd.DataFrame:
    """Rule 3. A Kill row is not a kill when a Killed row of the same file has the same ts, x, y and z."""
    key = ["file", "ts", "x", "y", "z"]
    deaths = rows.loc[rows["event"] == "Killed", key].drop_duplicates().assign(twin=True)
    has_twin = rows[key].merge(deaths, on=key, how="left")["twin"].notna().to_numpy()
    return rows[~((rows["event"] == "Kill").to_numpy() & has_twin)]


def after_death(ordered: pd.DataFrame) -> pd.Series:
    """For rows ordered by (file, ts, row): True for each row that comes after a death row of its file."""
    is_death = ordered["event"].isin(DEATH_EVENTS)
    return (is_death.groupby(ordered["file"], sort=False).cumsum() - is_death) > 0


def end_paths_at_death(rows: pd.DataFrame) -> pd.DataFrame:
    """Rule 4. Movement rows that come after a death row of the same file, in (ts, file order), are dropped.

    Other rows after the death, such as a kill that lands late, are kept.
    The result is ordered by file, then by (ts, row order in the file).
    """
    ordered = rows.sort_values(["file", "ts", "row"])
    return ordered[~(after_death(ordered) & ordered["event"].isin(MOVEMENT_EVENTS))]


RULES: tuple[tuple[str, Callable[[pd.DataFrame], pd.DataFrame]], ...] = (
    ("spare_copy_of_journey", keep_one_copy_per_journey),
    ("second_half_of_file_written_twice", keep_first_half_of_files_written_twice),
    ("kill_mirroring_killed", drop_kills_mirroring_a_death),
    ("movement_after_death", end_paths_at_death),
)


def check_cleaned(rows: pd.DataFrame) -> None:
    """Raise ValueError when cleaned rows are not what docs/DATA_NOTES.md says is left after cleaning.

    Both checks guard against writer faults the four rules do not know, such as
    a file written three times: its rows would otherwise be shuffled together
    and shipped as one path.
    """
    # the rows are ordered by (file, ts, row): a row number that drops means a ts went backwards in the file
    went_back = rows.loc[rows.groupby("file", sort=False)["row"].diff() < 0, "file"].unique()
    if len(went_back):
        raise ValueError(short_ids(f"{len(went_back)} files have rows out of time order after cleaning, e.g. {went_back[0]}"))
    deaths = rows[rows["event"].isin(DEATH_EVENTS)].groupby("file", sort=False).size()
    if (deaths > 1).any():
        raise ValueError(short_ids(f"{int((deaths > 1).sum())} journeys have more than one death row, e.g. {deaths[deaths > 1].index[0]}"))


def clean(rows: pd.DataFrame) -> Cleaned:
    """Apply the four rules in order, then check what is left."""
    removed = {}
    for name, rule in RULES:
        kept = rule(rows)
        removed[name] = len(rows) - len(kept)
        rows = kept
    check_cleaned(rows)
    return Cleaned(rows=rows.reset_index(drop=True), removed=removed)
