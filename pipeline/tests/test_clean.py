"""The four cleaning rules, each on the smallest data that shows it."""
import numpy as np
import pandas as pd
import pytest

from pipeline.clean import (
    after_death,
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


def test_tie_between_copies_goes_to_the_folder_that_sorts_first():
    rows = frame(rows_of("February_11", HUMAN, MATCH, WALK), rows_of("February_10", HUMAN, MATCH, WALK))
    assert keep_one_copy_per_journey(rows)["file"].unique().tolist() == [f"February_10/{HUMAN}_{MATCH}"]


def test_copies_that_differ_are_an_error_not_a_silent_drop():
    rows = frame(rows_of("February_10", HUMAN, MATCH, WALK), rows_of("February_11", HUMAN, MATCH, WALK + [(15, "Loot")]))
    with pytest.raises(ValueError, match="same journey with different rows") as failure:
        keep_one_copy_per_journey(rows)
    assert HUMAN[:8] in str(failure.value) and HUMAN not in str(failure.value)  # a message never carries a full id


def test_copies_differing_only_in_position_are_an_error():
    rows = frame(
        rows_of("February_10", HUMAN, MATCH, [(0, "Position", 1.0, 1.0), (5, "Position", 2.0, 2.0)]),
        rows_of("February_11", HUMAN, MATCH, [(0, "Position", 1.0, 1.0), (5, "Position", 9.0, 2.0)]),
    )
    with pytest.raises(ValueError, match="same journey with different rows"):
        keep_one_copy_per_journey(rows)


@pytest.mark.parametrize("day_written_twice", ["February_10", "February_11"])
def test_copy_that_was_also_written_twice_is_still_the_same_journey(day_written_twice):
    days = {"February_10": WALK, "February_11": WALK} | {day_written_twice: WALK + WALK}
    cleaned = clean(frame(*(rows_of(day, HUMAN, MATCH, written) for day, written in days.items())))
    assert events(cleaned.rows) == WALK
    assert cleaned.removed["spare_copy_of_journey"] + cleaned.removed["second_half_of_file_written_twice"] == 2 * len(WALK)


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


def test_file_repeating_its_events_at_other_positions_is_not_written_twice():
    elsewhere = [(0, "Position", 1.0, 1.0), (5, "Position", 2.0, 2.0), (0, "Position", 3.0, 3.0), (5, "Position", 4.0, 4.0)]
    rows = rows_of("February_10", HUMAN, MATCH, elsewhere)
    assert len(keep_first_half_of_files_written_twice(rows)) == 4


# Rule 3


def test_kill_mirroring_a_death_is_dropped_and_the_death_stays():
    rows = rows_of("February_10", HUMAN, MATCH, [(0, "Position"), (5, "Kill", 3.0, 4.0), (5, "Killed", 3.0, 4.0)])
    assert events(drop_kills_mirroring_a_death(rows)) == [(0, "Position"), (5, "Killed")]


def test_kill_without_a_twin_is_kept():
    elsewhere = rows_of("February_10", HUMAN, MATCH, [(0, "Position"), (5, "Kill", 3.0, 4.0), (5, "Killed", 9.0, 4.0)])
    earlier = rows_of("February_10", OTHER_HUMAN, MATCH, [(0, "Position"), (4, "Kill", 3.0, 4.0), (5, "Killed", 3.0, 4.0)])
    assert len(drop_kills_mirroring_a_death(frame(elsewhere, earlier))) == 6


def test_only_a_kill_row_and_a_killed_row_make_a_twin():
    bot_kill = rows_of("February_10", HUMAN, MATCH, [(0, "Position"), (5, "BotKill", 3.0, 4.0), (5, "Killed", 3.0, 4.0)])
    bot_killed = rows_of("February_10", OTHER_HUMAN, MATCH, [(0, "Position"), (5, "Kill", 3.0, 4.0), (5, "BotKilled", 3.0, 4.0)])
    assert len(drop_kills_mirroring_a_death(frame(bot_kill, bot_killed))) == 6


def test_kill_at_another_elevation_is_not_a_twin():
    rows = rows_of("February_10", HUMAN, MATCH, [(0, "Position"), (5, "Kill", 3.0, 4.0), (5, "Killed", 3.0, 4.0)])
    rows.loc[rows["event"] == "Killed", "y"] = np.float32(50.0)
    assert len(drop_kills_mirroring_a_death(rows)) == 3


# Rule 4


def test_path_ends_at_the_death_row():
    rows = rows_of(
        "February_10",
        HUMAN,
        MATCH,
        [(0, "Position"), (5, "Position"), (5, "BotKilled"), (5, "Position"), (8, "Position"), (9, "BotKill"), (9, "Loot")],
    )
    assert events(end_paths_at_death(rows)) == [(0, "Position"), (5, "Position"), (5, "BotKilled"), (9, "BotKill"), (9, "Loot")]


def test_storm_death_ends_the_path():
    rows = rows_of("February_10", HUMAN, MATCH, [(0, "Position"), (5, "KilledByStorm"), (7, "Position"), (8, "Loot")])
    assert events(end_paths_at_death(rows)) == [(0, "Position"), (5, "KilledByStorm"), (8, "Loot")]


def test_bot_path_ends_at_its_death_too():
    rows = rows_of("February_10", "1440", MATCH, [(5, "BotPosition"), (10, "BotKilled"), (15, "BotPosition")])
    assert events(end_paths_at_death(rows)) == [(0, "BotPosition"), (5, "BotKilled")]


def test_after_death_is_true_behind_the_death_row_and_false_on_it():
    rows = frame(
        rows_of("February_10", HUMAN, MATCH, [(0, "Position"), (5, "BotKilled"), (5, "Position"), (9, "BotKill")]),
        rows_of("February_10", OTHER_HUMAN, MATCH, [(0, "Position"), (5, "Loot")]),
    )
    assert after_death(rows).tolist() == [False, False, True, True, False, False]


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


def test_rows_come_out_in_time_order_with_file_order_inside_a_second():
    rows = rows_of("February_10", HUMAN, MATCH, [(5, "Position"), (5, "Loot"), (0, "Position"), (5, "BotKill")])
    assert events(end_paths_at_death(rows)) == [(0, "Position"), (5, "Position"), (5, "Loot"), (5, "BotKill")]


def test_twin_inside_a_file_written_twice_is_counted_under_both_rules_in_order():
    once = [(0, "Position"), (5, "Kill", 1.0, 1.0), (5, "Killed", 1.0, 1.0)]
    cleaned = clean(rows_of("February_10", HUMAN, MATCH, once + once))
    assert cleaned.removed == {
        "spare_copy_of_journey": 0,
        "second_half_of_file_written_twice": 3,
        "kill_mirroring_killed": 1,
        "movement_after_death": 0,
    }


def test_spare_copy_that_was_written_twice_is_counted_whole_under_rule_1_and_the_rules_run_in_order():
    cleaned = clean(frame(rows_of("February_10", HUMAN, MATCH, WALK), rows_of("February_11", HUMAN, MATCH, WALK + WALK)))
    assert list(cleaned.removed.items()) == [
        ("spare_copy_of_journey", 6),
        ("second_half_of_file_written_twice", 0),
        ("kill_mirroring_killed", 0),
        ("movement_after_death", 0),
    ]


def test_rules_do_not_rely_on_the_order_of_the_rows_in_the_frame():
    once = WALK + [(10, "Loot"), (10, "BotKill")]
    in_file_order = frame(
        rows_of("February_10", HUMAN, MATCH, once),
        rows_of("February_11", HUMAN, MATCH, once + once),
        rows_of("February_11", "1440", MATCH, BOT_WALK),
        rows_of("February_11", "1444", MATCH, BOT_WALK),
    )
    mixed = in_file_order.sort_values(["x", "row"], ascending=[True, False])  # files interleaved, each one back to front inside a second
    cleaned = clean(mixed)
    assert (cleaned.removed["spare_copy_of_journey"], cleaned.removed["second_half_of_file_written_twice"]) == (5, 5)
    assert events(cleaned.rows[cleaned.rows["user_id"] == HUMAN]) == once


def test_rules_do_not_rely_on_row_labels():
    files = [
        rows_of("February_10", HUMAN, MATCH, WALK + WALK),
        rows_of("February_10", OTHER_HUMAN, MATCH, [(0, "Position"), (5, "Kill", 1.0, 1.0), (5, "Killed", 1.0, 1.0), (6, "Loot")]),
    ]
    cleaned = clean(pd.concat(files))  # both files number their rows from 0
    assert events(cleaned.rows[cleaned.rows["user_id"] == HUMAN]) == WALK
    assert events(cleaned.rows[cleaned.rows["user_id"] == OTHER_HUMAN]) == [(0, "Position"), (5, "Killed"), (6, "Loot")]


# What the rules do not cover stops the cleaning


def test_file_written_three_times_is_an_error_not_a_shuffled_path():
    with pytest.raises(ValueError, match="1 files have rows out of time order") as failure:
        clean(rows_of("February_10", HUMAN, MATCH, WALK + WALK + WALK))
    assert HUMAN not in str(failure.value)


def test_journey_with_two_death_rows_is_an_error_that_names_the_file_by_its_public_ids():
    with pytest.raises(ValueError) as failure:
        clean(rows_of("February_10", HUMAN, MATCH, WALK + [(12, "BotKilled"), (12, "KilledByStorm")]))
    assert str(failure.value) == "1 journeys have more than one death row, e.g. February_10/1a2b3c4d_aaaaaaaa.nakama-0"


def test_killed_row_stored_twice_is_reported_as_two_death_rows():
    stored_twice = [(0, "Position"), (5, "Kill", 3.0, 4.0), (5, "Killed", 3.0, 4.0), (5, "Killed", 3.0, 4.0)]
    with pytest.raises(ValueError, match="1 journeys have more than one death row"):
        clean(rows_of("February_10", HUMAN, MATCH, stored_twice))


def test_identical_loot_rows_are_kept():
    rows = rows_of("February_10", HUMAN, MATCH, [(0, "Position"), (5, "Loot", 1.0, 1.0), (5, "Loot", 1.0, 1.0), (5, "Loot", 1.0, 1.0)])
    cleaned = clean(rows)
    assert (cleaned.rows["event"] == "Loot").sum() == 3
    assert sum(cleaned.removed.values()) == 0
