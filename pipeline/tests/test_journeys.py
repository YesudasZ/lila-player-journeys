"""Journey and match tables: who is human, how a journey ended, what a match counts."""
import pytest

from pipeline.clean import clean
from pipeline.journeys import actor_by_file, check_journeys, journey_table, match_table
from pipeline.tests.helpers import HUMAN, MATCH, OTHER_HUMAN, OTHER_MATCH, frame, rows_of

WALK = [(0, "Position"), (5, "Position")]
BOT_WALK = [(5, "BotPosition"), (10, "BotPosition")]


def journeys_of(*files):
    return journey_table(clean(frame(*files)).rows)


def test_actor_comes_from_the_movement_event_not_from_the_id():
    rows = frame(
        rows_of("February_10", HUMAN, MATCH, WALK),
        rows_of("February_10", "1440", MATCH, BOT_WALK),
        rows_of("February_10", "1429", OTHER_MATCH, WALK + [(7, "Loot")]),
    )
    actors = actor_by_file(rows)
    assert actors[f"February_10/{HUMAN}_{MATCH}"] == "human"
    assert actors[f"February_10/1440_{MATCH}"] == "bot"
    assert actors[f"February_10/1429_{OTHER_MATCH}"] == "human"


def test_file_with_both_or_no_movement_rows_is_flagged():
    rows = frame(
        rows_of("February_10", HUMAN, MATCH, [(0, "Position"), (5, "BotPosition")]),
        rows_of("February_10", OTHER_HUMAN, MATCH, [(0, "Loot")]),
    )
    actors = actor_by_file(rows)
    assert actors[f"February_10/{HUMAN}_{MATCH}"] == "mixed"
    assert actors[f"February_10/{OTHER_HUMAN}_{MATCH}"] == "none"
    with pytest.raises(ValueError, match="no movement rows or both kinds"):
        check_journeys(journey_table(rows))


def test_numeric_id_with_position_rows_is_an_anonymous_human():
    table = journeys_of(rows_of("February_10", "1429", MATCH, WALK), rows_of("February_10", HUMAN, OTHER_MATCH, WALK))
    anonymous = table.loc[f"February_10/1429_{MATCH}"]
    identified = table.loc[f"February_10/{HUMAN}_{OTHER_MATCH}"]
    assert (anonymous["actor"], anonymous["anonymous"], anonymous["player"]) == ("human", True, None)
    assert (identified["actor"], identified["anonymous"], identified["player"]) == ("human", False, HUMAN[:8])


def test_public_ids_are_prefixes_and_a_bot_keeps_its_number():
    table = journeys_of(rows_of("February_10", HUMAN, MATCH, WALK), rows_of("February_10", "1440", MATCH, BOT_WALK))
    assert set(table["match"]) == {MATCH[:8]}
    assert table.loc[f"February_10/1440_{MATCH}", "player"] == "1440"
    assert table.loc[f"February_10/{HUMAN}_{MATCH}", "player"] == "1a2b3c4d"


def test_death_is_the_first_death_row_and_none_without_one():
    table = journeys_of(
        rows_of("February_10", HUMAN, MATCH, WALK + [(9, "KilledByStorm")]),
        rows_of("February_10", OTHER_HUMAN, MATCH, WALK + [(7, "Loot")]),
        rows_of("February_10", "1440", MATCH, BOT_WALK + [(12, "BotKilled")]),
        rows_of("February_10", "1444", MATCH, BOT_WALK),
    )
    assert table["death"].to_dict() == {
        f"February_10/{HUMAN}_{MATCH}": "KilledByStorm",
        f"February_10/{OTHER_HUMAN}_{MATCH}": None,
        f"February_10/1440_{MATCH}": "BotKilled",
        f"February_10/1444_{MATCH}": None,
    }


def test_match_counts_follow_the_owner_of_each_row():
    human = WALK + [(6, "Loot"), (6, "Loot"), (7, "BotKill"), (8, "BotKill"), (9, "BotKilled"), (12, "BotKill")]
    table = match_table(
        journeys_of(
            rows_of("February_10", HUMAN, MATCH, human),
            rows_of("February_10", "1440", MATCH, BOT_WALK + [(11, "BotKill"), (12, "BotKilled")]),
            rows_of("February_10", "1444", MATCH, BOT_WALK),
        )
    )
    match = table.loc[MATCH[:8]]
    assert match[["humans", "anonymous", "bots"]].tolist() == [1, 0, 2]
    assert match[["kills", "deaths", "storm_deaths", "loot", "bot_deaths"]].tolist() == [3, 1, 0, 2, 1]
    assert match["span"] == 12


def test_kill_and_killed_twin_counts_as_one_death_and_no_kill():
    table = match_table(journeys_of(rows_of("February_10", HUMAN, MATCH, WALK + [(8, "Kill", 1.0, 1.0), (8, "Killed", 1.0, 1.0)])))
    assert table.loc[MATCH[:8], ["kills", "deaths"]].tolist() == [0, 1]


def test_match_in_two_day_folders_is_rejected():
    table = journey_table(frame(rows_of("February_10", HUMAN, MATCH, WALK), rows_of("February_11", "1440", MATCH, BOT_WALK)))
    with pytest.raises(ValueError, match="several day folders"):
        check_journeys(table)


def test_colliding_public_ids_are_rejected():
    same_prefix = HUMAN[:8] + "-0000-4000-8000-000000000000"
    table = journey_table(frame(rows_of("February_10", HUMAN, MATCH, WALK), rows_of("February_10", same_prefix, OTHER_MATCH, WALK)))
    with pytest.raises(ValueError, match="player ids are not unique"):
        check_journeys(table)
