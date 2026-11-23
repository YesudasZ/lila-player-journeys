"""The profiler without the raw data: the metrics registry, how values are written, the markdown, sections on synthetic rows."""
import json
import sys

import numpy as np
import pytest
from PIL import Image

from pipeline.dataset import FULL_ID, load_raw
from pipeline.maps import MAPS
from pipeline.profile.actors import events
from pipeline.profile.cleaning import cleaning
from pipeline.profile.combat import combat
from pipeline.profile.files import file_table, inventory
from pipeline.profile.metrics import Metrics, joined
from pipeline.profile.quality import deaths, duplicates
from pipeline.profile.render import render_markdown
from pipeline.profile.report import TOPICS
from pipeline.profile.sampling import movement_pairs, standing_still
from pipeline.profile.timestamps import timestamps, ts_steps
from pipeline.profile.values import json_ready, short_file
from pipeline.profile_data import main
from pipeline.tests.helpers import HUMAN, LATE_MATCH, MATCH, OTHER_HUMAN, OTHER_MATCH, THIRD_MATCH, frame, rows_of, write_files

WALK = [(0, "Position"), (5, "Position"), (10, "Position")]
BOT_WALK = [(5, "BotPosition"), (10, "BotPosition")]
HUMAN_EVENTS = [
    (0, "Position"),
    (5, "Position"),
    (6, "Loot", 1.0, 1.0),
    (6, "Loot", 1.0, 1.0),
    (7, "BotKill"),
    (10, "Position"),
    (12, "BotKilled"),
    (14, "Position"),
    (15, "BotKill"),
]
ANONYMOUS_ONCE = [(0, "Position"), (20, "Position"), (25, "Loot")]
DUEL = [(0, "Position"), (5, "Position"), (8, "Kill", 1.0, 1.0), (8, "Killed", 1.0, 1.0)]
DIES_TWICE = [(30, "Position"), (35, "Position"), (38, "BotKilled"), (40, "KilledByStorm")]


def values(entries, prefix=""):
    """Key and value of every metric whose key starts with ``prefix``, in the order the report lists them."""
    return [(key, entry["value"]) for key, entry in entries.items() if key.startswith(prefix)]


def dataset():
    """Seven files in the five day folders and on the three maps, with every case the cleaning rules cover."""
    return frame(
        rows_of("February_10", HUMAN, MATCH, HUMAN_EVENTS),
        rows_of("February_11", HUMAN, MATCH, HUMAN_EVENTS),  # the same journey, stored a second time
        rows_of("February_11", "1440", MATCH, [(5, "BotPosition"), (8, "BotKill"), (10, "BotPosition"), (11, "BotKilled")]),
        rows_of("February_11", "999", MATCH, BOT_WALK),
        rows_of("February_12", "1379", OTHER_MATCH, ANONYMOUS_ONCE + ANONYMOUS_ONCE, map_id="GrandRift"),  # written twice
        rows_of("February_13", OTHER_HUMAN, THIRD_MATCH, DUEL, map_id="Lockdown"),  # its Kill row mirrors its Killed row
        rows_of("February_14", HUMAN, LATE_MATCH, DIES_TWICE, map_id="Lockdown"),  # two death rows in one journey
    )


@pytest.fixture(scope="module")
def written(tmp_path_factory):
    """The folder the command has written its report into, from the synthetic dataset."""
    folder = tmp_path_factory.mktemp("profile")
    raw = folder / "player_data"
    (raw / "minimaps").mkdir(parents=True)
    for cfg in MAPS.values():
        Image.new("RGB", (40, 40)).save(raw / "minimaps" / cfg.minimap_file)
    write_files(raw, dataset())
    with pytest.MonkeyPatch.context() as patched:
        patched.setattr(sys, "argv", ["profile_data", "--raw", str(raw), "--out", str(folder / "out")])
        main()
    return folder / "out"


# The registry


def test_metrics_keep_the_order_measured_and_fill_the_fields_into_key_and_definition():
    found = Metrics({"files_total": "All files.", "files_{day}": "Files inside {day}/."})
    found.add("files_total", np.int64(3))
    found.add("files_{day}", 2, day="February_10")
    found.add("files_{day}", 1, day="February_11")
    assert list(found.as_dict().items()) == [
        ("files_total", {"value": 3, "definition": "All files."}),
        ("files_February_10", {"value": 2, "definition": "Files inside February_10/."}),
        ("files_February_11", {"value": 1, "definition": "Files inside February_11/."}),
    ]
    earlier = {"rows_total": {"value": 5, "definition": "All rows."}}
    assert values(joined(earlier, found.as_dict())) == [
        ("rows_total", 5),
        ("files_total", 3),
        ("files_February_10", 2),
        ("files_February_11", 1),
    ]


