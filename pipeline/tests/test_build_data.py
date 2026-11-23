"""The whole build, on a small synthetic dataset that contains every case the cleaning rules cover."""
import gzip
import json
import os
import sys

import numpy as np
import pyarrow.parquet as pq
import pytest
from PIL import Image

import pipeline.build_data as build_data
from pipeline.build_data import build, counts_to_reconcile, differences_from_profile
from pipeline.dataset import EVENTS, FULL_ID, SCHEMA
from pipeline.encode import decode_uv
from pipeline.journeys import journey_table
from pipeline.maps import MAPS, uv_to_world
from pipeline.tests.helpers import (
    DAY,
    FIRST_TS,
    HUMAN,
    LATE_MATCH,
    MATCH,
    OTHER_HUMAN,
    OTHER_MATCH,
    THIRD_MATCH,
    frame,
    rows_of,
    write_file_with_text_events,
    write_files,
)

CODE = {event: code for code, event in enumerate(EVENTS)}
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
KILLED_BY_A_PLAYER = [(0, "Position"), (5, "Position"), (8, "Kill", 1.0, 1.0), (8, "Killed", 1.0, 1.0)]
KILLED_BY_THE_STORM_LATER = [(30, "Position"), (35, "Position"), (40, "KilledByStorm")]  # this match starts last
MINIMAP_SIZES = {"AmbroseValley": (40, 40), "GrandRift": (40, 38), "Lockdown": (60, 60)}
OUTPUT_FILES = [
    "fixtures/projection.json",
    "out/cleaning_report.json",
    "out/manifest.json",
    "out/maps/AmbroseValley.json",
    "out/maps/GrandRift.json",
    "out/maps/Lockdown.json",
    "out/minimaps/AmbroseValley.webp",
    "out/minimaps/GrandRift.webp",
    "out/minimaps/Lockdown.webp",
]


def dataset():
    return frame(
        rows_of("February_10", HUMAN, MATCH, HUMAN_EVENTS),
        rows_of("February_11", HUMAN, MATCH, HUMAN_EVENTS),  # the same journey, stored a second time
        rows_of("February_10", "1440", MATCH, [(5, "BotPosition"), (8, "BotKill"), (10, "BotPosition"), (11, "BotKilled")]),
        rows_of("February_10", "999", MATCH, [(5, "BotPosition"), (10, "BotPosition")]),
        rows_of("February_11", "1379", OTHER_MATCH, ANONYMOUS_ONCE + ANONYMOUS_ONCE, map_id="GrandRift"),  # written twice
        rows_of("February_11", OTHER_HUMAN, THIRD_MATCH, KILLED_BY_A_PLAYER, map_id="Lockdown"),
        rows_of("February_11", HUMAN, LATE_MATCH, KILLED_BY_THE_STORM_LATER, map_id="Lockdown"),
    )


def make_raw(root, rows):
    for map_id, cfg in MAPS.items():
        (root / "minimaps").mkdir(parents=True, exist_ok=True)
        Image.new("RGB", MINIMAP_SIZES[map_id], (30, 60, 90)).save(root / "minimaps" / cfg.minimap_file)
    write_files(root, rows)
    return root


@pytest.fixture
def built(tmp_path):
    raw = make_raw(tmp_path / "player_data", dataset())
    report = build(raw, tmp_path / "out", tmp_path / "fixtures")
    return tmp_path, report


def read(path):
    return json.loads(path.read_text())


def by_event(**counts):
    return {event: counts.get(event, 0) for event in EVENTS}


def written(folder):
    return sorted(str(path.relative_to(folder)) for path in folder.rglob("*") if path.is_file() and "player_data" not in path.parts)


def test_build_writes_exactly_these_files(built):
    assert written(built[0]) == OUTPUT_FILES


def test_cleaning_report_counts_every_rule(built):
    folder, report = built
    assert report["rows_in"] == 37
    assert report["removed"] == {
        "spare_copy_of_journey": 9,
        "second_half_of_file_written_twice": 3,
        "kill_mirroring_killed": 1,
        "movement_after_death": 1,
    }
    assert report["rows_out"] == 23
    assert report["journeys"] == {"total": 6, "human": 4, "anonymous": 1, "bot": 2}
    saved = read(folder / "out" / "cleaning_report.json")
    assert saved == {key: value for key, value in report.items() if key != "bundles"}
    assert list(saved["matches_by_day"].items()) == [("February_10", 1), ("February_11", 3)]
    assert saved["match_span_seconds"] == {"median": 12.5, "max": 25}


def test_report_counts_the_rows_left_per_event_and_per_actor(built):
    _, report = built
    assert report["rows_out_by_event"] == by_event(Position=9, BotPosition=4, Killed=1, BotKill=3, BotKilled=2, KilledByStorm=1, Loot=3)
    assert report["events_of_human_journeys"] == by_event(Position=9, Killed=1, BotKill=2, BotKilled=1, KilledByStorm=1, Loot=3)
    assert report["events_of_bot_journeys"] == by_event(BotPosition=4, BotKill=1, BotKilled=1)


def test_manifest_totals_and_match_entry(built):
    manifest = read(built[0] / "out" / "manifest.json")
    assert manifest["totals"] == {
        "matches": 4,
        "humans": 4,
        "anonymous": 1,
        "bots": 2,
        "kills": 2,
        "deaths": 2,
        "storm_deaths": 1,
        "loot": 3,
        "bot_kills": 1,
        "bot_deaths": 1,
        "rows": 23,
    }
    match = next(m for m in manifest["matches"] if m["id"] == MATCH[:8])
    assert match == {
        "id": "aaaaaaaa",
        "map": "AmbroseValley",
        "day": "February_10",
        "start": FIRST_TS,
        "span": 15,
        "humans": 1,
        "anonymous": 0,
        "bots": 2,
        "kills": 2,
        "deaths": 1,
        "storm_deaths": 0,
        "loot": 2,
        "bot_kills": 1,
        "bot_deaths": 1,
        "rows": 14,
    }


