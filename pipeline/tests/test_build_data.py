"""The whole build, on a small synthetic dataset that contains every case the cleaning rules cover."""
import json
import sys

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
import pytest
from PIL import Image

import pipeline.build_data as build_data
from pipeline.build_data import build, counts_to_reconcile, differences_from_profile
from pipeline.dataset import EVENTS, FULL_ID, SCHEMA
from pipeline.encode import decode_uv
from pipeline.journeys import journey_table
from pipeline.maps import MAPS, uv_to_world
from pipeline.tests.helpers import FIRST_TS, HUMAN, LATE_MATCH, MATCH, OTHER_HUMAN, OTHER_MATCH, THIRD_MATCH, frame, rows_of, write_files

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
        rows_of("February_11", OTHER_HUMAN, THIRD_MATCH, [(0, "Position"), (5, "Position"), (8, "Kill", 1.0, 1.0), (8, "Killed", 1.0, 1.0)], map_id="Lockdown"),
        rows_of("February_11", HUMAN, LATE_MATCH, [(30, "Position"), (35, "Position"), (40, "KilledByStorm")], map_id="Lockdown"),  # starts last
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


def written(folder):
    return sorted(str(path.relative_to(folder)) for path in folder.rglob("*") if path.is_file() and "player_data" not in path.parts)


def test_build_writes_exactly_these_files(built):
    assert written(built[0]) == OUTPUT_FILES


def test_cleaning_report_counts_every_rule(built):
    folder, report = built
    assert report["rows_in"] == 37
    assert report["removed"] == {"spare_copy_of_journey": 9, "second_half_of_file_written_twice": 3, "kill_mirroring_killed": 1, "movement_after_death": 1}
    assert report["rows_out"] == 23
    assert report["journeys"] == {"total": 6, "human": 4, "anonymous": 1, "bot": 2}
    saved = read(folder / "out" / "cleaning_report.json")
    assert saved == {key: value for key, value in report.items() if key != "bundles"}
    assert list(saved["matches_by_day"].items()) == [("February_10", 1), ("February_11", 3)]
    assert saved["match_span_seconds"] == {"median": 12.5, "max": 25}


def test_report_counts_the_rows_left_per_event_and_per_actor(built):
    _, report = built
    assert report["rows_out_by_event"] == {"Position": 9, "BotPosition": 4, "Kill": 0, "Killed": 1, "BotKill": 3, "BotKilled": 2, "KilledByStorm": 1, "Loot": 3}
    assert report["events_of_human_journeys"] == {"Position": 9, "BotPosition": 0, "Kill": 0, "Killed": 1, "BotKill": 2, "BotKilled": 1, "KilledByStorm": 1, "Loot": 3}
    assert report["events_of_bot_journeys"] == {"Position": 0, "BotPosition": 4, "Kill": 0, "Killed": 0, "BotKill": 1, "BotKilled": 1, "KilledByStorm": 0, "Loot": 0}


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


def test_manifest_lists_matches_by_map_then_by_start(built):
    manifest = read(built[0] / "out" / "manifest.json")
    assert [(m["id"], m["start"] - FIRST_TS, m["span"]) for m in manifest["matches"]] == [("aaaaaaaa", 0, 15), ("bbbbbbbb", 0, 25), ("cccccccc", 0, 8), ("0d0d0d0d", 30, 10)]


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
    assert {map_id: (entry["matches"], entry["journeys"]) for map_id, entry in maps.items()} == {"AmbroseValley": (1, 3), "GrandRift": (1, 1), "Lockdown": (2, 2)}
    assert [(maps[map_id]["scale"], maps[map_id]["origin_x"], maps[map_id]["origin_z"]) for map_id in ("AmbroseValley", "GrandRift")] == [(900.0, -370.0, -473.0), (581.0, -290.0, -290.0)]
    assert maps["Lockdown"]["name"] == "Lockdown" and maps["AmbroseValley"]["name"] == "Ambrose Valley"
    for map_id, entry in maps.items():
        assert read(folder / "out" / entry["journeys_file"])["map"] == map_id
    assert manifest["days"] == [
        {"id": "February_10", "date": "2026-02-10", "partial": False, "matches": 1},
        {"id": "February_11", "date": "2026-02-11", "partial": False, "matches": 3},
    ]


def test_partial_day_is_flagged_and_has_to_be_the_last(tmp_path):
    raw = make_raw(tmp_path / "player_data", rows_of("February_14", HUMAN, MATCH, [(0, "Position"), (5, "Position")]))
    build(raw, tmp_path / "out", tmp_path / "fixtures")
    assert [(day["id"], day["partial"]) for day in read(tmp_path / "out" / "manifest.json")["days"]] == [("February_14", True)]
    write_files(raw, rows_of("February_15", HUMAN, OTHER_MATCH, [(0, "Position")]))
    with pytest.raises(ValueError, match="'February_14'\\] is marked as a partial day in PARTIAL_DAYS but is not the last day folder"):
        build(raw, tmp_path / "out", tmp_path / "fixtures")


def test_minimap_is_written_at_its_own_aspect_and_recorded(built):
    folder, _ = built
    manifest = read(folder / "out" / "manifest.json")
    for entry in manifest["maps"]:
        with Image.open(folder / "out" / entry["minimap"]["file"]) as image:
            assert image.format == "WEBP"
            assert image.size == MINIMAP_SIZES[entry["id"]] == (entry["minimap"]["width"], entry["minimap"]["height"])