def test_metric_measured_twice_is_an_error_not_a_silent_overwrite():
    found = Metrics({"rows_{day}": "Rows in {day}/."})
    found.add("rows_{day}", 5, day="February_10")
    with pytest.raises(ValueError, match="metric rows_February_10 is measured twice"):
        found.add("rows_{day}", 6, day="February_10")
    assert values(found.as_dict()) == [("rows_February_10", 5)]
    by_another_section = {"rows_February_10": {"value": 6, "definition": "Rows in February_10/, again."}}
    with pytest.raises(ValueError, match="metric rows_February_10 is measured twice"):
        joined(found.as_dict(), by_another_section)


# How values are written


def test_json_ready_makes_keys_text_tuples_lists_and_numpy_numbers_plain():
    nested = {5: (np.int64(2), np.float32(0.5), 2 / 3), "by_map": [{"Lockdown": np.bool_(False), "span": np.float64("nan")}]}
    converted = json_ready(nested)
    assert converted == {"5": [2, 0.5, 0.6667], "by_map": [{"Lockdown": False, "span": None}]}
    assert [type(number) for number in converted["5"]] == [int, float, float]
    assert json.dumps(converted) == '{"5": [2, 0.5, 0.6667], "by_map": [{"Lockdown": false, "span": null}]}'


def test_ids_in_a_file_name_are_cut_whatever_their_format():
    assert short_file(f"February_10/{HUMAN}_{MATCH}") == "February_10/1a2b3c4d_aaaaaaaa"
    assert short_file(f"February_10/1440_{MATCH}") == "February_10/1440_aaaaaaaa"
    assert short_file(f"February_10/{HUMAN.upper()}_{MATCH}") == "February_10/1A2B3C4D_aaaaaaaa"


TINY_REPORT = {
    "readme_check": [{"claim": "Total files", "readme": 1243, "data": {"February_10": 2}, "holds": "no"}],
    "metrics": {"files_schema": {"rows_total": {"value": 89104, "definition": "Rows summed over all files."}}},
    "detail_definitions": {"timestamps > gap": "a|b"},
    "details": {
        "timestamps": {
            "raw_ts_max": 1770727161,
            "ts_goes_backwards": [],
            "gap_top_values": {"5": 1000, "10": True},
            "per_folder": [{"folder": "February_10", "files": 2}, {"folder": "February_11"}],
        }
    },
}
TINY_MARKDOWN = r"""# Data profile of player_data.zip

Generated by `make profile` (pipeline/profile_data.py). Do not edit by hand.
Every number comes from the 1,243 raw files; ids are cut to eight characters.
`ts` values are the raw integers stored in the files.

## README claims against the data

| Claim | README | Data | Holds |
|---|---|---|---|
| Total files | 1,243 | February_10: 2 | no |

## Metrics

Each value is listed with the exact definition used to compute it.

### Files schema

| Metric | Value | Definition |
|---|---|---|
| `rows_total` | 89,104 | Rows summed over all files. |

## Details

| Entry | How it is computed |
|---|---|
| timestamps > gap | a\|b |

### Timestamps

Raw ts max: 1770727161

Ts goes backwards: none

#### Gap top values

|  | value |
|---|---|
| 5 | 1,000 |
| 10 | True |

#### Per folder

| folder | files |
|---|---|
| February_10 | 2 |
| February_11 |  |
"""


def test_markdown_of_a_tiny_report():
    assert render_markdown(TINY_REPORT) == TINY_MARKDOWN


# Sections, on synthetic rows


def test_events_are_counted_in_total_and_per_kind_of_user_id():
    rows = frame(
        rows_of("February_10", HUMAN, MATCH, [(0, "Position"), (5, "Position"), (6, "Loot"), (9, "BotKill")]),
        rows_of("February_10", "1440", MATCH, BOT_WALK + [(11, "BotKilled")]),
    )
    metrics, details = events(rows)
    assert values(metrics, "rows_event_") == [
        ("rows_event_BotKill", 1),
        ("rows_event_BotKilled", 1),
        ("rows_event_BotPosition", 2),
        ("rows_event_Loot", 1),
        ("rows_event_Position", 2),
    ]
    assert values(metrics, "rows_numeric_") == [
        ("rows_numeric_BotKill", 0),
        ("rows_numeric_BotKilled", 1),
        ("rows_numeric_BotPosition", 2),
        ("rows_numeric_Loot", 0),
        ("rows_numeric_Position", 0),
    ]
    assert metrics["rows_uuid_Position"] == {
        "value": 2,
        "definition": "Rows whose event is Position and whose user_id is uuid "
        "(uuid = lowercase 8-4-4-4-12 hexadecimal, numeric = ASCII digits only).",
    }
    assert json_ready(details["movement_share_of_rows"]) == 0.5714