def test_days_are_listed_by_date_not_by_folder_name(tmp_path):
    walk = [(0, "Position"), (5, "Position")]
    rows = frame(on_day(10, HUMAN, MATCH, walk), on_day(9, HUMAN, OTHER_MATCH, walk))
    report = build(make_raw(tmp_path / "player_data", rows), tmp_path / "out", tmp_path / "fixtures")
    assert [day["id"] for day in read(tmp_path / "out" / "manifest.json")["days"]] == ["February_9", "February_10"]
    assert list(report["matches_by_day"].items()) == [("February_9", 1), ("February_10", 1)]


def test_file_belongs_to_its_folder_by_its_last_row_which_may_be_from_the_day_before(tmp_path):
    to_midnight = -45_561  # seconds from FIRST_TS back to 2026-02-10 00:00:00 UTC
    across_midnight = [(to_midnight - 10, "Position", 10.0, -20.0), (to_midnight + 10, "Position", 15.0, -20.0)]  # ends on the 10th
    raw = make_raw(tmp_path / "player_data", rows_of("February_11", HUMAN, MATCH, across_midnight))
    build(raw, tmp_path / "out", tmp_path / "fixtures")
    assert [day["id"] for day in read(tmp_path / "out" / "manifest.json")["days"]] == ["February_11"]


def test_february_29_is_a_day_folder(tmp_path):
    leap_day = 64_668_039  # seconds from FIRST_TS to 2028-02-29 00:00:00 UTC
    walk = [(leap_day, "Position", 10.0, -20.0), (leap_day + 5, "Position", 15.0, -20.0)]
    raw = make_raw(tmp_path / "player_data", rows_of("February_29", HUMAN, MATCH, walk))
    build(raw, tmp_path / "out", tmp_path / "fixtures")
    assert read(tmp_path / "out" / "manifest.json")["days"] == [{"id": "February_29", "date": "2028-02-29", "partial": False, "matches": 1}]


def test_manifest_keeps_the_matches_of_a_map_together_when_another_map_starts_earlier(tmp_path):
    rows = frame(
        rows_of("February_10", HUMAN, MATCH, [(30, "Position"), (35, "Position")]),
        rows_of("February_10", OTHER_HUMAN, OTHER_MATCH, [(0, "Position"), (5, "Position")], map_id="Lockdown"),
        rows_of("February_10", OTHER_HUMAN, THIRD_MATCH, [(60, "Position"), (65, "Position")]),
    )
    build(make_raw(tmp_path / "player_data", rows), tmp_path / "out", tmp_path / "fixtures")
    listed = [(match["map"], match["id"]) for match in read(tmp_path / "out" / "manifest.json")["matches"]]
    assert listed == [("AmbroseValley", "aaaaaaaa"), ("AmbroseValley", "cccccccc"), ("Lockdown", "bbbbbbbb")]


def test_manifest_lists_matches_by_map_then_by_start(built):
    manifest = read(built[0] / "out" / "manifest.json")
    listed = [(m["id"], m["start"] - FIRST_TS, m["span"]) for m in manifest["matches"]]
    assert listed == [("aaaaaaaa", 0, 15), ("bbbbbbbb", 0, 25), ("cccccccc", 0, 8), ("0d0d0d0d", 30, 10)]


def test_manifest_carries_the_constants_the_app_needs(built):
    manifest = read(built[0] / "out" / "manifest.json")
    assert manifest["encoding"] == {"uv_steps": 65_535, "elevation_steps_per_unit": 10}
    assert manifest["sample_step_seconds"] == 5
    assert manifest["events"] == ["Position", "BotPosition", "Kill", "Killed", "BotKill", "BotKilled", "KilledByStorm", "Loot"]
    assert manifest["event_groups"] == {"movement": [0, 1], "kill": [2, 4], "death": [3, 5], "storm_death": [6], "loot": [7]}
    assert manifest["fates"] == ["killed_by_bot", "killed_by_player", "killed_by_storm", "killed", "no_death_recorded"]


def test_manifest_maps_and_days(built):
    folder, _ = built
    manifest = read(folder / "out" / "manifest.json")
    maps = {entry["id"]: entry for entry in manifest["maps"]}
    counts = {map_id: (entry["matches"], entry["journeys"]) for map_id, entry in maps.items()}
    assert counts == {"AmbroseValley": (1, 3), "GrandRift": (1, 1), "Lockdown": (2, 2)}
    constants = {map_id: (entry["scale"], entry["origin_x"], entry["origin_z"]) for map_id, entry in maps.items()}
    assert (constants["AmbroseValley"], constants["GrandRift"]) == ((900.0, -370.0, -473.0), (581.0, -290.0, -290.0))
    assert maps["Lockdown"]["name"] == "Lockdown" and maps["AmbroseValley"]["name"] == "Ambrose Valley"
    for map_id, entry in maps.items():
        assert read(folder / "out" / entry["journeys_file"])["map"] == map_id
    assert manifest["days"] == [
        {"id": "February_10", "date": "2026-02-10", "partial": False, "matches": 1},
        {"id": "February_11", "date": "2026-02-11", "partial": False, "matches": 3},
    ]


def on_day(day, user_id, match_id, moves, map_id="AmbroseValley"):
    """A file in the folder February_<day> that walks along x at (second, event) of that very day."""
    since_the_10th = (day - 10) * DAY
    events = [(since_the_10th + second, event, 10.0 + second, -20.0) for second, event in moves]
    return rows_of(f"February_{day}", user_id, match_id, events, map_id)


