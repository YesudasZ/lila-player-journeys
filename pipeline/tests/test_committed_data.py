"""The committed data files, which are what gets deployed, checked without the raw data.

``make data`` compares its counts with the profiler's report, but the profiler
uses the same cleaning code, so that comparison cannot notice a change made to
both. The numbers accepted in Phase 2 are therefore written out here. A rebuild
that changes one of them fails until the new number is accepted on purpose.
The other tests hold what docs/DATA_FORMAT.md promises the app.
"""
import gzip
import json
from collections import Counter
from pathlib import Path

import pytest
from PIL import Image

from pipeline.build_data import MAX_BUNDLE_GZIP_BYTES, differences_from_profile
from pipeline.maps import MAPS, uv_to_pixel, world_to_uv

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "web" / "public" / "data"

ROWS_IN = 89_104
REMOVED = {"spare_copy_of_journey": 88, "second_half_of_file_written_twice": 190, "kill_mirroring_killed": 3, "movement_after_death": 206}
ROWS_LEFT = {
    "Position": 50_931,
    "BotPosition": 21_712,
    "Kill": 0,
    "Killed": 3,
    "BotKill": 2_406,
    "BotKilled": 697,
    "KilledByStorm": 39,
    "Loot": 12_829,
}
JOURNEYS = {"total": 1_242, "human": 798, "anonymous": 17, "bot": 444}
TOTALS = {
    "matches": 796,
    "humans": 798,
    "anonymous": 17,
    "bots": 444,
    "kills": 2_236,
    "deaths": 404,
    "storm_deaths": 39,
    "loot": 12_829,
    "bot_kills": 170,
    "bot_deaths": 296,
    "rows": 88_617,
}
MATCHES_PER_DAY = {"February_10": 284, "February_11": 201, "February_12": 162, "February_13": 112, "February_14": 37}
MATCHES_AND_JOURNEYS_PER_MAP = {"AmbroseValley": (566, 836), "GrandRift": (59, 111), "Lockdown": (171, 295)}
FATES = {
    ("human", "killed_by_bot"): 401,
    ("human", "killed_by_player"): 3,
    ("human", "killed_by_storm"): 39,
    ("human", "no_death_recorded"): 355,
    ("bot", "killed"): 296,
    ("bot", "no_death_recorded"): 148,
}
MINIMAP_SIZES = {"AmbroseValley": (2048, 2048), "GrandRift": (2048, 2046), "Lockdown": (2048, 2048)}


def read(path):
    return json.loads(path.read_text())


@pytest.fixture(scope="module")
def manifest():
    return read(DATA / "manifest.json")


@pytest.fixture(scope="module")
def journeys(manifest):
    """Every journey of every bundle, each with the map of the bundle it came from."""
    found = []
    for entry in manifest["maps"]:
        bundle = read(DATA / entry["journeys_file"])
        assert bundle["map"] == entry["id"]
        found += [journey | {"map": entry["id"]} for journey in bundle["journeys"]]
    return found


def test_cleaning_report_holds_the_accepted_numbers():
    report = read(DATA / "cleaning_report.json")
    assert report["rows_in"] == ROWS_IN
    assert report["removed"] == REMOVED
    assert report["rows_out"] == ROWS_IN - sum(REMOVED.values()) == sum(ROWS_LEFT.values()) == TOTALS["rows"]
    assert report["rows_out_by_event"] == ROWS_LEFT
    assert report["journeys"] == JOURNEYS
    assert report["matches_by_day"] == MATCHES_PER_DAY
    assert report["match_span_seconds"] == {"median": 380.0, "max": 887}


def test_cleaning_report_agrees_with_the_committed_profile_report():
    profile = read(ROOT / "docs" / "profile" / "profile_report.json")
    assert differences_from_profile(read(DATA / "cleaning_report.json"), profile) == []


def test_manifest_totals_are_the_accepted_numbers_and_the_sums_of_its_matches(manifest):
    assert manifest["totals"] == TOTALS
    for name, total in TOTALS.items():
        assert total == (len(manifest["matches"]) if name == "matches" else sum(match[name] for match in manifest["matches"])), name
    assert Counter(match["day"] for match in manifest["matches"]) == MATCHES_PER_DAY
    assert {day["id"]: day["matches"] for day in manifest["days"]} == MATCHES_PER_DAY
    assert [day["id"] for day in manifest["days"] if day["partial"]] == ["February_14"]
    assert {entry["id"]: (entry["matches"], entry["journeys"]) for entry in manifest["maps"]} == MATCHES_AND_JOURNEYS_PER_MAP


def test_manifest_map_constants_are_those_of_the_pipeline(manifest):
    for entry in manifest["maps"]:
        cfg = MAPS[entry["id"]]
        assert (entry["scale"], entry["origin_x"], entry["origin_z"]) == (cfg.scale, cfg.origin_x, cfg.origin_z)


