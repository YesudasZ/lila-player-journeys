"""Journey and match tables: who is human, how a journey ended, what a match counts."""
import pytest

from pipeline.clean import clean
from pipeline.journeys import FATES, actor_by_file, check_journeys, fate, journey_table, match_table
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


def test_file_with_both_kinds_of_movement_row_is_rejected():
    rows = rows_of("February_10", HUMAN, MATCH, [(0, "Position"), (5, "BotPosition")])
    assert actor_by_file(rows).tolist() == ["mixed"]
    with pytest.raises(ValueError, match="1 journeys have both Position and BotPosition rows, e.g. February_10/1a2b3c4d_aaaaaaaa"):
        check_journeys(journey_table(rows))


@pytest.mark.parametrize("events", [[(0, "Loot")], [(0, "BotKilled"), (0, "Position"), (5, "Position")]])
def test_journey_without_a_movement_row_after_cleaning_is_rejected(events):
    table = journeys_of(rows_of("February_10", HUMAN, MATCH, WALK), rows_of("February_10", OTHER_HUMAN, MATCH, events))
    assert table.loc[f"February_10/{OTHER_HUMAN}_{MATCH}", "actor"] == "none"
    with pytest.raises(ValueError, match="1 journeys have no movement row left after cleaning, e.g. February_10/9f8e7d6c_aaaaaaaa"):
        check_journeys(table)


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


def test_journey_id_names_the_match_and_who_it_is():
    table = journeys_of(
        rows_of("February_10", HUMAN, MATCH, WALK),
        rows_of("February_10", "1440", MATCH, BOT_WALK),
        rows_of("February_10", "1429", MATCH, WALK),
        rows_of("February_10", HUMAN, OTHER_MATCH, WALK),
    )
    assert sorted(table["id"]) == ["aaaaaaaa-1a2b3c4d", "aaaaaaaa-anon", "aaaaaaaa-bot1440", "bbbbbbbb-1a2b3c4d"]
    check_journeys(table)


@pytest.mark.parametrize(
    ("actor", "death", "expected"),
    [
        ("human", "BotKilled", "killed_by_bot"),
        ("human", "Killed", "killed_by_player"),
        ("human", "KilledByStorm", "killed_by_storm"),
        ("human", None, "no_death_recorded"),
        ("bot", "BotKilled", "killed"),
        ("bot", "Killed", "killed"),
        ("bot", "KilledByStorm", "killed_by_storm"),
        ("bot", None, "no_death_recorded"),
    ],
)
def test_fate_depends_on_the_death_row_and_on_who_died(actor, death, expected):
    assert fate(actor, death) == expected
    assert expected in FATES


def test_each_journey_gets_the_fate_of_its_own_death_row():
    table = journeys_of(
        rows_of("February_10", HUMAN, MATCH, WALK + [(9, "KilledByStorm")]),
        rows_of("February_10", OTHER_HUMAN, MATCH, WALK + [(7, "Loot")]),
        rows_of("February_10", "1440", MATCH, BOT_WALK + [(12, "BotKilled")]),
        rows_of("February_10", "1444", MATCH, BOT_WALK),
        rows_of("February_10", OTHER_HUMAN, OTHER_MATCH, WALK + [(7, "BotKilled"), (9, "BotKill")]),
    )
    assert table["fate"].to_dict() == {
        f"February_10/{HUMAN}_{MATCH}": "killed_by_storm",
        f"February_10/{OTHER_HUMAN}_{MATCH}": "no_death_recorded",
        f"February_10/1440_{MATCH}": "killed",
        f"February_10/1444_{MATCH}": "no_death_recorded",
        f"February_10/{OTHER_HUMAN}_{OTHER_MATCH}": "killed_by_bot",
    }


def test_match_counts_follow_the_owner_of_each_row():
    human = WALK + [(6, "Loot"), (6, "Loot"), (7, "BotKill"), (8, "BotKill"), (9, "BotKilled"), (12, "BotKill")]
    table = match_table(
        journeys_of(
            rows_of("February_10", HUMAN, MATCH, human),
            rows_of("February_10", OTHER_HUMAN, MATCH, WALK + [(6, "Loot"), (11, "KilledByStorm")]),
            rows_of("February_10", "1440", MATCH, BOT_WALK + [(11, "BotKill"), (12, "BotKilled")]),
            rows_of("February_10", "1444", MATCH, BOT_WALK + [(11, "BotKill")]),
        )
    )
    match = table.loc[MATCH[:8]]
    assert match[["humans", "anonymous", "bots", "rows"]].tolist() == [2, 0, 2, 19]
    assert match[["kills", "deaths", "storm_deaths", "loot"]].tolist() == [3, 1, 1, 3]
    assert match[["bot_kills", "bot_deaths"]].tolist() == [2, 1]
    assert match["span"] == 12