def test_partial_day_is_flagged_and_has_to_be_the_last(tmp_path):
    raw = make_raw(tmp_path / "player_data", on_day(14, HUMAN, MATCH, [(0, "Position"), (5, "Position")]))
    build(raw, tmp_path / "out", tmp_path / "fixtures")
    assert [(day["id"], day["partial"]) for day in read(tmp_path / "out" / "manifest.json")["days"]] == [("February_14", True)]
    write_files(raw, on_day(15, HUMAN, OTHER_MATCH, [(0, "Position")]))
    with pytest.raises(ValueError, match="'February_14'\\] is marked as a partial day in PARTIAL_DAYS but is not the last day folder"):
        build(raw, tmp_path / "out", tmp_path / "fixtures")


def test_minimap_is_written_at_its_own_aspect_and_recorded(built):
    folder, _ = built
    manifest = read(folder / "out" / "manifest.json")
    for entry in manifest["maps"]:
        with Image.open(folder / "out" / entry["minimap"]["file"]) as image:
            assert image.format == "WEBP"
            assert image.size == MINIMAP_SIZES[entry["id"]] == (entry["minimap"]["width"], entry["minimap"]["height"])


def test_manifest_holds_the_box_of_the_artwork_inside_each_minimap(tmp_path):
    raw = make_raw(tmp_path / "player_data", dataset())
    with_surround = Image.new("RGB", (40, 40), (0, 0, 0))
    with_surround.paste((30, 60, 90), (10, 4, 30, 34))
    with_surround.save(raw / "minimaps" / MAPS["AmbroseValley"].minimap_file)
    build(raw, tmp_path / "out", tmp_path / "fixtures")
    artwork = {entry["id"]: entry["minimap"]["artwork"] for entry in read(tmp_path / "out" / "manifest.json")["maps"]}
    assert artwork["AmbroseValley"] == {"left": 0.25, "top": 0.1, "right": 0.75, "bottom": 0.85}
    assert artwork["GrandRift"] == artwork["Lockdown"] == {"left": 0.0, "top": 0.0, "right": 1.0, "bottom": 1.0}


def test_minimap_wider_than_the_limit_is_downscaled_keeping_its_aspect(tmp_path, monkeypatch):
    monkeypatch.setattr(build_data, "MINIMAP_WIDTH", 20)
    raw = make_raw(tmp_path / "player_data", dataset())
    build(raw, tmp_path / "out", tmp_path / "fixtures")
    downscaled = {"AmbroseValley": (20, 20), "GrandRift": (20, 19), "Lockdown": (20, 20)}
    for entry in read(tmp_path / "out" / "manifest.json")["maps"]:
        with Image.open(tmp_path / "out" / entry["minimap"]["file"]) as image:
            assert image.size == (entry["minimap"]["width"], entry["minimap"]["height"]) == downscaled[entry["id"]]


def test_minimap_wider_than_2048_pixels_is_downscaled_to_2048(tmp_path):
    raw = make_raw(tmp_path / "player_data", dataset())
    Image.new("RGB", (4096, 8), (30, 60, 90)).save(raw / "minimaps" / MAPS["AmbroseValley"].minimap_file)
    build(raw, tmp_path / "out", tmp_path / "fixtures")
    minimaps = {entry["id"]: entry["minimap"] for entry in read(tmp_path / "out" / "manifest.json")["maps"]}
    assert (minimaps["AmbroseValley"]["width"], minimaps["AmbroseValley"]["height"]) == (2048, 4)
    assert (minimaps["GrandRift"]["width"], minimaps["GrandRift"]["height"]) == (40, 38)


def test_journeys_are_listed_by_match_then_humans_by_public_id_then_bots_by_number(tmp_path):
    walk, bot_walk = [(0, "Position"), (5, "Position")], [(5, "BotPosition"), (10, "BotPosition")]
    rows = frame(
        rows_of("February_10", OTHER_HUMAN, MATCH, walk),
        rows_of("February_11", HUMAN, MATCH, walk),  # the same match, filed under another day folder
        rows_of("February_10", "1429", MATCH, walk),  # an anonymous human: a number as id, Position rows
        rows_of("February_10", "999", MATCH, bot_walk),
        rows_of("February_10", "0", MATCH, bot_walk),
        rows_of("February_10", HUMAN, OTHER_MATCH, walk),
        rows_of("February_10", "7", OTHER_MATCH, bot_walk),
    )
    build(make_raw(tmp_path / "player_data", rows), tmp_path / "out", tmp_path / "fixtures")
    assert [journey["id"] for journey in read(tmp_path / "out" / "maps" / "AmbroseValley.json")["journeys"]] == [
        "aaaaaaaa-anon",
        "aaaaaaaa-1a2b3c4d",
        "aaaaaaaa-9f8e7d6c",
        "aaaaaaaa-bot0",
        "aaaaaaaa-bot999",
        "bbbbbbbb-1a2b3c4d",
        "bbbbbbbb-bot7",
    ]


def test_row_exactly_on_the_edge_of_the_minimap_is_on_the_map(tmp_path):
    corners = [(0, "Position", -370.0, -473.0), (5, "Position", 530.0, 427.0)]
    build(make_raw(tmp_path / "player_data", rows_of("February_10", HUMAN, MATCH, corners)), tmp_path / "out", tmp_path / "fixtures")
    (journey,) = read(tmp_path / "out" / "maps" / "AmbroseValley.json")["journeys"]
    assert (journey["u"], journey["v"]) == ([0, 65_535], [0, 65_535])


