"""The reference for playback, held to values worked out by hand (docs/DATA_FORMAT.md, rule 4)."""
import pytest

from pipeline.playback import MADE_UP_ONE_ROW, ONE_ROW, cases_shown, head_at, path_length, playback_fixture, sample_times

STEP = 5
DEATH = frozenset({3})


def test_head_moves_in_a_straight_line_between_two_rows_a_step_apart():
    t, u, v = [0, 5], [0, 100], [50, 10]
    assert head_at(t, u, v, 2, 0, STEP) == (0.0, 50.0)
    assert head_at(t, u, v, 2, 2.5, STEP) == pytest.approx((50.0, 30.0))
    assert head_at(t, u, v, 2, 5, STEP) == (100.0, 10.0)
    assert head_at([0, 2], [0, 100], [0, 0], 2, 0.5, STEP) == pytest.approx((25.0, 0.0))  # a shorter step is a straight line too


def test_head_stands_still_across_a_long_gap_and_covers_it_in_the_last_step():
    t, u, v = [0, 20], [0, 100], [0, 40]
    assert head_at(t, u, v, 2, 10, STEP) == (0.0, 0.0)
    assert head_at(t, u, v, 2, 15, STEP) == (0.0, 0.0)  # it leaves now
    assert head_at(t, u, v, 2, 17.5, STEP) == pytest.approx((50.0, 20.0))
    assert head_at(t, u, v, 2, 20, STEP) == (100.0, 40.0)


def test_a_death_long_after_the_last_sample_is_reached_in_the_last_step_and_the_head_stays_there():
    t, u, v = [0, 5, 35], [0, 10, 30], [0, 0, 0]
    assert head_at(t, u, v, 3, 20, STEP) == (10.0, 0.0)
    assert head_at(t, u, v, 3, 32.5, STEP) == pytest.approx((20.0, 0.0))
    assert head_at(t, u, v, 3, 35, STEP) == (30.0, 0.0)
    assert head_at(t, u, v, 3, 500, STEP) == (30.0, 0.0)


def test_of_two_rows_in_the_same_second_the_later_one_counts():
    t, u, v = [0, 5, 5, 10], [0, 10, 20, 30], [0, 0, 0, 0]
    assert head_at(t, u, v, 4, 4.5, STEP) == pytest.approx((9.0, 0.0))  # on its way to the first of the two
    assert head_at(t, u, v, 4, 5, STEP) == (20.0, 0.0)
    assert head_at(t, u, v, 4, 7.5, STEP) == pytest.approx((25.0, 0.0))  # onwards from the second


def test_a_journey_of_one_row_appears_at_its_second_and_stays():
    assert head_at([7], [1200], [3400], 1, 6.9, STEP) is None
    assert head_at([7], [1200], [3400], 1, 7, STEP) == (1200.0, 3400.0)
    assert head_at([7], [1200], [3400], 1, 700, STEP) == (1200.0, 3400.0)


def test_a_journey_is_not_on_the_map_before_its_first_row():
    assert head_at([5, 10], [0, 10], [0, 0], 2, 4.99, STEP) is None
    assert head_at([5, 10], [0, 10], [0, 0], 2, 5, STEP) == (0.0, 0.0)
    assert head_at([], [], [], 0, 3, STEP) is None


def test_rows_after_the_path_do_not_move_the_head():
    t, u, v = [0, 5, 6], [0, 10, 99], [0, 0, 99]  # the third row is a kill recorded after the death
    assert head_at(t, u, v, 2, 6, STEP) == (10.0, 0.0)


def test_path_ends_at_the_death_row():
    assert path_length([0, 0, 3, 4], DEATH) == 3
    assert path_length([1, 1, 4], DEATH) == 3
    assert path_length([3], DEATH) == 1


def test_sample_times_surround_every_row_and_cover_the_wait_and_the_last_step_of_a_long_gap():
    assert sample_times([0, 20], 2, STEP) == [-0.5, 0.0, 5.0, 10.0, 15.0, 17.5, 20.0, 20.5, 80.0]
    assert sample_times([5, 10, 10], 3, STEP) == [4.5, 5.0, 6.25, 7.5, 10.0, 10.5, 70.0]
    assert sample_times([7], 1, STEP) == [6.5, 7.0, 7.5, 67.0]


def journey(journey_id, t, u, events):
    return {"id": journey_id, "t": t, "u": u, "v": [0] * len(t), "e": events}


JOURNEYS = [
    journey("m1-long", [0, 5, 10, 30], [0, 1, 2, 3], [0, 0, 0, 0]),  # a step and a long gap
    journey("m1-short", [0, 5], [0, 1], [0, 0]),  # a step, in the shortest path
    journey("m2-died", [0, 5, 40], [0, 1, 9], [0, 0, 3]),  # a death long after the last sample
    journey("m3-twice", [0, 5, 5], [0, 1, 2], [0, 0, 0]),  # two rows in one second, at different places
    journey("m4-bot7", [5, 10], [0, 1], [1, 1]),  # not on the map at 0:00
    journey("m5-still", [0, 5, 5, 40], [4, 4, 4, 4], [0, 0, 0, 0]),  # it never moves, so it shows no case
]


def test_a_case_counts_only_where_the_place_changes():
    assert cases_shown(JOURNEYS[0], 4, False, STEP) == {"a 5 s step", "a long gap"}
    assert cases_shown(JOURNEYS[2], 3, True, STEP) == {"a 5 s step", "a death long after the last sample"}  # the gap before a death is not "a long gap"
    assert cases_shown(JOURNEYS[5], 4, False, STEP) == set()


def test_fixture_takes_the_shortest_journey_that_shows_each_case_and_adds_the_made_up_one():
    fixture = playback_fixture(JOURNEYS, DEATH, STEP)
    assert fixture["sample_step_seconds"] == STEP
    assert [(case["case"], case["id"], case["made_up"]) for case in fixture["cases"]] == [
        ("a 5 s step", "m1-short", False),  # as short as m4-bot7, and its id sorts first
        ("a long gap", "m1-long", False),
        ("a death long after the last sample", "m2-died", False),
        ("two rows in the same second", "m3-twice", False),
        ("not on the map at 0:00", "m4-bot7", False),
        (ONE_ROW, MADE_UP_ONE_ROW["id"], True),
    ]
    step_case = fixture["cases"][0]
    assert (step_case["path_length"], step_case["t"], step_case["u"]) == (2, [0, 5], [0, 1])
    assert step_case["heads"][0] == {"at": -0.5, "head": None}
    assert {"at": 2.5, "head": [0.5, 0.0]} in step_case["heads"]
    assert fixture["cases"][2]["path_length"] == 3 and fixture["cases"][-1]["heads"][0] == {"at": 6.5, "head": None}


def test_a_case_that_no_journey_shows_is_left_out():
    fixture = playback_fixture(JOURNEYS[1:2], DEATH, STEP)
    assert [case["case"] for case in fixture["cases"]] == ["a 5 s step", ONE_ROW]
