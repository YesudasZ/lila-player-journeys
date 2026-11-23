"""Who is in the data: rows per event, kinds of user_id, and which ids move as a human or as a bot."""
from __future__ import annotations

import pandas as pd

from pipeline.dataset import DEATH_EVENTS, MOVEMENT_EVENTS
from pipeline.profile.metrics import Entries, Metrics, Section
from pipeline.profile.values import short_file

ID_KINDS = "uuid = lowercase 8-4-4-4-12 hexadecimal, numeric = ASCII digits only"
DEFINITIONS = {
    "rows_event_{event}": "Rows whose event is {event}.",
    "rows_{kind}_{event}": "Rows whose event is {event} and whose user_id is {kind} (" + ID_KINDS + ").",
    "distinct_user_ids": "Distinct user_id values.",
    "distinct_{kind}_user_ids": "Distinct user_id values of kind {kind} (" + ID_KINDS + ", other = anything else).",
    "files_{kind}": "Files whose user_id is {kind}.",
    "files_with_Position_and_BotPosition": "Files containing both Position and BotPosition rows.",
    "files_without_movement_rows": "Files containing neither Position nor BotPosition rows.",
    "files_uuid_with_BotPosition": "Files with a UUID user_id that contain at least one BotPosition row.",
    "files_numeric_with_Position": "Files with a numeric user_id that contain at least one Position row.",
    "files_numeric_with_BotPosition": "Files with a numeric user_id that contain at least one BotPosition row.",
    "numeric_user_ids_with_Position": "Distinct numeric user_ids that have at least one file containing Position rows.",
    "numeric_user_ids_in_both_roles": "Distinct numeric user_ids that have Position rows in one file and BotPosition rows in another.",
    "rows_Loot_in_files_with_BotPosition": "Loot rows inside files that contain BotPosition rows.",
    "distinct_user_ids_with_Position": "Distinct user_ids of any format that have at least one file containing Position rows.",
    "distinct_user_ids_with_BotPosition": "Distinct user_ids of any format that have at least one file containing BotPosition rows.",
    "files_numeric_with_Position_and_death_row": (
        "Files with a numeric user_id and Position rows that contain a death row (Killed, BotKilled or KilledByStorm)."
    ),
    "files_uuid_with_death_row": "Files with a UUID user_id that contain a death row.",
}


def events(rows: pd.DataFrame) -> Section:
    """Rows per event, in total, per kind of user_id and per map."""
    counts = rows["event"].value_counts()
    by_kind = pd.crosstab(rows["id_kind"], rows["event"])
    by_map = pd.crosstab(rows["map_id"], rows["event"])

    found = Metrics(DEFINITIONS)
    for event, count in counts.sort_index().items():
        found.add("rows_event_{event}", count, event=event)
    for kind in by_kind.index:
        for event in by_kind.columns:
            found.add("rows_{kind}_{event}", by_kind.loc[kind, event], kind=kind, event=event)
    details = {
        "share_of_rows": (counts / len(rows)).sort_values(ascending=False).to_dict(),
        "movement_share_of_rows": counts.reindex(list(MOVEMENT_EVENTS)).sum() / len(rows),
        "rows_by_map_and_event": by_map.reset_index().to_dict("records"),
        "rows_by_id_kind_and_event": by_kind.reset_index().to_dict("records"),
    }
    return found.as_dict(), details


def actors(rows: pd.DataFrame, files: pd.DataFrame) -> Section:
    """User_ids and files by kind of id and by the movement rows they hold; the numeric ids found on Position files."""
    numeric = files[files["id_kind"] == "numeric"]
    human_like = numeric[numeric["Position"] > 0]  # numeric id, yet the file moves as a human does
    return _actor_metrics(rows, files, numeric, human_like), _numeric_id_details(files, numeric, human_like)