def test_duplicates_are_counted_within_a_file_and_across_files():
    loot = (5, "Loot", 1.0, 1.0)
    rows = frame(
        rows_of("February_10", HUMAN, MATCH, [(0, "Position"), loot, loot, (5, "Loot", 2.0, 2.0), (10, "Position"), loot]),
        rows_of("February_10", "1440", MATCH, [(5, "BotPosition"), (5, "BotPosition")]),
        rows_of("February_11", "1440", MATCH, [(5, "BotPosition")]),
    )
    metrics, details = duplicates(rows)
    assert values(metrics) == [
        ("duplicate_rows_within_file", 3),
        ("duplicate_rows_within_file_BotPosition", 1),
        ("duplicate_rows_within_file_Loot", 2),
        ("duplicate_rows_whole_dataset", 4),
    ]
    assert json_ready(details) == {
        "within_file_by_event": {"Loot": 2, "BotPosition": 1},
        "within_file_in_the_files_whose_ts_goes_backwards": {"Loot": 2},
        "within_file_in_all_other_files": {"BotPosition": 1},
        "within_file_copies_directly_after_their_twin": {"rows": 2, "share": 0.6667},
        "extra_copies_only_found_across_files": 1,
        "loot_rows_per_identical_file_ts_position": {"1": 1, "3": 1},
        "rows_sharing_file_ts_event_but_not_position": {"Loot": 1},
    }


def test_deaths_section_measures_what_is_recorded_after_a_death():
    died = [(0, "Position"), (5, "Position"), (7, "BotKill"), (7, "BotKilled"), (7, "Loot"), (10, "Position"), (12, "BotKill")]
    rows = frame(
        rows_of("February_10", HUMAN, MATCH, died),
        rows_of("February_10", "1440", MATCH, BOT_WALK),
        rows_of("February_10", OTHER_HUMAN, OTHER_MATCH, [(0, "Position"), (20, "Position"), (30, "KilledByStorm")], map_id="Lockdown"),
    )
    metrics, details = deaths(rows, file_table(rows))
    assert values(metrics) == [
        ("files_with_death_row", 2),
        ("files_with_several_death_rows", 0),
        ("rows_after_first_death", 2),
        ("rows_after_first_death_BotKill", 1),
        ("rows_after_first_death_Position", 1),
        ("rows_after_first_death_max_gap", 5),
        ("death_row_max_gap_to_file_end", 5),
        ("death_row_max_gap_after_last_movement_row", 10),
    ]
    assert details["non_movement_rows_after_first_death"] == [
        {"file": "February_10/1a2b3c4d_aaaaaaaa", "event": "BotKill", "seconds_after_death": 5}
    ]
    assert details["rows_in_the_same_second_as_the_death_but_later_in_file_order"] == {"Loot": 1}
    assert details["files_by_actor_and_fate"] == [
        {"actor": "bot", "BotKilled": 0, "KilledByStorm": 0, "no death row": 1},
        {"actor": "human", "BotKilled": 1, "KilledByStorm": 1, "no death row": 0},
    ]
    assert json_ready(details["storm_deaths_seconds_into_match_by_map"]) == {
        "Lockdown": {"deaths": 1, "min": 30, "p25": 30.0, "median": 30.0, "p75": 30.0, "max": 30}
    }


