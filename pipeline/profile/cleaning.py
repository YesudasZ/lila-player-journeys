"""What the four cleaning rules of pipeline/clean.py remove from the raw rows, and what is left."""
from __future__ import annotations

import numpy as np
import pandas as pd

from pipeline.clean import (
    after_death,
    drop_kills_mirroring_a_death,
    end_paths_at_death,
    keep_first_half_of_files_written_twice,
    keep_one_copy_per_journey,
)
from pipeline.dataset import COLUMNS, DEATH_EVENTS, EVENTS
from pipeline.profile.metrics import Entries, Metrics, Section, joined
from pipeline.profile.quality import with_fate
from pipeline.profile.timestamps import match_span
from pipeline.profile.values import short_file

# The events that are counted apart for humans and for bots. pipeline/build_data.py reconciles its counts with these.
EVENTS_COUNTED_PER_ACTOR = ("BotKill", "BotKilled", "Killed", "KilledByStorm", "Loot")
DEFINITIONS = {
    "rows_removed_spare_copy_of_journey": (
        "Rule 1. Rows of files holding a (user_id, match_id) journey that another file also holds. Among such files "
        "the one kept is the one whose day folder holds the most files of the same match (ties: first by name)."
    ),
    "rows_removed_second_half_of_file_written_twice": (
        "Rule 2. Rows in the second half of the remaining files whose second half repeats the first half exactly."
    ),
    "rows_removed_Kill_mirroring_Killed": (
        "Rule 3. Remaining Kill rows for which a Killed row exists in the same file with identical raw ts, x, y and z."
    ),
    "rows_removed_movement_after_death": (
        "Rule 4. Remaining Position or BotPosition rows that come after a death row (Killed, BotKilled, KilledByStorm) "
        "of the same file, rows ordered by (raw ts, file order)."
    ),
    "rows_removed_movement_after_death_with_later_ts": (
        "Of the rule 4 rows, the ones whose raw ts is greater than that of the file's first death row. "
        "The rest share the death row's ts and follow it in file order."
    ),
    "rows_after_cleaning": "Rows left after rules 1 to 4.",
    "rows_after_cleaning_{event}": "Rows left after rules 1 to 4 whose event is {event}.",
    "journeys_after_cleaning": "Files left after rules 1 to 4; each holds one (user_id, match_id) journey.",
    "journeys_after_cleaning_Position": "Of those journeys, the ones with Position rows.",
    "journeys_after_cleaning_BotPosition": "Of those journeys, the ones with BotPosition rows.",
    "journeys_after_cleaning_with_death_row": "Journeys left after rules 1 to 4 that contain a death row.",
    "journeys_after_cleaning_with_several_death_rows": "Journeys left after rules 1 to 4 that contain more than one death row.",
    "journeys_after_cleaning_Position_with_death_row": "Journeys with Position rows left after rules 1 to 4 that contain a death row.",
    "rows_kept_after_death_row": (
        "Rows left after rules 1 to 4 that come after a death row of the same file in (raw ts, file order) "
        "and are not death rows themselves."
    ),
    "identical_rows_left_after_cleaning": (
        "Rows left after rules 1 to 4 that repeat an earlier row of the same file on all eight columns (surplus copies only)."
    ),
    "identical_rows_left_after_cleaning_{event}": "Of those surplus rows, the ones whose event is {event}.",
    "identical_rows_left_directly_after_twin": (
        "Of those surplus rows, the ones identical to the row directly before them in (raw ts, file order)."
    ),
    "matches_in_several_day_folders_after_cleaning": "match_ids left with files in more than one day folder after rules 1 to 4.",
    "matches_after_cleaning_in_{day}": "Distinct match_ids with at least one file in {day}/ after rules 1 to 4.",
    "match_span_median_after_cleaning": (
        "Median over match_ids of (largest raw ts - smallest raw ts) across the rows left after rules 1 to 4."
    ),
    "match_span_max_after_cleaning": (
        "Maximum over match_ids of (largest raw ts - smallest raw ts) across the rows left after rules 1 to 4."
    ),
    "matches_with_shorter_span_after_cleaning": (
        "match_ids whose span over the rows left after rules 1 to 4 is smaller than their span over all rows."
    ),
    "match_span_largest_loss_from_cleaning": (
        "Largest difference, over match_ids, between the span over all rows and the span over the rows left after rules 1 to 4."
    ),
    "rows_after_cleaning_{who}_{event}": "Rows left after rules 1 to 4 whose event is {event}, in files with {movement} rows.",
}


def cleaning(rows: pd.DataFrame, files: pd.DataFrame) -> Section:
    """What the four rules of pipeline/clean.py remove, applied in order, and what is left."""
    after_rule_1 = keep_one_copy_per_journey(rows)
    after_rule_2 = keep_first_half_of_files_written_twice(after_rule_1)
    after_rule_3 = drop_kills_mirroring_a_death(after_rule_2)
    cleaned = end_paths_at_death(after_rule_3)
    kept_after_death = cleaned[after_death(cleaned) & ~cleaned["event"].isin(DEATH_EVENTS)]
    metrics = joined(
        _removed_metrics(rows, after_rule_1, after_rule_2, after_rule_3, cleaned),
        _rows_and_journeys_left_metrics(cleaned, files, kept_after_death),
        _matches_left_metrics(rows, cleaned),
        _events_left_by_actor_metrics(cleaned, files),
    )
    details = {
        "copy_kept_of_journeys_stored_twice": _copies_kept(rows, files, after_rule_1),
        "journeys_by_fate_after_cleaning": _journeys_by_fate(cleaned, files),
        "rows_kept_after_death_row_by_event": kept_after_death["event"].value_counts().to_dict(),
    }
    return metrics, details


