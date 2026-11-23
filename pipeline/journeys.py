"""What the cleaned rows say about each journey and each match."""
from __future__ import annotations

import numpy as np
import pandas as pd

from pipeline.dataset import COMBAT_DEATH_EVENTS, DEATH_EVENTS, EVENTS, KILL_EVENTS, MOVEMENT_EVENTS, PUBLIC_ID_LENGTH, day_dates, short_ids

# How a journey can end, as written into the app's data. See ``fate``.
FATES = ("killed_by_bot", "killed_by_player", "killed_by_storm", "killed", "no_death_recorded")
# What the manifest counts for every match. See ``match_table``.
MATCH_COUNTS = ("humans", "anonymous", "bots", "kills", "deaths", "storm_deaths", "loot", "bot_kills", "bot_deaths", "rows")


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


def fate(actor: str, death: str | None) -> str:
    """How a journey ended, from the event of its death row (docs/DATA_NOTES.md, row 18).

    For a human, BotKilled is a death by a bot and Killed the README's death
    by a player. A bot's file does not say who killed it. A journey without
    a death row is not known to have survived: there is no extraction event.
    """
    if death is None:
        return "no_death_recorded"
    if death == "KilledByStorm":
        return "killed_by_storm"
    if actor == "bot":
        return "killed"
    return "killed_by_bot" if death == "BotKilled" else "killed_by_player"


def journey_id(match: str, actor: str, player: str | None) -> str:
    """A name for the journey that is unique in the dataset, the same on every build, and safe in a URL."""
    who = "anon" if player is None else f"bot{player}" if actor == "bot" else player
    return f"{match}-{who}"


def journey_table(rows: pd.DataFrame) -> pd.DataFrame:
    """One line per journey of the cleaned rows, indexed by file.

    Besides ids, time range and the row count of every event, each journey gets:

    * ``date``: the ISO date of its day folder.
    * ``actor``: 'human' or 'bot' (see ``actor_by_file``).
    * ``anonymous``: a human journey whose user_id is not a player's UUID.
    * ``fate``: how it ended (see ``fate``).
    * ``match`` and ``player``: the public ids. A bot keeps its number, an
      identified player gets the first characters of the UUID, an anonymous
      human gets None.
    * ``id``: see ``journey_id``.
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
    table["date"] = table["day"].map(day_dates(rows))
    table["actor"] = actor_by_file(rows)
    table["anonymous"] = (table["actor"] == "human") & (table["id_kind"] != "uuid")
    deaths = rows[rows["event"].isin(DEATH_EVENTS)]  # at most one row per journey once cleaned
    death_of = dict(zip(deaths["file"], deaths["event"]))
    table["fate"] = [fate(journey.actor, death_of.get(journey.Index)) for journey in table.itertuples()]
    table["match"] = table["match_id"].str[:PUBLIC_ID_LENGTH]
    # dtype=object keeps a missing value as None; pandas' string type would turn it into NaN
    table["player"] = pd.Series(
        [j.user_id if j.actor == "bot" else None if j.anonymous else j.user_id[:PUBLIC_ID_LENGTH] for j in table.itertuples()],
        index=table.index,
        dtype=object,
    )
    table["id"] = [journey_id(j.match, j.actor, j.player) for j in table.itertuples()]
    counts = pd.crosstab(rows["file"], rows["event"]).reindex(index=table.index, columns=list(EVENTS), fill_value=0)
    return table.join(counts)


def check_journeys(journeys: pd.DataFrame) -> None:
    """Raise ValueError when the journeys break something the app relies on."""
    for actor, found in (("none", "no movement row left after cleaning"), ("mixed", "both Position and BotPosition rows")):
        odd = journeys.index[journeys["actor"] == actor]
        if len(odd):
            raise ValueError(short_ids(f"{len(odd)} journeys have {found}, e.g. {odd[0]}"))
    maps = journeys.groupby("match_id")["map_id"].nunique()
    if (maps > 1).any():
        raise ValueError(short_ids(f"{int((maps > 1).sum())} matches are on several maps, e.g. {maps[maps > 1].index[0]}"))
    if journeys["match"].nunique() != journeys["match_id"].nunique():
        raise ValueError(f"match ids are not unique in their first {PUBLIC_ID_LENGTH} characters")
    identified = journeys[(journeys["actor"] == "human") & ~journeys["anonymous"]]
    if identified["player"].nunique() != identified["user_id"].nunique():
        raise ValueError(f"player ids are not unique in their first {PUBLIC_ID_LENGTH} characters")
    shared = journeys.loc[journeys["id"].duplicated(), "id"]
    if len(shared):
        why = "a match with several humans without an account id"
        raise ValueError(f"{len(shared)} journeys share their id with another, e.g. {shared.iloc[0]}: {why}")


def match_table(journeys: pd.DataFrame) -> pd.DataFrame:
    """One line per match, indexed by its public id.

    Every marker the app draws is counted exactly once. kills and deaths are
    the Kill/BotKill and Killed/BotKilled rows of human journeys; bot_kills
    and bot_deaths are the same rows of bot journeys; storm_deaths and loot
    count rows of every journey. anonymous journeys are included in humans.

    A match filed under several day folders belongs to the latest one, the
    day its last file was written. start is the smallest ts of the match and
    span the time from there to its last row after cleaning: what was
    recorded, which is not the length of the match.
    """
    human = journeys["actor"] == "human"
    kills = journeys[list(KILL_EVENTS)].sum(axis=1)
    deaths = journeys[list(COMBAT_DEATH_EVENTS)].sum(axis=1)
    counted = journeys.assign(
        humans=human,
        bots=~human,
        kills=kills.where(human, 0),
        deaths=deaths.where(human, 0),
        storm_deaths=journeys["KilledByStorm"],
        loot=journeys["Loot"],
        bot_kills=kills.where(~human, 0),
        bot_deaths=deaths.where(~human, 0),
    )
    table = counted.sort_values("date", kind="stable").groupby("match").agg(
        map_id=("map_id", "first"),
        day=("day", "last"),
        date=("date", "last"),
        start=("first_ts", "min"),
        end=("last_ts", "max"),
        **{name: (name, "sum") for name in MATCH_COUNTS},
    )
    table["span"] = table["end"] - table["start"]
    return table.drop(columns="end")