def test_a_player_standing_still_shows_as_a_long_gap_between_position_rows():
    stood_still = [(0, "Position", 0, 0), (5, "Position", 3, 4), (10, "Position", 3, 4), (16, "Position", 3, 4), (36, "Position", 3, 4.2)]
    rows = frame(
        rows_of("February_10", HUMAN, MATCH, stood_still + [(36, "Loot")]),
        rows_of("February_10", "1440", MATCH, [(5, "BotPosition", 0.2, 0), (0, "BotPosition", 0, 0)]),  # not in time order
    )
    pairs = movement_pairs(rows)
    assert pairs["seconds"].fillna(-1).tolist() == [-1, 5, -1, 5, 5, 6, 20]  # the bot's file sorts first
    metrics, shares = standing_still(pairs, ts_steps(rows))
    assert values(metrics) == [
        ("movement_pairs_gap_5_moving_under_half_unit", 2),
        ("Position_pairs_gap_over_6", 1),
        ("Position_gap_sum_in_gaps_over_6", 20),
        ("Position_gap_sum", 36),
        ("rows_same_ts_as_previous_row", 1),
        ("Position_pairs_gap_5", 2),
        ("Position_pairs_gap_5_moving_under_half_unit", 1),
        ("Position_median_distance_gap_5", 2.5),
        ("Position_median_distance_gap_over_6", 0.2),
    ]
    assert json_ready(shares) == {
        "share_of_gap_5_pairs_moving_under_half_unit": 0.6667,
        "share_of_Position_pairs_with_gap_over_6": 0.25,
        "share_of_Position_time_inside_gaps_over_6": 0.5556,
    }


def test_timestamps_section_finds_a_file_written_twice_and_files_under_another_date():
    late = 37_400  # seconds after the first row: 23:02 UTC on 10 February, which is 04:32 on the 11th at UTC+05:30
    rows = frame(
        rows_of("February_10", HUMAN, MATCH, WALK + WALK),
        rows_of("February_11", "1440", MATCH, BOT_WALK),  # filed a day after its rows
        rows_of("February_10", OTHER_HUMAN, OTHER_MATCH, [(late, "Position"), (late + 5, "Position"), (late + 5, "Loot")]),
    )
    metrics, details = timestamps(rows, file_table(rows))
    assert values(metrics, "files_") == [
        ("files_ts_goes_backwards", 1),
        ("files_first_row_date_differs_from_folder_utc", 1),
        ("files_last_row_date_differs_from_folder_utc", 1),
        ("files_first_row_date_differs_from_folder_ist", 2),
        ("files_last_row_date_differs_from_folder_ist", 2),
        ("files_written_twice", 1),
    ]
    assert details["rows_where_ts_goes_backwards"] == [
        {"file": "February_10/1a2b3c4d_aaaaaaaa", "file_rows": 6, "row": 3, "event": "Position", "jump": -10, "file_written_twice": True}
    ]
    assert details["files_whose_last_row_utc_date_differs_from_folder"] == [
        {"file": "February_11/1440_aaaaaaaa", "last_row": "2026-02-10 12:39:31 UTC"}
    ]


def test_combat_pairs_a_kill_with_a_death_in_another_file_within_a_second():
    hunter = [(0, "Position"), (2, "BotKill"), (5, "Position"), (10, "Position"), (10, "BotKill", 20, -20)]
    rows = frame(
        rows_of("February_10", HUMAN, MATCH, hunter),
        rows_of("February_10", "1440", MATCH, BOT_WALK + [(11, "BotKilled", 23, -16)]),  # a second after the kill, 5 away
        rows_of("February_10", "999", MATCH, BOT_WALK + [(10, "BotKilled", 20, -12)]),  # in the second of the kill, 8 away
    )
    metrics, details = combat(rows, file_table(rows))
    assert values(metrics) == [
        ("files_with_Kill_or_Killed", 0),
        ("Kill_rows_with_Killed_twin_in_same_file", 0),
        ("Kill_twins_in_matches_with_several_Position_users", 0),
        ("Kill_twins_in_single_file_matches", 0),
        ("bot_BotKilled_rows_with_BotKill_in_another_file_within_1", 2),
    ]
    assert details["Kill_and_Killed_twins"] == {"twins": 0, "max_seconds_from_twin_to_end_of_file": None}
    assert json_ready(details["rows_paired_with_rows_in_another_file"]["human BotKill, partner bot BotKilled"]) == {
        "rows": 2,
        "rows_with_a_partner_within_1s": 1,
        "median_distance_to_nearest_partner": 5.0,
        "partners_at_identical_position": 0,
    }


