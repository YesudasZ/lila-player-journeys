"""What the cleaned rows say about each journey and each match."""
from __future__ import annotations

import numpy as np
import pandas as pd

from pipeline.dataset import DEATH_EVENTS, EVENTS, MOVEMENT_EVENTS

PUBLIC_ID_LENGTH = 8  # leading characters of a player or match id that are published


def actor_by_file(rows: pd.DataFrame) -> pd.Series:
    """'human' or 'bot' for every file, from the movement event it contains.

    Position rows mean human, BotPosition rows mean bot. The format of the
    user_id is not used: some human journeys carry a numeric placeholder id
    (docs/DATA_NOTES.md, row 8). A file with both kinds of movement row is
    'mixed' and a file with neither is 'none'; the dataset has no such file.
    """
    has = pd.crosstab(rows["file"], rows["event"]).reindex(columns=list(MOVEMENT_EVENTS), fill_value=0) > 0
    human, bot = has["Position"], has["BotPosition"]
    return pd.Series(np.select([human & bot, human, bot], ["mixed", "human", "bot"], default="none"), index=has.index, name="actor")


def journey_table(rows: pd.DataFrame) -> pd.DataFrame:
    """One line per journey of the cleaned rows, indexed by file.

    Besides ids, time range and the row count of every event, each journey gets:

    * ``actor``: 'human' or 'bot' (see ``actor_by_file``).
    * ``anonymous``: a human journey whose user_id is not a player's UUID.
    * ``death``: the event of its first death row in (ts, file order), or None.
    * ``match`` and ``player``: the public ids. A bot keeps its number, an
      identified player gets the first characters of the UUID, an anonymous
      human gets None.
    """
    table = rows.groupby("file", sort=True).agg(
        match_id=("match_id", "first"),
        map_id=("map_id", "first"),
        day=("day", "first"),
        user_id=("user_id", "first"),
        id_kind=("id_kind", "first"),
        rows=("row", "size"),
        first_ts=("ts", "min"),
        last_ts=("ts", "max"),
    )
    table["actor"] = actor_by_file(rows)
    table["anonymous"] = (table["actor"] == "human") & (table["id_kind"] != "uuid")
    first_death = rows[rows["event"].isin(DEATH_EVENTS)].sort_values(["ts", "row"]).drop_duplicates("file")
    death_of = dict(zip(first_death["file"], first_death["event"]))
    # dtype=object keeps a missing value as None; pandas' string type would turn it into NaN
    table["death"] = pd.Series([death_of.get(file) for file in table.index], index=table.index, dtype=object)
    table["match"] = table["match_id"].str[:PUBLIC_ID_LENGTH]
    table["player"] = pd.Series(
        [j.user_id if j.actor == "bot" else None if j.anonymous else j.user_id[:PUBLIC_ID_LENGTH] for j in table.itertuples()],
        index=table.index,
        dtype=object,
    )
    counts = pd.crosstab(rows["file"], rows["event"]).reindex(index=table.index, columns=list(EVENTS), fill_value=0)
    return table.join(counts)


def check_journeys(journeys: pd.DataFrame) -> None:
    """Raise ValueError when the journeys break something the app relies on."""
    odd = journeys[~journeys["actor"].isin(["human", "bot"])]
    if len(odd):
        raise ValueError(f"{len(odd)} files have no movement rows or both kinds, e.g. {odd.index[0]}")
    per_match = journeys.groupby("match_id").agg(days=("day", "nunique"), maps=("map_id", "nunique"))
    scattered = per_match[(per_match["days"] > 1) | (per_match["maps"] > 1)]
    if len(scattered):
        raise ValueError(f"{len(scattered)} matches span several day folders or maps, e.g. {scattered.index[0]}")
    if journeys["match"].nunique() != journeys["match_id"].nunique():
        raise ValueError(f"match ids are not unique in their first {PUBLIC_ID_LENGTH} characters")
    identified = journeys[(journeys["actor"] == "human") & ~journeys["anonymous"]]
    if identified["player"].nunique() != identified["user_id"].nunique():
        raise ValueError(f"player ids are not unique in their first {PUBLIC_ID_LENGTH} characters")
    if journeys.duplicated(["match", "player"]).any():
        raise ValueError("two journeys of one match share a public player id")


def match_table(journeys: pd.DataFrame) -> pd.DataFrame:
    """One line per match, indexed by its public id.

    kills and deaths count rows of human journeys only: a kill is a BotKill
    row, a death is a BotKilled or Killed row. bot_deaths are BotKilled rows
    of bot journeys. span is the time between the first and the last recorded
    row of the match, which is not the length of the match.
    """
    human = journeys["actor"] == "human"
    counted = journeys.assign(
        humans=human,
        bots=~human,
        kills=journeys["BotKill"].where(human, 0),
        deaths=(journeys["BotKilled"] + journeys["Killed"]).where(human, 0),
        storm_deaths=journeys["KilledByStorm"],
        loot=journeys["Loot"],
        bot_deaths=journeys["BotKilled"].where(~human, 0),
    )
    table = counted.groupby("match").agg(
        map_id=("map_id", "first"),
        day=("day", "first"),
        start=("first_ts", "min"),
        end=("last_ts", "max"),
        rows=("rows", "sum"),
        humans=("humans", "sum"),
        anonymous=("anonymous", "sum"),
        bots=("bots", "sum"),
        kills=("kills", "sum"),
        deaths=("deaths", "sum"),
        storm_deaths=("storm_deaths", "sum"),
        loot=("loot", "sum"),
        bot_deaths=("bot_deaths", "sum"),
    )
    table["span"] = table["end"] - table["start"]
    return table.drop(columns="end")
