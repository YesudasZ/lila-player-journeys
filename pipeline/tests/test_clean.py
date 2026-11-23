"""The four cleaning rules, each on the smallest data that shows it."""
import pytest

from pipeline.clean import (
    clean,
    drop_kills_mirroring_a_death,
    end_paths_at_death,
    keep_first_half_of_files_written_twice,
    keep_one_copy_per_journey,
)
from pipeline.tests.helpers import HUMAN, MATCH, OTHER_HUMAN, OTHER_MATCH, frame, rows_of

WALK = [(0, "Position"), (5, "Position"), (10, "Position")]
BOT_WALK = [(5, "BotPosition"), (10, "BotPosition")]


def events(rows):
    return list(zip((rows["ts"] - rows["ts"].min()).tolist(), rows["event"].tolist()))


# Rule 1


def test_journey_stored_twice_keeps_the_copy_filed_with_most_of_its_match():
    rows = frame(
        rows_of("February_10", HUMAN, MATCH, WALK),
        rows_of("February_11", HUMAN, MATCH, WALK),
        rows_of("February_11", "1440", MATCH, BOT_WALK),
        rows_of("February_11", "1444", MATCH, BOT_WALK),
    )
    kept = keep_one_copy_per_journey(rows)
    assert sorted(kept["file"].unique()) == [f"February_11/1440_{MATCH}", f"February_11/1444_{MATCH}", f"February_11/{HUMAN}_{MATCH}"]
    assert len(rows) - len(kept) == len(WALK)


def test_tie_between_copies_goes_to_the_first_file_by_name():
    rows = frame(rows_of("February_11", HUMAN, MATCH, WALK), rows_of("February_10", HUMAN, MATCH, WALK))
    assert keep_one_copy_per_journey(rows)["file"].unique().tolist() == [f"February_10/{HUMAN}_{MATCH}"]


def test_copies_that_differ_are_an_error_not_a_silent_drop():
    rows = frame(rows_of("February_10", HUMAN, MATCH, WALK), rows_of("February_11", HUMAN, MATCH, WALK + [(15, "Loot")]))
    with pytest.raises(ValueError, match="same journey with different rows"):
        keep_one_copy_per_journey(rows)


def test_same_player_in_two_matches_is_two_journeys():
    rows = frame(rows_of("February_10", HUMAN, MATCH, WALK), rows_of("February_10", HUMAN, OTHER_MATCH, WALK))
    assert len(keep_one_copy_per_journey(rows)) == len(rows)


# Rule 2


def test_file_written_twice_keeps_its_first_half():
    once = [(0, "Position"), (5, "Loot"), (5, "Loot"), (10, "BotKilled")]
    rows = frame(rows_of("February_10", HUMAN, MATCH, once + once), rows_of("February_10", OTHER_HUMAN, OTHER_MATCH, WALK))
    kept = keep_first_half_of_files_written_twice(rows)
    assert events(kept[kept["user_id"] == HUMAN]) == once
    assert len(kept[kept["user_id"] == OTHER_HUMAN]) == len(WALK)


def test_file_that_only_looks_repetitive_is_left_alone():
    rows = rows_of("February_10", HUMAN, MATCH, [(0, "Position"), (5, "Loot"), (0, "Position"), (5, "Position")])
    assert len(keep_first_half_of_files_written_twice(rows)) == 4


# Rule 3


def test_kill_mirroring_a_death_is_dropped_and_the_death_stays():
    rows = rows_of("February_10", HUMAN, MATCH, [(0, "Position"), (5, "Kill", 3.0, 4.0), (5, "Killed", 3.0, 4.0)])
    assert events(drop_kills_mirroring_a_death(rows)) == [(0, "Position"), (5, "Killed")]


def test_kill_without_a_twin_is_kept():
    elsewhere = rows_of("February_10", HUMAN, MATCH, [(0, "Position"), (5, "Kill", 3.0, 4.0), (5, "Killed", 9.0, 4.0)])
    earlier = rows_of("February_10", OTHER_HUMAN, MATCH, [(0, "Position"), (4, "Kill", 3.0, 4.0), (5, "Killed", 3.0, 4.0)])
    assert len(drop_kills_mirroring_a_death(frame(elsewhere, earlier))) == 6


# Rule 4


def test_path_ends_at_the_death_row():
    rows = rows_of(
        "February_10",
        HUMAN,
        MATCH,
        [(0, "Position"), (5, "Position"), (5, "BotKilled"), (5, "Position"), (8, "Position"), (9, "BotKill"), (9, "Loot")],
    )
    assert events(end_paths_at_death(rows)) == [(0, "Position"), (5, "Position"), (5, "BotKilled"), (9, "BotKill"), (9, "Loot")]


def test_bot_path_ends_at_its_death_too():
    rows = rows_of("February_10", "1440", MATCH, [(5, "BotPosition"), (10, "BotKilled"), (15, "BotPosition")])
    assert events(end_paths_at_death(rows)) == [(0, "BotPosition"), (5, "BotKilled")]


def test_journey_without_a_death_keeps_every_row():
    rows = rows_of("February_10", HUMAN, MATCH, WALK + [(12, "Loot")])
    assert len(end_paths_at_death(rows)) == 4


# All four together


def test_clean_reports_what_each_rule_removed():
    doubled = [(0, "Position"), (5, "BotKilled"), (7, "Position")]
    rows = frame(
        rows_of("February_10", HUMAN, MATCH, WALK),
        rows_of("February_11", HUMAN, MATCH, WALK),
        rows_of("February_11", "1440", MATCH, BOT_WALK),
        rows_of("February_12", OTHER_HUMAN, OTHER_MATCH, doubled + doubled),
        rows_of("February_12", HUMAN, OTHER_MATCH, [(0, "Position"), (5, "Kill", 1.0, 1.0), (5, "Killed", 1.0, 1.0)]),
    )
    cleaned = clean(rows)
    assert cleaned.removed == {
        "spare_copy_of_journey": 3,
        "second_half_of_file_written_twice": 3,
        "kill_mirroring_killed": 1,
        "movement_after_death": 1,
    }
    assert len(cleaned.rows) == len(rows) - 8


def test_clean_orders_rows_by_time_and_keeps_file_order_within_a_second():
    rows = rows_of("February_10", HUMAN, MATCH, [(5, "Position"), (5, "Loot"), (0, "Position"), (5, "BotKill")])
    assert events(clean(rows).rows) == [(0, "Position"), (5, "Position"), (5, "Loot"), (5, "BotKill")]


def test_identical_loot_rows_are_kept():
    rows = rows_of("February_10", HUMAN, MATCH, [(0, "Position"), (5, "Loot", 1.0, 1.0), (5, "Loot", 1.0, 1.0), (5, "Loot", 1.0, 1.0)])
    cleaned = clean(rows)
    assert (cleaned.rows["event"] == "Loot").sum() == 3
    assert sum(cleaned.removed.values()) == 0