def test_cleaning_section_counts_what_each_rule_removes_and_what_is_left():
    rows = dataset()
    metrics, details = cleaning(rows, file_table(rows))
    assert len(rows) == 38
    assert values(metrics, "rows_removed_") == [
        ("rows_removed_spare_copy_of_journey", 9),
        ("rows_removed_second_half_of_file_written_twice", 3),
        ("rows_removed_Kill_mirroring_Killed", 1),
        ("rows_removed_movement_after_death", 1),
        ("rows_removed_movement_after_death_with_later_ts", 1),
    ]
    assert values(metrics, "journeys_after_cleaning") == [
        ("journeys_after_cleaning", 6),
        ("journeys_after_cleaning_Position", 4),
        ("journeys_after_cleaning_BotPosition", 2),
        ("journeys_after_cleaning_with_death_row", 4),
        ("journeys_after_cleaning_with_several_death_rows", 1),
        ("journeys_after_cleaning_Position_with_death_row", 3),
    ]
    assert values(metrics)[-10:] == [
        ("rows_after_cleaning_human_BotKill", 2),
        ("rows_after_cleaning_human_BotKilled", 2),
        ("rows_after_cleaning_human_Killed", 1),
        ("rows_after_cleaning_human_KilledByStorm", 1),
        ("rows_after_cleaning_human_Loot", 3),
        ("rows_after_cleaning_bot_BotKill", 1),
        ("rows_after_cleaning_bot_BotKilled", 1),
        ("rows_after_cleaning_bot_Killed", 0),
        ("rows_after_cleaning_bot_KilledByStorm", 0),
        ("rows_after_cleaning_bot_Loot", 0),
    ]
    assert (metrics["rows_after_cleaning"]["value"], metrics["match_span_median_after_cleaning"]["value"]) == (24, 12.5)
    assert metrics["rows_kept_after_death_row"]["value"] == 1  # the late BotKill; the storm row after a death is a death row
    assert details["rows_kept_after_death_row_by_event"] == {"BotKill": 1}
    assert details["copy_kept_of_journeys_stored_twice"] == ["February_11/1a2b3c4d_aaaaaaaa"]


def test_unreadable_file_is_counted_and_listed_without_its_full_ids(tmp_path):
    write_files(tmp_path, frame(rows_of("February_10", HUMAN, MATCH, WALK), rows_of("February_11", "1440", MATCH, BOT_WALK)))
    (tmp_path / "February_11" / f"{OTHER_HUMAN}_{MATCH}").write_bytes(b"not parquet")
    metrics, details = inventory(load_raw(tmp_path))
    assert values(metrics) == [
        ("files_total", 3),
        ("files_February_10", 1),
        ("files_February_11", 2),
        ("files_named_nakama0", 3),
        ("files_named_parquet", 0),
        ("files_par1_magic", 2),
        ("files_unreadable", 1),
        ("rows_total", 5),
        ("rows_February_10", 3),
        ("rows_February_11", 2),
        ("rows_per_file_min", 2),
        ("rows_per_file_median", 2.5),
        ("rows_per_file_max", 3),
    ]
    assert [unreadable["file"] for unreadable in details["unreadable_files"]] == ["February_11/9f8e7d6c_aaaaaaaa.nakama-0"]


# The command, run on synthetic files


def test_command_writes_the_report_with_topics_and_sections_in_order(written):
    assert sorted(path.name for path in written.iterdir()) == ["profile_report.json", "profile_report.md"]
    report = json.loads((written / "profile_report.json").read_text())
    assert list(report) == ["readme_check", "metrics", "detail_definitions", "details"]
    assert [(topic, len(entries)) for topic, entries in report["metrics"].items()] == [
        ("files_schema", 29),
        ("actors_events", 47),
        ("time", 31),
        ("matches_quality", 37),
        ("coordinates", 43),
        ("cleaning", 43),
    ]
    sections = ["inventory", "schema", "naming", "events", "actors", "timestamps", "matches", "duplicates", "deaths", "combat"]
    assert list(report["details"]) == sections + ["coordinates", "cleaning"]
    assert sorted(name for names in TOPICS.values() for name in names) == sorted(report["details"])  # no section is left out
    assert [check["holds"] for check in report["readme_check"]] == ["no", "no", "no", "no", "partly", "yes", "no", "no", "no", "no"]
    assert report["details"]["combat"]["Kill_and_Killed_twins"] == {"twins": 1, "max_seconds_from_twin_to_end_of_file": 0}
    assert (written / "profile_report.md").read_text() == render_markdown(report)


def test_written_report_never_carries_a_full_player_or_match_id(written):
    report = json.loads((written / "profile_report.json").read_text())
    assert report["details"]["cleaning"]["copy_kept_of_journeys_stored_twice"] == ["February_11/1a2b3c4d_aaaaaaaa"]
    assert report["details"]["matches"]["journeys_split_across_files"][0]["journey"] == "1a2b3c4d_aaaaaaaa"
    for name in ("profile_report.json", "profile_report.md"):
        assert FULL_ID.search((written / name).read_text()) is None