def test_journeys_of_a_match_are_listed_humans_first_then_bots_by_number(built):
    bundle = read(built[0] / "out" / "maps" / "AmbroseValley.json")
    assert [journey["id"] for journey in bundle["journeys"]] == ["aaaaaaaa-1a2b3c4d", "aaaaaaaa-bot999", "aaaaaaaa-bot1440"]
    assert [(journey["player"], journey["actor"], journey["anonymous"], journey["fate"]) for journey in bundle["journeys"]] == [
        ("1a2b3c4d", "human", False, "killed_by_bot"),
        ("999", "bot", False, "no_death_recorded"),
        ("1440", "bot", False, "killed"),
    ]


def test_journey_arrays_are_in_time_order_and_the_path_ends_at_the_death(built):
    human, _, bot = read(built[0] / "out" / "maps" / "AmbroseValley.json")["journeys"]
    assert human["match"] == "aaaaaaaa"
    assert human["t"] == [0, 5, 6, 6, 7, 10, 12, 15]
    assert human["e"] == [CODE[e] for e in ("Position", "Position", "Loot", "Loot", "BotKill", "Position", "BotKilled", "BotKill")]
    assert bot["t"] == [5, 8, 10, 11]
    assert bot["e"] == [CODE[e] for e in ("BotPosition", "BotKill", "BotPosition", "BotKilled")]


def test_time_is_counted_from_the_first_row_of_the_match(built):
    late, early = read(built[0] / "out" / "maps" / "Lockdown.json")["journeys"]
    assert (late["id"], late["t"], late["fate"]) == ("0d0d0d0d-1a2b3c4d", [0, 5, 10], "killed_by_storm")
    assert (early["id"], early["t"]) == ("cccccccc-9f8e7d6c", [0, 5, 8])


def test_anonymous_human_has_no_player_id(built):
    (journey,) = read(built[0] / "out" / "maps" / "GrandRift.json")["journeys"]
    who = (journey["id"], journey["player"], journey["actor"], journey["anonymous"], journey["fate"])
    assert who == ("bbbbbbbb-anon", None, "human", True, "no_death_recorded")
    assert journey["t"] == [0, 20, 25]


def test_kill_mirroring_a_death_leaves_only_the_death(built):
    journey = read(built[0] / "out" / "maps" / "Lockdown.json")["journeys"][1]
    assert journey["fate"] == "killed_by_player"
    assert CODE["Kill"] not in journey["e"]


def test_positions_survive_the_bundle_to_a_quarter_of_a_unit(built):
    (journey,) = read(built[0] / "out" / "maps" / "GrandRift.json")["journeys"]
    x, z = uv_to_world("GrandRift", decode_uv(journey["u"]), decode_uv(journey["v"]))
    assert np.abs(x - np.array([10.0, 30.0, 35.0])).max() < 0.25
    assert np.abs(z - (-20.0)).max() < 0.25
    assert journey["y"] == [1000, 1000, 1000]


def test_no_full_player_or_match_id_is_written(built):
    folder, _ = built
    texts = [(folder / name).read_text() for name in OUTPUT_FILES if name.endswith(".json")]
    assert not any(FULL_ID.search(text) for text in texts)
    assert any(HUMAN[:8] in text for text in texts)


def test_projection_fixtures_hold_the_readme_example(built):
    fixtures = read(built[0] / "fixtures" / "projection.json")
    example = fixtures["points"][0]
    assert (example["x"], example["z"], example["width"], example["height"]) == (-301.45, -355.55, 1024, 1024)
    assert (round(example["px"]), round(example["py"])) == (78, 890)
    assert fixtures["maps"]["GrandRift"] == {"scale": 581.0, "origin_x": -290.0, "origin_z": -290.0}
    assert fixtures["encoding"] == {"uv_steps": 65_535, "elevation_steps_per_unit": 10}
    assert {point["map"] for point in fixtures["points"]} == set(MAPS)


def test_fixture_points_are_the_extremes_of_each_map_on_its_own_image_size(built):
    points = {point["name"]: point for point in read(built[0] / "fixtures" / "projection.json")["points"]}
    rift = points["GrandRift, largest x"]
    assert (rift["x"], rift["z"], rift["width"], rift["height"]) == (35.0, -20.0, 40, 38)
    assert rift["px"] == pytest.approx((35.0 + 290.0) / 581.0 * 40, abs=1e-5)
    assert rift["py"] == pytest.approx((1 - (-20.0 + 290.0) / 581.0) * 38, abs=1e-5)
    assert (points["Lockdown, largest z"]["x"], points["Lockdown, largest z"]["z"]) == (1.0, 1.0)
    assert points["Lockdown, smallest z"]["z"] == -20.0
    assert (points["Lockdown, largest x"]["x"], points["Lockdown, smallest x"]["x"]) == (50.0, 1.0)


def test_fixture_points_carry_u_and_v_and_the_constants_of_a_map_with_two_different_origins(built):
    fixtures = read(built[0] / "fixtures" / "projection.json")
    points = {point["name"]: point for point in fixtures["points"]}
    example, rift = points["README worked example"], points["GrandRift, largest x"]
    assert (example["u"], example["v"]) == (0.076166667, 0.1305)
    assert (rift["u"], rift["v"]) == (0.559380379, 0.464716007)
    assert fixtures["maps"]["AmbroseValley"] == {"scale": 900.0, "origin_x": -370.0, "origin_z": -473.0}


def test_fixture_elevation_is_what_its_code_decodes_to(tmp_path):
    rows = rows_of("February_10", HUMAN, MATCH, [(0, "Position"), (5, "Position")]).assign(y=np.float32(8.14))
    build(make_raw(tmp_path / "player_data", rows), tmp_path / "out", tmp_path / "fixtures")
    point = read(tmp_path / "fixtures" / "projection.json")["points"][1]
    assert (round(point["y"], 2), point["y_code"], point["y_from_code"]) == (8.14, 81, 8.1)