def _removed_metrics(
    rows: pd.DataFrame, after_rule_1: pd.DataFrame, after_rule_2: pd.DataFrame, after_rule_3: pd.DataFrame, cleaned: pd.DataFrame
) -> Entries:
    """The rows each rule removes. For rule 4 also how many of them have a later ts than their file's first death row."""
    ordered = after_rule_3.sort_values(["file", "ts", "row"])  # rule 4's input, in the order the rule uses
    is_death = ordered["event"].isin(DEATH_EVENTS)
    death_ts = ordered["ts"].where(is_death).groupby(ordered["file"], sort=False).transform("min")
    late = ~ordered.index.isin(cleaned.index)

    found = Metrics(DEFINITIONS)
    found.add("rows_removed_spare_copy_of_journey", len(rows) - len(after_rule_1))
    found.add("rows_removed_second_half_of_file_written_twice", len(after_rule_1) - len(after_rule_2))
    found.add("rows_removed_Kill_mirroring_Killed", len(after_rule_2) - len(after_rule_3))
    found.add("rows_removed_movement_after_death", late.sum())
    found.add("rows_removed_movement_after_death_with_later_ts", (late & (ordered["ts"] > death_ts)).sum())
    return found.as_dict()


def _rows_and_journeys_left_metrics(cleaned: pd.DataFrame, files: pd.DataFrame, kept_after_death: pd.DataFrame) -> Entries:
    """What is left after the four rules: rows per event, journeys by actor and death, rows that still repeat an earlier one."""
    actor = cleaned["file"].map(files["actor"])
    is_death = cleaned["event"].isin(DEATH_EVENTS)
    deaths_per_journey = cleaned[is_death].groupby("file").size()
    surplus = cleaned.duplicated(subset=["file", *COLUMNS], keep="first")
    directly_after_twin = surplus & (cleaned[COLUMNS] == cleaned[COLUMNS].shift()).all(axis=1)

    found = Metrics(DEFINITIONS)
    found.add("rows_after_cleaning", len(cleaned))
    for event in EVENTS:
        found.add("rows_after_cleaning_{event}", (cleaned["event"] == event).sum(), event=event)
    found.add("journeys_after_cleaning", cleaned["file"].nunique())
    found.add("journeys_after_cleaning_Position", cleaned.loc[actor == "human", "file"].nunique())
    found.add("journeys_after_cleaning_BotPosition", cleaned.loc[actor == "bot", "file"].nunique())
    found.add("journeys_after_cleaning_with_death_row", len(deaths_per_journey))
    found.add("journeys_after_cleaning_with_several_death_rows", (deaths_per_journey > 1).sum())
    found.add("journeys_after_cleaning_Position_with_death_row", cleaned.loc[is_death & (actor == "human"), "file"].nunique())
    found.add("rows_kept_after_death_row", len(kept_after_death))
    found.add("identical_rows_left_after_cleaning", surplus.sum())
    for event, count in cleaned.loc[surplus, "event"].value_counts().sort_index().items():
        found.add("identical_rows_left_after_cleaning_{event}", count, event=event)
    found.add("identical_rows_left_directly_after_twin", directly_after_twin.sum())
    return found.as_dict()


def _matches_left_metrics(rows: pd.DataFrame, cleaned: pd.DataFrame) -> Entries:
    """Matches per day folder after cleaning, and how much shorter the span of a match gets."""
    span = match_span(cleaned)
    span_lost = match_span(rows) - span

    found = Metrics(DEFINITIONS)
    found.add("matches_in_several_day_folders_after_cleaning", (cleaned.groupby("match_id")["day"].nunique() > 1).sum())
    for day, count in cleaned.groupby("day")["match_id"].nunique().items():
        found.add("matches_after_cleaning_in_{day}", count, day=day)
    found.add("match_span_median_after_cleaning", span.median())
    found.add("match_span_max_after_cleaning", span.max())
    found.add("matches_with_shorter_span_after_cleaning", (span_lost > 0).sum())
    found.add("match_span_largest_loss_from_cleaning", span_lost.max())
    return found.as_dict()


def _events_left_by_actor_metrics(cleaned: pd.DataFrame, files: pd.DataFrame) -> Entries:
    """Rows left per event, counted apart for the journeys of humans and of bots."""
    actor = cleaned["file"].map(files["actor"])
    found = Metrics(DEFINITIONS)
    for who, movement in (("human", "Position"), ("bot", "BotPosition")):
        for event in EVENTS_COUNTED_PER_ACTOR:
            count = ((actor == who) & (cleaned["event"] == event)).sum()
            found.add("rows_after_cleaning_{who}_{event}", count, who=who, event=event, movement=movement)
    return found.as_dict()


def _copies_kept(rows: pd.DataFrame, files: pd.DataFrame, after_rule_1: pd.DataFrame) -> list[str]:
    """Of each journey stored in several files, the file that rule 1 keeps."""
    flat = files.reset_index()
    spare_files = set(rows["file"]) - set(after_rule_1["file"])
    stored_twice = flat.duplicated(["user_id", "match_id"], keep=False)
    return sorted(short_file(f) for f in flat.loc[stored_twice & ~flat["file"].isin(spare_files), "file"])


def _journeys_by_fate(cleaned: pd.DataFrame, files: pd.DataFrame) -> list[dict[str, object]]:
    """Journeys left, by who they are (bot, human with a UUID, human with a numeric id) and by the death row they end with."""
    fate = with_fate(cleaned, files.loc[cleaned["file"].unique()])
    of_human = np.where(fate["id_kind"] == "uuid", "human, uuid id", "human, numeric id")
    who = pd.Series(np.where(fate["actor"] == "bot", "bot", of_human), index=fate.index, name="journey")
    return pd.crosstab(who, fate["fate"]).reset_index().to_dict("records")
