"""Kills against deaths: Kill rows mirrored by a Killed row, kills paired with deaths in other files of the match."""
from __future__ import annotations

import numpy as np
import pandas as pd

from pipeline.dataset import MOVEMENT_EVENTS
from pipeline.profile.metrics import Metrics, Section

DEFINITIONS = {
    "files_with_Kill_or_Killed": "Files containing at least one Kill or Killed row.",
    "Kill_rows_with_Killed_twin_in_same_file": (
        "Kill rows for which a Killed row exists in the same file with identical raw ts, x, y and z."
    ),
    "Kill_twins_in_matches_with_several_Position_users": (
        "Kill rows with such a twin whose match has more than one distinct user_id with Position rows."
    ),
    "Kill_twins_in_single_file_matches": "Kill rows with such a twin whose match has exactly one file in the dataset.",
    "bot_BotKilled_rows_with_BotKill_in_another_file_within_1": (
        "BotKilled rows in files with BotPosition rows for which a BotKill row exists in another file of the same match "
        "with a raw ts at most 1 away."
    ),
}


def combat(rows: pd.DataFrame, files: pd.DataFrame) -> Section:
    """Kill rows with a Killed twin, kills paired with deaths in other files, and how far an event is from its owner's path."""
    kills, killed = rows[rows["event"] == "Kill"], rows[rows["event"] == "Killed"]
    twins = kills.merge(killed, on=["file", "ts", "x", "y", "z"])
    match_of_twin = twins["file"].map(files["match_id"])
    humans_in_match = files[files["actor"] == "human"].groupby("match_id")["user_id"].nunique()
    twin_to_end = (twins["file"].map(files["last_ts"]) - twins["ts"]).max() if len(twins) else None
    paired = _kills_paired_with_deaths(rows, rows["file"].map(files["actor"]))

    found = Metrics(DEFINITIONS)
    found.add("files_with_Kill_or_Killed", rows.loc[rows["event"].isin(["Kill", "Killed"]), "file"].nunique())
    found.add("Kill_rows_with_Killed_twin_in_same_file", len(twins))
    found.add("Kill_twins_in_matches_with_several_Position_users", (match_of_twin.map(humans_in_match) > 1).sum())
    found.add("Kill_twins_in_single_file_matches", (match_of_twin.map(files.groupby("match_id").size()) == 1).sum())
    found.add(
        "bot_BotKilled_rows_with_BotKill_in_another_file_within_1",
        paired["bot BotKilled, partner any BotKill"]["rows_with_a_partner_within_1s"],
    )
    details = {
        "Kill_and_Killed_twins": {"twins": len(twins), "max_seconds_from_twin_to_end_of_file": twin_to_end},
        "rows_paired_with_rows_in_another_file": paired,
        "distance_from_event_row_to_nearest_movement_sample_of_same_file": _distance_to_own_path(rows, files),
    }
    return found.as_dict(), details


def _kills_paired_with_deaths(rows: pd.DataFrame, actor: pd.Series) -> dict[str, dict[str, object]]:
    """BotKill rows of humans and of bots against the BotKilled rows in other files of the match, and the other way round."""
    of = {
        (event, who): rows[(rows["event"] == event) & (actor == who)]
        for event in ("BotKill", "BotKilled")
        for who in ("human", "bot")
    }
    return {
        "human BotKill, partner bot BotKilled": _partners_in_other_files(of["BotKill", "human"], of["BotKilled", "bot"]),
        "bot BotKill, partner human BotKilled": _partners_in_other_files(of["BotKill", "bot"], of["BotKilled", "human"]),
        "bot BotKill, partner bot BotKilled": _partners_in_other_files(of["BotKill", "bot"], of["BotKilled", "bot"]),
        "bot BotKilled, partner any BotKill": _partners_in_other_files(of["BotKilled", "bot"], rows[rows["event"] == "BotKill"]),
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


def _distance_to_own_path(rows: pd.DataFrame, files: pd.DataFrame) -> list[dict[str, object]]:
    """Per actor and event: how far a row that is not a movement row lies from the movement row nearest in time, same file."""
    movement = rows[rows["event"].isin(MOVEMENT_EVENTS)].sort_values("ts")[["file", "ts", "x", "z"]]
    samples = movement.rename(columns={"ts": "sample_ts", "x": "sample_x", "z": "sample_z"})
    others = rows[~rows["event"].isin(MOVEMENT_EVENTS)].sort_values("ts")[["file", "ts", "x", "z", "event"]]
    near = pd.merge_asof(others, samples, left_on="ts", right_on="sample_ts", by="file", direction="nearest")
    near["distance"] = np.hypot(near["x"] - near["sample_x"], near["z"] - near["sample_z"])
    near["actor"] = near["file"].map(files["actor"])
    to_own_path = near.groupby(["actor", "event"])["distance"].agg(
        rows="size", median="median", p90=lambda distances: distances.quantile(0.9), max="max"
    )
    return to_own_path.reset_index().to_dict("records")