def test_fixture_points_carry_the_integer_codes_and_what_they_decode_to(built):
    points = {point["name"]: point for point in read(built[0] / "fixtures" / "projection.json")["points"]}
    rift = points["GrandRift, largest x"]
    assert (rift["u_code"], rift["v_code"]) == (round((35.0 + 290.0) / 581.0 * 65_535), round((-20.0 + 290.0) / 581.0 * 65_535))
    assert rift["px_from_codes"] == pytest.approx(rift["u_code"] / 65_535 * 40, abs=1e-5)
    assert rift["py_from_codes"] == pytest.approx((1 - rift["v_code"] / 65_535) * 38, abs=1e-5)
    assert rift["x_from_codes"] == pytest.approx(rift["u_code"] / 65_535 * 581.0 - 290.0, abs=1e-5)
    assert rift["z_from_codes"] == pytest.approx(rift["v_code"] / 65_535 * 581.0 - 290.0, abs=1e-5)
    assert abs(rift["x_from_codes"] - 35.0) < 0.01 and abs(rift["z_from_codes"] + 20.0) < 0.01
    assert (rift["y"], rift["y_code"], rift["y_from_code"]) == (100.0, 1000, 100.0)
    assert "y" not in points["README worked example"]


PROFILE = {
    "files_schema": {"rows_total": 37},
    "actors_events": {"files_numeric_with_Position": 1},
    "matches_quality": {"distinct_matches": 4},
    "cleaning": {
        "rows_removed_spare_copy_of_journey": 9,
        "rows_removed_second_half_of_file_written_twice": 3,
        "rows_removed_Kill_mirroring_Killed": 1,
        "rows_removed_movement_after_death": 1,
        "rows_after_cleaning": 23,
        "journeys_after_cleaning": 6,
        "journeys_after_cleaning_Position": 4,
        "journeys_after_cleaning_BotPosition": 2,
        "match_span_median_after_cleaning": 12.5,
        "match_span_max_after_cleaning": 25,
        "rows_after_cleaning_Position": 9,
        "rows_after_cleaning_BotPosition": 4,
        "rows_after_cleaning_Kill": 0,
        "rows_after_cleaning_Killed": 1,
        "rows_after_cleaning_BotKill": 3,
        "rows_after_cleaning_BotKilled": 2,
        "rows_after_cleaning_KilledByStorm": 1,
        "rows_after_cleaning_Loot": 3,
        "matches_after_cleaning_in_February_10": 1,
        "matches_after_cleaning_in_February_11": 3,
        "rows_after_cleaning_human_BotKill": 2,
        "rows_after_cleaning_human_BotKilled": 1,
        "rows_after_cleaning_human_Killed": 1,
        "rows_after_cleaning_human_KilledByStorm": 1,
        "rows_after_cleaning_human_Loot": 3,
        "rows_after_cleaning_bot_BotKill": 1,
        "rows_after_cleaning_bot_BotKilled": 1,
        "rows_after_cleaning_bot_Killed": 0,
        "rows_after_cleaning_bot_KilledByStorm": 0,
        "rows_after_cleaning_bot_Loot": 0,
    },
}


def profile_file(folder, changes=None):
    metrics = {topic: {key: {"value": value} for key, value in keys.items()} for topic, keys in PROFILE.items()}
    for (topic, key), value in (changes or {}).items():
        metrics[topic][key]["value"] = value
    path = folder / "profile_report.json"
    path.write_text(json.dumps({"metrics": metrics}))
    return path


def test_counts_are_reconciled_with_the_profiler_metric_of_the_same_meaning(built, tmp_path):
    _, report = built
    profile = read(profile_file(tmp_path))
    assert sum(len(keys) for keys in PROFILE.values()) == len(counts_to_reconcile(report))
    assert differences_from_profile(report, profile) == []
    assert len(differences_from_profile(report, {"metrics": {}})) == len(counts_to_reconcile(report))
    profile["metrics"]["cleaning"]["rows_after_cleaning"]["value"] += 1
    assert differences_from_profile(report, profile) == ["cleaning.rows_after_cleaning: profiler 24, build 23"]


def test_each_count_is_reconciled_with_the_profiler_metric_that_measures_it():
    report = {
        "rows_in": 1,
        "removed": {
            "spare_copy_of_journey": 2,
            "second_half_of_file_written_twice": 3,
            "kill_mirroring_killed": 4,
            "movement_after_death": 5,
        },
        "rows_out": 6,
        "journeys": {"total": 7, "human": 8, "anonymous": 9, "bot": 10},
        "matches": 11,
        "match_span_seconds": {"median": 12.5, "max": 13},
        "matches_by_day": {"February_10": 14},
        "rows_out_by_event": {event: 100 + code for event, code in CODE.items()},
        "events_of_human_journeys": {event: 200 + code for event, code in CODE.items()},
        "events_of_bot_journeys": {event: 300 + code for event, code in CODE.items()},
    }
    counts = counts_to_reconcile(report)
    cleaning = {key: count for (topic, key), count in counts.items() if topic == "cleaning"}
    assert counts["files_schema", "rows_total"] == 1
    assert counts["actors_events", "files_numeric_with_Position"] == 9
    assert counts["matches_quality", "distinct_matches"] == 11
    assert [cleaning[f"rows_removed_{rule}"] for rule in ("spare_copy_of_journey", "second_half_of_file_written_twice")] == [2, 3]
    assert [cleaning[f"rows_removed_{rule}"] for rule in ("Kill_mirroring_Killed", "movement_after_death")] == [4, 5]
    assert [cleaning[f"{key}_after_cleaning"] for key in ("rows", "journeys")] == [6, 7]
    assert [cleaning[f"journeys_after_cleaning_{movement}"] for movement in ("Position", "BotPosition")] == [8, 10]
    assert [cleaning[f"match_span_{which}_after_cleaning"] for which in ("median", "max")] == [12.5, 13]
    assert cleaning["matches_after_cleaning_in_February_10"] == 14
    assert [cleaning[f"rows_after_cleaning_{event}"] for event in EVENTS] == [100, 101, 102, 103, 104, 105, 106, 107]
    per_actor = ("BotKill", "BotKilled", "Killed", "KilledByStorm", "Loot")
    assert [cleaning[f"rows_after_cleaning_human_{event}"] for event in per_actor] == [204, 205, 203, 206, 207]
    assert [cleaning[f"rows_after_cleaning_bot_{event}"] for event in per_actor] == [304, 305, 303, 306, 307]
    assert len(counts) == 3 + 10 + 1 + 8 + 10