def test_kill_and_killed_twin_counts_as_one_death_and_no_kill():
    table = match_table(journeys_of(rows_of("February_10", HUMAN, MATCH, WALK + [(8, "Kill", 1.0, 1.0), (8, "Killed", 1.0, 1.0)])))
    assert table.loc[MATCH[:8], ["kills", "deaths"]].tolist() == [0, 1]


def test_kill_row_without_a_twin_is_a_kill_like_any_other():
    table = match_table(journeys_of(rows_of("February_10", HUMAN, MATCH, WALK + [(6, "Kill"), (7, "BotKill")])))
    assert table.loc[MATCH[:8], ["kills", "bot_kills"]].tolist() == [2, 0]


def test_two_anonymous_humans_are_both_counted_but_cannot_be_told_apart():
    table = journeys_of(rows_of("February_10", "1429", MATCH, WALK), rows_of("February_10", "1379", MATCH, WALK))
    assert match_table(table).loc[MATCH[:8], ["humans", "anonymous"]].tolist() == [2, 2]
    with pytest.raises(ValueError, match="1 journeys share their id with another, e.g. aaaaaaaa-anon"):
        check_journeys(table)


def test_match_filed_under_two_day_folders_belongs_to_the_later_date():
    table = journeys_of(rows_of("February_10", HUMAN, MATCH, WALK), rows_of("February_9", "1440", MATCH, BOT_WALK))
    check_journeys(table)
    assert match_table(table).loc[MATCH[:8], ["day", "date"]].tolist() == ["February_10", "2026-02-10"]


def test_match_on_two_maps_is_rejected_and_named_by_its_public_id():
    table = journeys_of(rows_of("February_10", HUMAN, MATCH, WALK), rows_of("February_10", "1440", MATCH, BOT_WALK, map_id="GrandRift"))
    with pytest.raises(ValueError) as failure:
        check_journeys(table)
    assert str(failure.value) == "1 matches are on several maps, e.g. aaaaaaaa.nakama-0"


def test_bot_journey_under_an_account_id_is_rejected():
    table = journeys_of(rows_of("February_10", HUMAN, MATCH, WALK), rows_of("February_10", OTHER_HUMAN, MATCH, BOT_WALK))
    with pytest.raises(ValueError) as failure:
        check_journeys(table)
    assert str(failure.value) == "1 bot journeys carry an account id instead of a number, e.g. February_10/9f8e7d6c_aaaaaaaa.nakama-0"


def test_storm_deaths_and_loot_of_a_bot_are_counted_too():
    bot = rows_of("February_10", "1440", MATCH, BOT_WALK + [(11, "Loot"), (12, "KilledByStorm")])
    table = match_table(journeys_of(rows_of("February_10", HUMAN, MATCH, WALK), bot))
    assert table.loc[MATCH[:8], ["storm_deaths", "loot", "deaths", "bot_deaths"]].tolist() == [1, 1, 0, 0]


def test_bot_number_equal_to_a_public_player_id_is_not_a_collision():
    digits_only = "12345678" + HUMAN[8:]
    table = journeys_of(rows_of("February_10", digits_only, MATCH, WALK), rows_of("February_10", "12345678", MATCH, BOT_WALK))
    check_journeys(table)
    assert sorted(table["id"]) == ["aaaaaaaa-12345678", "aaaaaaaa-bot12345678"]


def test_colliding_public_player_ids_are_rejected():
    same_prefix = HUMAN[:8] + "-0000-4000-8000-000000000000"
    table = journeys_of(rows_of("February_10", HUMAN, MATCH, WALK), rows_of("February_10", same_prefix, OTHER_MATCH, WALK))
    with pytest.raises(ValueError, match="player ids are not unique"):
        check_journeys(table)


def test_colliding_public_match_ids_are_rejected():
    same_prefix = MATCH[:8] + "-0000-4000-8000-000000000000.nakama-0"
    table = journeys_of(rows_of("February_10", HUMAN, MATCH, WALK), rows_of("February_10", OTHER_HUMAN, same_prefix, WALK))
    with pytest.raises(ValueError, match="match ids are not unique"):
        check_journeys(table)
