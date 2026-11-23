"""The whole build, on a small synthetic dataset that contains every case the cleaning rules cover."""
import json
import re

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
import pytest
from PIL import Image

from pipeline.build_data import build, counts_to_reconcile, differences_from_profile
from pipeline.dataset import EVENTS, SCHEMA
from pipeline.encode import decode_uv
from pipeline.maps import MAPS, uv_to_world
from pipeline.tests.helpers import FIRST_TS, HUMAN, MATCH, OTHER_HUMAN, OTHER_MATCH, THIRD_MATCH, frame, rows_of, write_files

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


def dataset():
    return frame(
        rows_of("February_10", HUMAN, MATCH, HUMAN_EVENTS),
        rows_of("February_11", HUMAN, MATCH, HUMAN_EVENTS),  # the same journey, stored a second time
        rows_of("February_10", "1440", MATCH, [(5, "BotPosition"), (10, "BotPosition"), (11, "BotKilled")]),
        rows_of("February_11", "1379", OTHER_MATCH, ANONYMOUS_ONCE + ANONYMOUS_ONCE, map_id="GrandRift"),  # written twice
        rows_of("February_11", OTHER_HUMAN, THIRD_MATCH, [(0, "Position"), (5, "Position"), (8, "Kill", 1.0, 1.0), (8, "Killed", 1.0, 1.0)], map_id="Lockdown"),
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


def test_cleaning_report_counts_every_rule(built):
    folder, report = built
    assert report["rows_in"] == 31
    assert report["removed"] == {"spare_copy_of_journey": 9, "second_half_of_file_written_twice": 3, "kill_mirroring_killed": 1, "movement_after_death": 1}
    assert report["rows_out"] == 17
    assert report["journeys"] == {"total": 4, "human": 3, "anonymous": 1, "bot": 1}
    written = read(folder / "out" / "cleaning_report.json")
    assert written["removed"] == report["removed"]
    assert written["matches_by_day"] == {"February_10": 1, "February_11": 2}


def test_manifest_totals_and_match_entry(built):
    manifest = read(built[0] / "out" / "manifest.json")
    assert manifest["totals"] == {"matches": 3, "humans": 3, "anonymous": 1, "bots": 1, "kills": 2, "deaths": 2, "storm_deaths": 0, "loot": 3, "bot_deaths": 1, "rows": 17}
    assert manifest["events"] == list(EVENTS)
    assert [day["id"] for day in manifest["days"]] == ["February_10", "February_11"]
    assert manifest["days"][0]["date"] == "2026-02-10"
    match = next(m for m in manifest["matches"] if m["id"] == MATCH[:8])
    assert match == {"id": "aaaaaaaa", "map": "AmbroseValley", "day": "February_10", "start": FIRST_TS, "span": 15, "humans": 1, "anonymous": 0, "bots": 1, "kills": 2, "deaths": 1, "storm_deaths": 0, "loot": 2, "bot_deaths": 1, "rows": 11}


def test_minimap_is_written_at_its_own_aspect_and_recorded(built):
    folder, _ = built
    manifest = read(folder / "out" / "manifest.json")
    for entry in manifest["maps"]:
        with Image.open(folder / "out" / entry["minimap"]["file"]) as image:
            assert image.format == "WEBP"
            assert image.size == MINIMAP_SIZES[entry["id"]] == (entry["minimap"]["width"], entry["minimap"]["height"])


def test_journey_arrays_are_in_time_order_and_end_at_the_death(built):
    bundle = read(built[0] / "out" / "maps" / "AmbroseValley.json")
    human, bot = bundle["journeys"]
    assert (human["match"], human["player"], human["actor"], human["anonymous"], human["death"]) == ("aaaaaaaa", "1a2b3c4d", "human", False, "BotKilled")
    assert human["t"] == [0, 5, 6, 6, 7, 10, 12, 15]
    assert human["e"] == [CODE[e] for e in ("Position", "Position", "Loot", "Loot", "BotKill", "Position", "BotKilled", "BotKill")]
    assert (bot["player"], bot["actor"], bot["death"]) == ("1440", "bot", "BotKilled")
    assert bot["t"] == [5, 10, 11]


def test_anonymous_human_has_no_player_id(built):
    (journey,) = read(built[0] / "out" / "maps" / "GrandRift.json")["journeys"]
    assert (journey["player"], journey["actor"], journey["anonymous"], journey["death"]) == (None, "human", True, None)
    assert journey["t"] == [0, 20, 25]


def test_kill_mirroring_a_death_leaves_only_the_death(built):
    (journey,) = read(built[0] / "out" / "maps" / "Lockdown.json")["journeys"]
    assert journey["death"] == "Killed"
    assert CODE["Kill"] not in journey["e"]


def test_positions_survive_the_bundle_to_a_quarter_of_a_unit(built):
    (journey,) = read(built[0] / "out" / "maps" / "GrandRift.json")["journeys"]
    x, z = uv_to_world("GrandRift", decode_uv(journey["u"]), decode_uv(journey["v"]))
    assert np.abs(x - np.array([10.0, 30.0, 35.0])).max() < 0.25
    assert np.abs(z - (-20.0)).max() < 0.25
    assert journey["y"] == [1000, 1000, 1000]


def test_no_full_player_or_match_id_is_written(built):
    folder, _ = built
    texts = [path.read_text() for path in sorted(folder.rglob("*.json")) if "player_data" not in path.parts]
    assert len(texts) == 6
    full_id = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
    assert not any(full_id.search(text) for text in texts)
    assert any(HUMAN[:8] in text for text in texts)


def test_projection_fixtures_hold_the_readme_example(built):
    fixtures = read(built[0] / "fixtures" / "projection.json")
    example = fixtures["points"][0]
    assert (round(example["px"]), round(example["py"])) == (78, 890)
    assert fixtures["maps"]["GrandRift"] == {"scale": 581.0, "origin_x": -290.0, "origin_z": -290.0}
    assert {point["map"] for point in fixtures["points"]} == set(MAPS)


def test_counts_reconcile_with_a_matching_profile_and_name_what_differs(built):
    _, report = built
    profile = {"metrics": {}}
    for (topic, key), value in counts_to_reconcile(report).items():
        profile["metrics"].setdefault(topic, {})[key] = {"value": value}
    assert differences_from_profile(report, profile) == []
    profile["metrics"]["cleaning"]["rows_after_cleaning"]["value"] += 1
    assert differences_from_profile(report, profile) == ["cleaning.rows_after_cleaning: profiler 18, build 17"]


@pytest.mark.parametrize(
    ("extra", "message"),
    [
        (rows_of("February_12", OTHER_HUMAN, MATCH, [(0, "Position"), (5, "Teleport")]), "unknown event values"),
        (rows_of("February_10", OTHER_HUMAN, MATCH, [(0, "Position", 9999.0, 0.0)]), "off the minimap"),
        (rows_of("February_12", "guest", OTHER_MATCH, [(0, "Position")]), "neither a UUID nor a number"),
    ],
)
def test_build_fails_on_data_it_was_not_built_for(tmp_path, extra, message):
    raw = make_raw(tmp_path / "player_data", frame(dataset(), extra))
    with pytest.raises(ValueError, match=message):
        build(raw, tmp_path / "out", tmp_path / "fixtures")


def in_milliseconds():
    rows = rows_of("February_12", OTHER_HUMAN, OTHER_MATCH, [(0, "Position"), (5, "Position")])
    return rows.assign(ts=rows["ts"] * 1000)


@pytest.mark.parametrize(
    ("extra", "message"),
    [
        (rows_of("unsorted", OTHER_HUMAN, OTHER_MATCH, [(0, "Position")]), "not day folders such as February_10: \\['unsorted'\\]"),
        (in_milliseconds(), "which is not Unix seconds"),
    ],
)
def test_build_fails_on_a_folder_or_a_time_unit_it_does_not_know(tmp_path, extra, message):
    raw = make_raw(tmp_path / "player_data", frame(dataset(), extra))
    with pytest.raises(ValueError, match=message):
        build(raw, tmp_path / "out", tmp_path / "fixtures")


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