def run_main(monkeypatch, tmp_path, raw, profile):
    folders = ["--raw", str(raw), "--out", str(tmp_path / "out"), "--fixtures", str(tmp_path / "fixtures")]
    monkeypatch.setattr(sys, "argv", ["build_data", *folders, "--profile", str(profile)])
    build_data.main()


def test_main_builds_when_the_profile_agrees(tmp_path, monkeypatch, capsys):
    raw = make_raw(tmp_path / "player_data", dataset())
    run_main(monkeypatch, tmp_path, raw, profile_file(tmp_path))
    assert "rows: 37 in, 23 out" in capsys.readouterr().out
    assert (tmp_path / "out" / "manifest.json").is_file()


def test_main_fails_and_writes_nothing_when_the_profile_differs(tmp_path, monkeypatch):
    raw = make_raw(tmp_path / "player_data", dataset())
    profile = profile_file(tmp_path, {("cleaning", "rows_removed_movement_after_death"): 2})
    with pytest.raises(SystemExit) as stopped:
        run_main(monkeypatch, tmp_path, raw, profile)
    assert "cleaning.rows_removed_movement_after_death: profiler 2, build 1" in str(stopped.value.code)
    assert not (tmp_path / "out").exists() and not (tmp_path / "fixtures").exists()


def test_main_reports_a_missing_data_folder_without_a_traceback(tmp_path, monkeypatch):
    with pytest.raises(SystemExit) as stopped:
        run_main(monkeypatch, tmp_path, tmp_path / "nowhere", profile_file(tmp_path))
    assert str(stopped.value.code).startswith("build failed, nothing was written: No telemetry files found")


def test_main_cuts_every_full_id_out_of_the_message_it_prints(tmp_path, monkeypatch):
    def failing(*folders):
        raise ValueError(f"something is wrong with {HUMAN}_{MATCH}")

    monkeypatch.setattr(build_data, "build", failing)
    with pytest.raises(SystemExit) as stopped:
        run_main(monkeypatch, tmp_path, tmp_path, tmp_path)
    assert str(stopped.value.code) == "build failed, nothing was written: something is wrong with 1a2b3c4d_aaaaaaaa.nakama-0"


def test_build_refuses_to_write_a_full_id(tmp_path, monkeypatch):
    def leaky(rows):
        return journey_table(rows).assign(player=lambda table: table["user_id"])

    monkeypatch.setattr(build_data, "journey_table", leaky)
    raw = make_raw(tmp_path / "player_data", dataset())
    with pytest.raises(ValueError) as failure:
        build(raw, tmp_path / "out", tmp_path / "fixtures")
    assert str(failure.value) == "AmbroseValley.json would contain a full id: 1a2b3c4d..."
    assert written(tmp_path) == []


def test_bundle_over_the_size_limit_fails_the_build_before_anything_is_written(tmp_path, monkeypatch):
    monkeypatch.setattr(build_data, "MAX_BUNDLE_GZIP_BYTES", 50)
    raw = make_raw(tmp_path / "player_data", dataset())
    with pytest.raises(ValueError, match="map bundles over 50 bytes gzipped"):
        build(raw, tmp_path / "out", tmp_path / "fixtures")
    assert written(tmp_path) == []


def test_size_limit_is_on_the_gzipped_size_and_a_bundle_exactly_at_the_limit_passes(tmp_path, monkeypatch):
    raw = make_raw(tmp_path / "player_data", dataset())
    sizes = build(raw, tmp_path / "out", tmp_path / "fixtures")["bundles"]
    content = (tmp_path / "out" / "maps" / "AmbroseValley.json").read_bytes()
    largest = len(gzip.compress(content, mtime=0))
    assert sizes["AmbroseValley"] == {"bytes": len(content), "gzip_bytes": largest}
    assert largest < len(content) and largest == max(size["gzip_bytes"] for size in sizes.values())
    monkeypatch.setattr(build_data, "MAX_BUNDLE_GZIP_BYTES", largest)
    build(raw, tmp_path / "out", tmp_path / "fixtures")
    monkeypatch.setattr(build_data, "MAX_BUNDLE_GZIP_BYTES", largest - 1)
    with pytest.raises(ValueError, match="gzipped: \\['AmbroseValley'\\]"):
        build(raw, tmp_path / "out", tmp_path / "fixtures")


def counted_from_zero():
    rows = rows_of("February_12", OTHER_HUMAN, OTHER_MATCH, [(0, "Position"), (5, "Position")])
    return rows.assign(ts=rows["ts"] - rows["ts"].min())


def two_maps_in_one_file():
    rows = rows_of("February_12", OTHER_HUMAN, THIRD_MATCH, [(0, "Position"), (5, "Position")])
    rows.loc[1, "map_id"] = "Lockdown"
    return rows


def two_matches_in_one_file():
    rows = rows_of("February_12", OTHER_HUMAN, OTHER_MATCH, [(0, "Position"), (5, "Position")])
    rows.loc[1, "match_id"] = THIRD_MATCH
    return rows


