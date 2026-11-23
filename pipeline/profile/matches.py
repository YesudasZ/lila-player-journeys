"""Matches: how many there are, how many files and players each has, and the journeys stored in more than one file."""
from __future__ import annotations

import pandas as pd

from pipeline.dataset import COLUMNS, PUBLIC_ID_LENGTH
from pipeline.profile.metrics import Entries, Metrics, Section
from pipeline.profile.values import short_id, spread, utc

DEFINITIONS = {
    "distinct_matches": "Distinct match_id values.",
    "matches_{map_id}": "Distinct match_ids whose map_id is {map_id}.",
    "matches_in_{day}": "Distinct match_ids with at least one file in {day}/.",
    "matches_single_file": "match_ids that have exactly one file in the dataset.",
    "matches_max_files": "Largest number of files sharing one match_id.",
    "matches_with_{count}_uuid_users": "match_ids with exactly {count} distinct UUID user_ids.",
    "matches_with_{count}_Position_users": "match_ids with exactly {count} distinct user_ids whose file contains Position rows.",
    "matches_with_numeric_id_files": "match_ids with at least one file whose user_id is numeric.",
    "matches_with_BotPosition_files": "match_ids with at least one file containing BotPosition rows.",
    "journeys": "Distinct (user_id, match_id) pairs.",
    "journeys_in_several_files": "Distinct (user_id, match_id) pairs that occur in more than one file.",
    "BotKill_rows_in_single_file_matches": "BotKill rows in matches that have exactly one file in the dataset.",
    "rows_median_single_file_matches": "Median row count of the matches that have exactly one file.",
    "distinct_match_id_prefixes_8": "Distinct values of the first eight characters of match_id.",
    "distinct_uuid_user_id_prefixes_8": "Distinct values of the first eight characters of the UUID user_ids.",
    "match_span_median_without_bot_files": (
        "Median (largest raw ts - smallest raw ts) over matches that have no file with BotPosition rows."
    ),
    "match_span_median_with_bot_files": (
        "Median (largest raw ts - smallest raw ts) over matches that have at least one file with BotPosition rows."
    ),
}


def matches(rows: pd.DataFrame, files: pd.DataFrame) -> Section:
    """Matches by map, day folder, files and players; journeys in several files; how long a match is recorded for."""
    flat = files.reset_index()
    table = _per_match(flat)
    files_per_journey = flat.groupby(["user_id", "match_id"])["file"].size()
    return _match_metrics(flat, table, files_per_journey), _match_details(rows, flat, table, files_per_journey)