def test_minimaps_have_the_size_the_manifest_states(manifest):
    for entry in manifest["maps"]:
        with Image.open(DATA / entry["minimap"]["file"]) as image:
            assert image.format == "WEBP"
            assert image.size == (entry["minimap"]["width"], entry["minimap"]["height"]) == MINIMAP_SIZES[entry["id"]]


def test_every_bundle_is_under_the_size_limit(manifest):
    for entry in manifest["maps"]:
        assert len(gzip.compress((DATA / entry["journeys_file"]).read_bytes(), mtime=0)) <= MAX_BUNDLE_GZIP_BYTES


def test_journey_ids_are_unique_and_every_journey_belongs_to_a_match_on_its_map(manifest, journeys):
    assert len({journey["id"] for journey in journeys}) == len(journeys) == JOURNEYS["total"]
    map_of_match = {match["id"]: match["map"] for match in manifest["matches"]}
    assert all(map_of_match[journey["match"]] == journey["map"] for journey in journeys)
    assert all(journey["id"].startswith(journey["match"] + "-") for journey in journeys)


def test_journeys_say_who_they_are_and_how_they_ended(manifest, journeys):
    assert Counter((journey["actor"], journey["fate"]) for journey in journeys) == FATES
    assert {fate for _, fate in FATES} <= set(manifest["fates"])
    for journey in journeys:
        assert journey["anonymous"] == (journey["actor"] == "human" and journey["player"] is None), journey["id"]
        assert journey["actor"] == "bot" or journey["player"] is None or len(journey["player"]) == 8, journey["id"]
    assert sum(journey["anonymous"] for journey in journeys) == JOURNEYS["anonymous"]


def test_journey_arrays_are_what_the_app_expects(manifest, journeys):
    groups = manifest["event_groups"]
    steps = manifest["encoding"]["uv_steps"]
    for journey in journeys:
        t, e = journey["t"], journey["e"]
        assert len(t) == len(journey["u"]) == len(journey["v"]) == len(journey["y"]) == len(e) > 0, journey["id"]
        assert t[0] in ((0,) if journey["actor"] == "human" else (0, 5)), journey["id"]
        assert all(earlier <= later for earlier, later in zip(t, t[1:])), journey["id"]
        assert all(0 <= code <= steps for code in journey["u"] + journey["v"]), journey["id"]
        own_movement = groups["movement"][journey["actor"] == "bot"]
        assert own_movement in e and groups["movement"][journey["actor"] != "bot"] not in e, journey["id"]
        deaths = [index for index, code in enumerate(e) if code in groups["death"] + groups["storm_death"]]
        assert len(deaths) == (journey["fate"] != "no_death_recorded"), journey["id"]
        assert not any(code in groups["movement"] for code in e[deaths[0] :]) if deaths else True, journey["id"]


def test_match_entries_count_exactly_the_rows_of_their_journeys(manifest, journeys):
    groups = manifest["event_groups"]
    counted = {match["id"]: Counter() for match in manifest["matches"]}
    last_row = Counter()
    for journey in journeys:
        counts, who = counted[journey["match"]], "" if journey["actor"] == "human" else "bot_"
        counts["humans" if journey["actor"] == "human" else "bots"] += 1
        counts["anonymous"] += journey["anonymous"]
        counts["rows"] += len(journey["e"])
        counts[who + "kills"] += sum(code in groups["kill"] for code in journey["e"])
        counts[who + "deaths"] += sum(code in groups["death"] for code in journey["e"])
        counts["storm_deaths"] += sum(code in groups["storm_death"] for code in journey["e"])
        counts["loot"] += sum(code in groups["loot"] for code in journey["e"])
        last_row[journey["match"]] = max(last_row[journey["match"]], journey["t"][-1])
    for match in manifest["matches"]:
        recorded = {name: match[name] for name in TOTALS if name != "matches"}
        assert {name: counted[match["id"]][name] for name in recorded} == recorded, match["id"]
        assert match["span"] == last_row[match["id"]], match["id"]


def test_projection_fixture_agrees_with_the_projection_code(manifest):
    fixture = read(ROOT / "web" / "src" / "lib" / "__fixtures__" / "projection.json")
    assert fixture["encoding"] == manifest["encoding"]
    sizes = {(point["map"], point["width"], point["height"]) for point in fixture["points"]}
    assert sizes == {("AmbroseValley", 1024, 1024)} | {(map_id, *size) for map_id, size in MINIMAP_SIZES.items()}
    for point in fixture["points"]:
        u, v = world_to_uv(point["map"], point["x"], point["z"])
        px, py = uv_to_pixel(u, v, point["width"], point["height"])
        assert (point["px"], point["py"]) == pytest.approx((px, py), abs=1e-5), point["name"]
        assert abs(point["px_from_codes"] - px) < 0.05 and abs(point["py_from_codes"] - py) < 0.05, point["name"]
        assert abs(point["x_from_codes"] - point["x"]) < 0.01 and abs(point["z_from_codes"] - point["z"]) < 0.01, point["name"]