def third_copy_with_another_user_in_one_row():
    rows = rows_of("February_12", HUMAN, MATCH, HUMAN_EVENTS)
    rows.loc[1, "user_id"] = OTHER_HUMAN
    return rows


def two_rows_off_the_map():
    return rows_of("February_10", OTHER_HUMAN, MATCH, [(0, "Position", 9999.0, 0.0), (5, "Position", 8888.0, 0.0)])


def two_files_filed_two_days_late():
    human = rows_of("February_12", OTHER_HUMAN, OTHER_MATCH, [(0, "Position")])
    return frame(human, rows_of("February_12", "1444", OTHER_MATCH, [(5, "BotPosition")]))


def same_date_in_two_folders():
    on_the_9th = on_day(9, OTHER_HUMAN, OTHER_MATCH, [(0, "Position")])
    return frame(on_the_9th, on_the_9th.assign(day="February_09", file=f"February_09/{OTHER_HUMAN}_{OTHER_MATCH}"))


def in_milliseconds():
    rows = rows_of("February_12", OTHER_HUMAN, OTHER_MATCH, [(0, "Position"), (5, "Position")])
    return rows.assign(ts=rows["ts"] * 1000)


def renamed_file():
    return rows_of("February_12", OTHER_HUMAN, OTHER_MATCH, [(0, "Position")]).assign(file="February_12/renamed")


def two_ids_in_one_file():
    rows = rows_of("February_12", OTHER_HUMAN, OTHER_MATCH, [(0, "Position"), (5, "Position")])
    rows.loc[1, "user_id"] = HUMAN
    return rows


@pytest.mark.parametrize(
    ("extra", "message"),
    [
        (rows_of("February_12", OTHER_HUMAN, MATCH, [(0, "Position"), (5, "Teleport")]), "unknown event values \\['Teleport'\\]"),
        (rows_of("February_12", OTHER_HUMAN, OTHER_MATCH, [(0, "Position")], map_id="Atlantis"), "unknown map ids \\['Atlantis'\\]"),
        (rows_of("February_12", OTHER_HUMAN, OTHER_MATCH, [(0, "Position", float("nan"), 0.0)]), "null or non-finite values"),
        (two_ids_in_one_file(), "a file holds several user, match or map ids"),
        (renamed_file(), "a file is not named <user_id>_<match_id>"),
        (rows_of("February_12", "guest", OTHER_MATCH, [(0, "Position")]), "neither a UUID nor a number"),
        (rows_of("February_12", OTHER_HUMAN, OTHER_MATCH, [(0, "Position")]).assign(y=np.float32("inf")), "null or non-finite values"),
        (two_maps_in_one_file(), "a file holds several user, match or map ids"),
        (two_matches_in_one_file(), "a file holds several user, match or map ids"),
        (third_copy_with_another_user_in_one_row(), "raw data check failed: a file holds several user, match or map ids"),
        (counted_from_zero(), "ts runs from 0 to 1770727201, which is not Unix seconds"),
        (two_rows_off_the_map(), "2 rows are off the minimap, e.g. x 9999.0, z 0.0"),
        (
            rows_of("February_10", "1444", MATCH, [(5, "BotPosition"), (10, "BotPosition")], map_id="GrandRift"),
            "1 matches are on several maps, e.g. aaaaaaaa.nakama-0",
        ),
        (
            rows_of("February_10", OTHER_HUMAN, MATCH, [(5, "BotPosition"), (10, "BotPosition")]),
            "1 bot journeys carry an account id instead of a number, e.g. February_10/9f8e7d6c_aaaaaaaa.nakama-0",
        ),
        (
            rows_of("February_12", OTHER_HUMAN, OTHER_MATCH, [(0, "Position")]),  # written on the 10th, filed two days later
            "1 files hold rows that are not from their day folder's date or the day before, "
            "e.g. February_12/9f8e7d6c_bbbbbbbb.nakama-0 \\(last row 2026-02-10\\)",
        ),
        (
            rows_of("February_9", OTHER_HUMAN, OTHER_MATCH, [(0, "Position")]),  # written on the 10th, filed a day early
            "e.g. February_9/9f8e7d6c_bbbbbbbb.nakama-0 \\(last row 2026-02-10\\)",
        ),
        (same_date_in_two_folders(), "several day folders stand for one date: {'February_09': '2026-02-09', 'February_9': '2026-02-09',"),
        (two_files_filed_two_days_late(), "2 files hold rows that are not from their day folder's .* e.g. February_12/1444_bbbbbbbb"),
        (rows_of("unsorted", OTHER_HUMAN, OTHER_MATCH, [(0, "Position")]), "not day folders such as February_10: \\['unsorted'\\]"),
        (in_milliseconds(), "which is not Unix seconds"),
        (
            rows_of("February_10", OTHER_HUMAN, MATCH, [(0, "Position", 9999.0, 0.0)]),
            "1 rows are off the minimap, e.g. x 9999.0, z 0.0 on AmbroseValley in February_10/9f8e7d6c_aaaaaaaa",
        ),
        (rows_of("February_10", OTHER_HUMAN, MATCH, [(0, "Position", 0.0, -9999.0)]), "1 rows are off the minimap"),
    ],
)
def test_build_fails_on_data_it_was_not_built_for(tmp_path, extra, message):
    raw = make_raw(tmp_path / "player_data", frame(dataset(), extra))
    with pytest.raises(ValueError, match=message):
        build(raw, tmp_path / "out", tmp_path / "fixtures")
    assert written(tmp_path) == []