def _per_match(flat: pd.DataFrame) -> pd.DataFrame:
    """One line per match_id: map, first day folder, files, rows, time range, distinct users by id and by actor, duration.

    ``flat`` is the file table with the file as a column. duration is the largest minus the smallest raw ts of the match.
    """
    table = flat.groupby("match_id").agg(
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
        table[column] = flat[mask].groupby("match_id")["user_id"].nunique().reindex(table.index, fill_value=0)
    table["duration"] = table["last_ts"] - table["first_ts"]
    return table


def _match_metrics(flat: pd.DataFrame, table: pd.DataFrame, files_per_journey: pd.Series) -> Entries:
    """Counts of matches and journeys, whether short ids stay unique, and the span of matches with and without bot files."""
    single_file_matches = table.index[table["files"] == 1]
    uuid_ids = pd.Series(flat.loc[flat["id_kind"] == "uuid", "user_id"].unique())
    has_bot_files = table["bot_journeys"] > 0

    found = Metrics(DEFINITIONS)
    found.add("distinct_matches", len(table))
    for map_id, count in table["map_id"].value_counts().sort_index().items():
        found.add("matches_{map_id}", count, map_id=map_id)
    for day, count in flat.groupby("day")["match_id"].nunique().items():
        found.add("matches_in_{day}", count, day=day)
    found.add("matches_single_file", (table["files"] == 1).sum())
    found.add("matches_max_files", table["files"].max())
    for count, total in table["uuid_users"].value_counts().sort_index().items():
        found.add("matches_with_{count}_uuid_users", total, count=count)
    for count, total in table["human_journeys"].value_counts().sort_index().items():
        found.add("matches_with_{count}_Position_users", total, count=count)
    found.add("matches_with_numeric_id_files", (table["numeric_users"] > 0).sum())
    found.add("matches_with_BotPosition_files", has_bot_files.sum())
    found.add("journeys", len(files_per_journey))
    found.add("journeys_in_several_files", (files_per_journey > 1).sum())
    found.add("BotKill_rows_in_single_file_matches", flat.loc[flat["match_id"].isin(single_file_matches), "BotKill"].sum())
    found.add("rows_median_single_file_matches", table.loc[single_file_matches, "rows"].median())
    # the two keys and their definitions spell out the public id length, which is 8
    found.add("distinct_match_id_prefixes_8", pd.Series(table.index).str[:PUBLIC_ID_LENGTH].nunique())
    found.add("distinct_uuid_user_id_prefixes_8", uuid_ids.str[:PUBLIC_ID_LENGTH].nunique())
    found.add("match_span_median_without_bot_files", table.loc[~has_bot_files, "duration"].median())
    found.add("match_span_median_with_bot_files", table.loc[has_bot_files, "duration"].median())
    return found.as_dict()


def _match_details(rows: pd.DataFrame, flat: pd.DataFrame, table: pd.DataFrame, files_per_journey: pd.Series) -> dict[str, object]:
    """Matches by number of files, by map and folder and by duration; matches with bot files; journeys in several files."""
    in_bot_matches = flat[flat["match_id"].isin(table.index[table["bot_journeys"] > 0])]
    start_offset = in_bot_matches["first_ts"] - in_bot_matches["match_id"].map(table["first_ts"])
    filed = flat.drop_duplicates(["match_id", "day"])
    stored_twice = files_per_journey[files_per_journey > 1].index
    return {
        "files_per_match": table["files"].value_counts().sort_index().to_dict(),
        "bot_journeys_per_match": table["bot_journeys"].value_counts().sort_index().to_dict(),
        "human_files_in_matches_that_have_bot_files_by_id_kind": (
            in_bot_matches.loc[in_bot_matches["actor"] == "human", "id_kind"].value_counts().to_dict()
        ),
        "seconds_from_match_start_to_first_row_in_matches_with_bot_files": {
            actor: spread(part) for actor, part in start_offset.groupby(in_bot_matches["actor"])
        },
        "share_of_matches_with_one_file": (table["files"] == 1).mean(),
        "matches_by_map_and_folder": pd.crosstab(filed["map_id"], filed["day"]).reset_index().to_dict("records"),
        "duration_seconds_by_map": {map_id: spread(part["duration"]) for map_id, part in table.groupby("map_id")},
        "busiest_matches": _busiest_matches(table),
        "journeys_split_across_files": [_copies_of_journey(rows, flat, user_id, match_id) for user_id, match_id in stored_twice],
        "matches_per_uuid_user": spread(flat[flat["id_kind"] == "uuid"].groupby("user_id")["match_id"].nunique()),
        "example_matches": _example_matches(rows, table),
    }


def _busiest_matches(table: pd.DataFrame) -> list[dict[str, object]]:
    """The ten matches with the most files; among matches with as many files, the ones with the most rows."""
    busiest = table.sort_values(["files", "rows"], ascending=False).head(10).reset_index()
    busiest["match_id"] = busiest["match_id"].map(short_id)
    columns = ["match_id", "map_id", "day", "files", "human_journeys", "bot_journeys", "rows", "duration"]
    return busiest[columns].to_dict("records")


def _copies_of_journey(rows: pd.DataFrame, flat: pd.DataFrame, user_id: str, match_id: str) -> dict[str, object]:
    """A journey stored in several files: where the copies are filed, whether they are identical, and when it took place."""
    of_journey = (rows["user_id"] == user_id) & (rows["match_id"] == match_id)
    copies = [part.sort_values("row")[COLUMNS].reset_index(drop=True) for _, part in rows[of_journey].groupby("file")]
    return {
        "journey": f"{short_id(user_id)}_{short_id(match_id)}",
        "folders": sorted(flat.loc[(flat["user_id"] == user_id) & (flat["match_id"] == match_id), "day"]),
        "rows_per_copy": [len(c) for c in copies],
        "copies_identical": all(c.equals(copies[0]) for c in copies[1:]),
        "first_row_utc": utc(copies[0]["ts"].min()),
        "last_row_utc": utc(copies[0]["ts"].max()),
        "files_of_its_match_per_folder": flat[flat["match_id"] == match_id].groupby("day").size().to_dict(),
    }


def _example_matches(rows: pd.DataFrame, table: pd.DataFrame) -> list[dict[str, object]]:
    """Three matches to look at: the one with the most files, the largest with one file, the largest with a storm death."""
    single_file_matches = table.index[table["files"] == 1]
    with_storm_death = rows[rows["event"] == "KilledByStorm"].groupby("match_id").size().index
    examples = {
        "most files": table["files"].idxmax(),
        "largest single-file match": table.loc[single_file_matches, "rows"].idxmax(),
        "largest match with a storm death": table.loc[with_storm_death, "rows"].idxmax(),
    }
    return [
        {
            "example": name,
            "match_id": short_id(match_id),
            "map_id": table.loc[match_id, "map_id"],
            "files": table.loc[match_id, "files"],
            "rows": table.loc[match_id, "rows"],
        }
        for name, match_id in examples.items()
    ]