def test_minimap_wider_than_the_limit_is_downscaled_keeping_its_aspect(tmp_path, monkeypatch):
    monkeypatch.setattr(build_data, "MINIMAP_WIDTH", 20)
    raw = make_raw(tmp_path / "player_data", dataset())
    build(raw, tmp_path / "out", tmp_path / "fixtures")
    for entry in read(tmp_path / "out" / "manifest.json")["maps"]:
        with Image.open(tmp_path / "out" / entry["minimap"]["file"]) as image:
            assert image.size == (entry["minimap"]["width"], entry["minimap"]["height"]) == {"AmbroseValley": (20, 20), "GrandRift": (20, 19), "Lockdown": (20, 20)}[entry["id"]]


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
    assert (journey["id"], journey["player"], journey["actor"], journey["anonymous"], journey["fate"]) == ("bbbbbbbb-anon", None, "human", True, "no_death_recorded")
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
    assert (points["Lockdown, smallest z"]["z"], points["Lockdown, largest x"]["x"], points["Lockdown, smallest x"]["x"]) == (-20.0, 50.0, 1.0)


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


def run_main(monkeypatch, tmp_path, raw, profile):
    monkeypatch.setattr(sys, "argv", ["build_data", "--raw", str(raw), "--out", str(tmp_path / "out"), "--fixtures", str(tmp_path / "fixtures"), "--profile", str(profile)])
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


def test_build_refuses_to_write_a_full_id(tmp_path, monkeypatch):
    def leaky(rows):
        return journey_table(rows).assign(player=lambda table: table["user_id"])

    monkeypatch.setattr(build_data, "journey_table", leaky)
    raw = make_raw(tmp_path / "player_data", dataset())
    with pytest.raises(ValueError, match="AmbroseValley.json would contain a full id: 1a2b3c4d..."):
        build(raw, tmp_path / "out", tmp_path / "fixtures")
    assert written(tmp_path) == []


def test_bundle_over_the_size_limit_fails_the_build_before_anything_is_written(tmp_path, monkeypatch):
    monkeypatch.setattr(build_data, "MAX_BUNDLE_GZIP_BYTES", 50)
    raw = make_raw(tmp_path / "player_data", dataset())
    with pytest.raises(ValueError, match="map bundles over 50 bytes gzipped"):
        build(raw, tmp_path / "out", tmp_path / "fixtures")
    assert written(tmp_path) == []


def in_milliseconds():
    rows = rows_of("February_12", OTHER_HUMAN, OTHER_MATCH, [(0, "Position"), (5, "Position")])
    return rows.assign(ts=rows["ts"] * 1000)


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
        (rows_of("February_12", OTHER_HUMAN, OTHER_MATCH, [(0, "Position")]).assign(file="February_12/renamed"), "a file is not named <user_id>_<match_id>"),
        (rows_of("February_12", "guest", OTHER_MATCH, [(0, "Position")]), "neither a UUID nor a number"),
        (rows_of("unsorted", OTHER_HUMAN, OTHER_MATCH, [(0, "Position")]), "not day folders such as February_10: \\['unsorted'\\]"),
        (in_milliseconds(), "which is not Unix seconds"),
        (rows_of("February_10", OTHER_HUMAN, MATCH, [(0, "Position", 9999.0, 0.0)]), "1 rows are off the minimap, e.g. x 9999.0, z 0.0 on AmbroseValley in February_10/9f8e7d6c_aaaaaaaa"),
        (rows_of("February_10", OTHER_HUMAN, MATCH, [(0, "Position", 0.0, -9999.0)]), "1 rows are off the minimap"),
    ],
)
def test_build_fails_on_data_it_was_not_built_for(tmp_path, extra, message):
    raw = make_raw(tmp_path / "player_data", frame(dataset(), extra))
    with pytest.raises(ValueError, match=message):
        build(raw, tmp_path / "out", tmp_path / "fixtures")
    assert written(tmp_path) == []


def test_build_fails_on_an_unreadable_file_and_says_why(tmp_path):
    raw = make_raw(tmp_path / "player_data", dataset())
    (raw / "February_10" / "broken.nakama-0").write_bytes(b"not parquet")
    with pytest.raises(ValueError, match="1 files are not readable Parquet, e.g. February_10/broken.nakama-0: ArrowInvalid"):
        build(raw, tmp_path / "out", tmp_path / "fixtures")


def test_build_fails_on_a_file_with_another_schema(tmp_path):
    raw = make_raw(tmp_path / "player_data", dataset())
    as_text = pa.table({"user_id": ["1444"], "match_id": [MATCH], "map_id": ["AmbroseValley"], "x": [1.0], "y": [1.0], "z": [1.0], "ts": [FIRST_TS], "event": ["BotPosition"]})
    pq.write_table(as_text, raw / "February_10" / f"1444_{MATCH}")
    with pytest.raises(ValueError, match="1 files do not have the expected schema, e.g. February_10/1444_aaaaaaaa.nakama-0: .*event: string"):
        build(raw, tmp_path / "out", tmp_path / "fixtures")


def test_build_fails_on_a_file_without_rows(tmp_path):
    raw = make_raw(tmp_path / "player_data", dataset())
    pq.write_table(SCHEMA.empty_table(), raw / "February_10" / f"1444_{MATCH}")
    with pytest.raises(ValueError, match="1 files hold no rows"):
        build(raw, tmp_path / "out", tmp_path / "fixtures")