def test_build_fails_on_something_in_the_data_folder_that_the_loader_does_not_read(tmp_path):
    raw = make_raw(tmp_path / "player_data", dataset())
    (raw / "README.md").write_text("what the dataset says about itself")
    (raw / f"1444_{MATCH}").write_bytes(b"a data file beside the day folders")
    (raw / "February_10" / "February_10").mkdir()
    message = "neither a day folder's file nor the README: \\['1444_aaaaaaaa.nakama-0', 'February_10/February_10'\\]"
    with pytest.raises(ValueError, match=message):
        build(raw, tmp_path / "out", tmp_path / "fixtures")
    assert written(tmp_path) == []


def test_build_fails_on_a_file_that_has_both_magics_but_cannot_be_read(tmp_path):
    raw = make_raw(tmp_path / "player_data", dataset())
    (raw / "February_10" / "hollow.nakama-0").write_bytes(b"PAR1" + bytes(20) + b"PAR1")
    with pytest.raises(ValueError, match="1 files are not readable Parquet, e.g. February_10/hollow.nakama-0: OSError") as failure:
        build(raw, tmp_path / "out", tmp_path / "fixtures")
    assert "expected schema" not in str(failure.value) and "hold no rows" not in str(failure.value)
    assert written(tmp_path) == []


def test_build_fails_on_a_file_that_can_be_read_but_does_not_start_with_the_magic(tmp_path):
    raw = make_raw(tmp_path / "player_data", dataset())
    path = raw / "February_10" / f"999_{MATCH}"
    path.write_bytes(b"XXXX" + path.read_bytes()[4:])
    with pytest.raises(ValueError, match="1 files are not readable Parquet, e.g. February_10/999_aaaaaaaa.nakama-0: no PAR1 magic bytes"):
        build(raw, tmp_path / "out", tmp_path / "fixtures")
    assert written(tmp_path) == []


@pytest.mark.skipif(os.geteuid() == 0, reason="root can read any file")
def test_main_reports_a_file_it_may_not_open_without_a_traceback_and_without_its_full_id(tmp_path, monkeypatch):
    raw = make_raw(tmp_path / "player_data", dataset())
    (raw / "February_10" / f"{HUMAN}_{MATCH}").chmod(0)
    with pytest.raises(SystemExit) as stopped:
        run_main(monkeypatch, tmp_path, raw, profile_file(tmp_path))
    message = str(stopped.value.code)
    assert "1 files are not readable Parquet, e.g. February_10/1a2b3c4d_aaaaaaaa.nakama-0: PermissionError" in message
    assert HUMAN not in message and MATCH not in message


@pytest.mark.parametrize(
    ("content", "message"),
    [
        ("not json at all", "profile_report.json is not a profile report: Expecting value"),
        ("[1, 2]", "profile_report.json is not a profile report: it has no metrics"),
        ('{"readme_check": []}', "profile_report.json is not a profile report: it has no metrics"),
    ],
)
def test_main_names_a_profile_file_that_is_not_a_profile_report(tmp_path, monkeypatch, content, message):
    raw = make_raw(tmp_path / "player_data", dataset())
    profile = tmp_path / "profile_report.json"
    profile.write_text(content)
    with pytest.raises(SystemExit) as stopped:
        run_main(monkeypatch, tmp_path, raw, profile)
    assert str(stopped.value.code).startswith("build failed, nothing was written: ") and message in str(stopped.value.code)
    assert written(tmp_path) == ["profile_report.json"]


def test_main_reports_a_minimap_that_is_not_an_image_and_a_profile_that_is_a_folder(tmp_path, monkeypatch):
    raw = make_raw(tmp_path / "player_data", dataset())
    with pytest.raises(SystemExit) as stopped:
        run_main(monkeypatch, tmp_path, raw, tmp_path)
    assert str(stopped.value.code).startswith("build failed, nothing was written: ")
    (raw / "minimaps" / MAPS["GrandRift"].minimap_file).write_text("not an image")
    with pytest.raises(SystemExit) as stopped:
        run_main(monkeypatch, tmp_path, raw, profile_file(tmp_path))
    assert "build failed, nothing was written: cannot identify image file" in str(stopped.value.code)
    assert written(tmp_path) == ["profile_report.json"]


def test_build_names_a_day_folder_that_is_no_day_of_its_year(tmp_path):
    raw = make_raw(tmp_path / "player_data", rows_of("February_29", HUMAN, MATCH, [(0, "Position")]))
    with pytest.raises(ValueError, match="folder 'February_29' is not a day of 2026 named like February_10"):
        build(raw, tmp_path / "out", tmp_path / "fixtures")


def test_build_fails_on_an_unreadable_file_and_says_why(tmp_path):
    raw = make_raw(tmp_path / "player_data", dataset())
    (raw / "February_10" / "broken.nakama-0").write_bytes(b"not parquet")
    with pytest.raises(ValueError, match="1 files are not readable Parquet, e.g. February_10/broken.nakama-0: ArrowInvalid"):
        build(raw, tmp_path / "out", tmp_path / "fixtures")


def test_build_fails_on_a_file_with_another_schema(tmp_path):
    raw = make_raw(tmp_path / "player_data", dataset())
    write_file_with_text_events(raw, "February_10", "1444", MATCH)
    message = "1 files do not have the expected schema, e.g. February_10/1444_aaaaaaaa.nakama-0: .*event: string"
    with pytest.raises(ValueError, match=message):
        build(raw, tmp_path / "out", tmp_path / "fixtures")


def test_build_fails_on_a_file_without_rows(tmp_path):
    raw = make_raw(tmp_path / "player_data", dataset())
    pq.write_table(SCHEMA.empty_table(), raw / "February_10" / f"1444_{MATCH}")
    with pytest.raises(ValueError, match="1 files hold no rows"):
        build(raw, tmp_path / "out", tmp_path / "fixtures")