def _actor_metrics(rows: pd.DataFrame, files: pd.DataFrame, numeric: pd.DataFrame, human_like: pd.DataFrame) -> Entries:
    """Distinct user_ids and files, by kind of id, by the movement rows they hold and by whether they hold a death row."""
    users = rows.drop_duplicates("user_id")["id_kind"].value_counts()
    human_like_ids = set(human_like["user_id"])
    bot_like_ids = set(numeric.loc[numeric["BotPosition"] > 0, "user_id"])
    is_uuid, is_numeric = files["id_kind"] == "uuid", files["id_kind"] == "numeric"
    has_position, has_bot_position = files["Position"] > 0, files["BotPosition"] > 0
    has_death = files[list(DEATH_EVENTS)].sum(axis=1) > 0

    found = Metrics(DEFINITIONS)
    found.add("distinct_user_ids", users.sum())
    for kind in ("uuid", "numeric", "other"):
        found.add("distinct_{kind}_user_ids", users.get(kind, 0), kind=kind)
    for kind in ("uuid", "numeric"):
        found.add("files_{kind}", (files["id_kind"] == kind).sum(), kind=kind)
    found.add("files_with_Position_and_BotPosition", (has_position & has_bot_position).sum())
    found.add("files_without_movement_rows", (~has_position & ~has_bot_position).sum())
    found.add("files_uuid_with_BotPosition", (is_uuid & has_bot_position).sum())
    found.add("files_numeric_with_Position", len(human_like))
    found.add("files_numeric_with_BotPosition", (numeric["BotPosition"] > 0).sum())
    found.add("numeric_user_ids_with_Position", len(human_like_ids))
    found.add("numeric_user_ids_in_both_roles", len(human_like_ids & bot_like_ids))
    found.add("rows_Loot_in_files_with_BotPosition", files.loc[has_bot_position, "Loot"].sum())
    found.add("distinct_user_ids_with_Position", files.loc[has_position, "user_id"].nunique())
    found.add("distinct_user_ids_with_BotPosition", files.loc[has_bot_position, "user_id"].nunique())
    found.add("files_numeric_with_Position_and_death_row", (has_death & is_numeric & has_position).sum())
    found.add("files_uuid_with_death_row", (has_death & is_uuid).sum())
    return found.as_dict()


def _numeric_id_details(files: pd.DataFrame, numeric: pd.DataFrame, human_like: pd.DataFrame) -> dict[str, object]:
    """Are the numeric ids on Position files player identities, or one placeholder per map? The tables that answer it."""
    bots = numeric[numeric["BotPosition"] > 0]
    human_like_ids = sorted(set(human_like["user_id"]), key=int)
    shared = bots[bots["user_id"].isin(human_like_ids)]
    span = files["last_ts"] - files["first_ts"]
    is_uuid = files["id_kind"] == "uuid"
    return {
        "numeric_ids_with_Position_files": [_roles(numeric, user_id) for user_id in human_like_ids],
        "numeric_id_on_Position_files_against_bot_id_range_by_map": _ids_against_bot_id_range(human_like, bots),
        "BotPosition_files_of_those_ids_by_map": (
            shared.groupby(["user_id", "map_id"]).size().reset_index(name="BotPosition_files").to_dict("records")
        ),
        "median_seconds_recorded_per_file": {
            "numeric id with Position": span[human_like.index].median(),
            "uuid id": span[is_uuid].median(),
        },
        "their_Position_files": _position_files(files, human_like),
        "files_by_actor_from_movement_event": files["actor"].value_counts().to_dict(),
        "files_by_id_kind_and_actor": pd.crosstab(files["id_kind"], files["actor"]).reset_index().to_dict("records"),
    }


def _roles(numeric: pd.DataFrame, user_id: str) -> dict[str, object]:
    """In how many files one numeric id moves as a human, and in how many as a bot."""
    its_files = numeric["user_id"] == user_id
    return {
        "user_id": user_id,
        "files_with_Position": int((its_files & (numeric["Position"] > 0)).sum()),
        "files_with_BotPosition": int((its_files & (numeric["BotPosition"] > 0)).sum()),
    }


def _ids_against_bot_id_range(human_like: pd.DataFrame, bots: pd.DataFrame) -> list[dict[str, object]]:
    """Per map: the numeric ids on Position files, next to the lowest and the highest id of a bot on that map."""
    bot_numbers = bots["user_id"].astype(int)
    return [
        {
            "map_id": map_id,
            "numeric_id_on_Position_files": ", ".join(sorted(part["user_id"].unique(), key=int)),
            "Position_files": len(part),
            "lowest_bot_id": bot_numbers[bots["map_id"] == map_id].min(),
            "highest_bot_id": bot_numbers[bots["map_id"] == map_id].max(),
        }
        for map_id, part in human_like.groupby("map_id")
    ]


def _position_files(files: pd.DataFrame, human_like: pd.DataFrame) -> list[dict[str, object]]:
    """The Position files with a numeric id: what each holds, and how many UUID users are in its match."""
    uuid_users_per_match = files[files["id_kind"] == "uuid"].groupby("match_id")["user_id"].nunique()
    listing = human_like.reset_index()
    listing["uuid_users_in_match"] = listing["match_id"].map(uuid_users_per_match).fillna(0).astype(int)
    listing["file"] = listing["file"].map(short_file)
    columns = ["file", "map_id", "rows", "Position", "Loot", "BotKill", "BotKilled", "uuid_users_in_match"]
    return listing[columns].to_dict("records")
