"""The whole report: every section in the report's order, and the README's claims next to what was measured."""
from __future__ import annotations

from pathlib import Path

from pipeline.dataset import load_raw
from pipeline.profile.actors import actors, events
from pipeline.profile.cleaning import cleaning
from pipeline.profile.combat import combat
from pipeline.profile.coordinates import coordinates
from pipeline.profile.files import file_table, inventory, naming, schema
from pipeline.profile.matches import matches
from pipeline.profile.metrics import Entries, joined
from pipeline.profile.quality import deaths, duplicates
from pipeline.profile.timestamps import timestamps
from pipeline.profile.values import json_ready

# The report lists its metrics by topic: the sections each topic takes them from, in the order they are listed.
TOPICS = {
    "files_schema": ("inventory", "schema", "naming"),
    "actors_events": ("events", "actors", "combat"),
    "time": ("timestamps",),
    "matches_quality": ("matches", "duplicates", "deaths"),
    "coordinates": ("coordinates",),
    "cleaning": ("cleaning",),
}
# How an entry of the details is computed, where its name does not say it.
DETAIL_DEFINITIONS = {
    "timestamps > speed_world_units_per_raw_ts_unit": (
        "Horizontal distance divided by raw ts difference, over consecutive movement rows of a file sorted by (ts, file order). "
        "share_above_5 is the share of pairs above 5.001. "
        "median_first_gap is the median over files of the raw ts difference between a file's first two movement rows."
    ),
    "timestamps > Position_distance_by_gap_length": (
        "Consecutive Position rows of a file sorted by (ts, file order), grouped by their raw ts difference. "
        "median_distance_per_unit_of_gap divides each pair's horizontal distance by its ts difference."
    ),
    "timestamps > human_file_starts_by_utc_hour": (
        "Files with Position rows, counted by the UTC hour of their smallest raw ts read as Unix seconds. "
        "The six-hour windows wrap around midnight."
    ),
    "matches > duration": (
        "Largest minus smallest raw ts over the files recorded for a match. "
        "It is an observed span, not the length of the match."
    ),
    "duplicates > within_file_copies_directly_after_their_twin": (
        "Surplus identical rows whose previous row in file order is identical on all eight columns, "
        "as a share of all surplus identical rows within a file."
    ),
    "deaths > files_by_actor_and_fate": "Fate is the event of the file's first death row in (ts, file order), or 'no death row'.",
    "deaths > storm_deaths_seconds_into_match_by_map": "Raw ts of the KilledByStorm row minus the smallest raw ts of its match.",
    "combat > rows_paired_with_rows_in_another_file": (
        "For each row of the first kind: partner rows in the same match, in another file, with a raw ts at most 1 away. "
        "Distance is horizontal, to the nearest such partner."
    ),
    "combat > distance_from_event_row_to_nearest_movement_sample_of_same_file": (
        "Horizontal distance from each non-movement row to the movement row of the same file that is nearest in time."
    ),
    "cleaning": (
        "The four rules are applied in order, each to what the previous one left. "
        "Actor (human or bot) comes from the movement event of the file."
    ),
}
# The files per day folder, as the README counts them.
README_FILES_PER_DAY = {"February_10": 437, "February_11": 293, "February_12": 268, "February_13": 166, "February_14": 79}


def build_report(raw_root: Path) -> dict[str, object]:
    """Measure the raw files under ``raw_root`` and return the whole report, ready for json.dumps."""
    data = load_raw(raw_root)
    rows = data.rows
    files = file_table(rows)
    sections = {
        "inventory": inventory(data),
        "schema": schema(data),
        "naming": naming(rows, files),
        "events": events(rows),
        "actors": actors(rows, files),
        "timestamps": timestamps(rows, files),
        "matches": matches(rows, files),
        "duplicates": duplicates(rows),
        "deaths": deaths(rows, files),
        "combat": combat(rows, files),
        "coordinates": coordinates(rows, raw_root),
        "cleaning": cleaning(rows, files),
    }
    metrics = {topic: joined(*(sections[name][0] for name in names)) for topic, names in TOPICS.items()}
    details = {name: section_details for name, (_, section_details) in sections.items()}
    report = {
        "readme_check": readme_check(metrics, details),
        "metrics": metrics,
        "detail_definitions": DETAIL_DEFINITIONS,
        "details": details,
    }
    return json_ready(report)


def readme_check(metrics: dict[str, Entries], details: dict[str, dict[str, object]]) -> list[dict[str, object]]:
    """The README's checkable claims next to what the files contain."""
    value = {(topic, key): entry["value"] for topic, entries in metrics.items() for key, entry in entries.items()}
    files, rows = value["files_schema", "files_total"], value["files_schema", "rows_total"]
    per_day = {day: value["files_schema", f"files_{day}"] for day in README_FILES_PER_DAY}
    matches_total = value["matches_quality", "distinct_matches"]
    uuid_ids, numeric_ids = value["actors_events", "distinct_uuid_user_ids"], value["actors_events", "distinct_numeric_user_ids"]
    placeholder_ids = value["actors_events", "numeric_user_ids_with_Position"]
    numeric_human_files = value["actors_events", "files_numeric_with_Position"]
    players = (
        f"{value['actors_events', 'distinct_user_ids']} distinct user_ids = {uuid_ids} UUIDs + {numeric_ids} numeric ids. "
        f"The numeric ids are bot ids, except {placeholder_ids} that stand on {numeric_human_files} files with Position rows, "
        "one id per map"
    )
    movement_share = details["events"]["movement_share_of_rows"]
    sizes = {k: f"{v['width']}x{v['height']}" for k, v in details["coordinates"]["per_map"].items()}
    ts_range = details["timestamps"]["raw_range_read_as_unix_seconds"]
    file_span = details["timestamps"]["file_span"]["if_seconds"]
    ts_found = (
        f"raw values {value['time', 'raw_ts_min']} to {value['time', 'raw_ts_max']} are Unix seconds "
        f"({ts_range['first']} to {ts_range['last']}); a file spans {file_span['median']:.0f} raw units at the median"
    )
    numeric_humans = f"{numeric_human_files} files with a numeric user_id contain Position rows"
    checks = [
        ("Total files", 1243, files, files == 1243),
        ("Files per day folder", README_FILES_PER_DAY, per_day, per_day == README_FILES_PER_DAY),
        ("Total event rows", "~89,000", rows, round(rows, -3) == 89_000),
        ("Unique matches", 796, matches_total, matches_total == 796),
        ("Unique players", 339, players, "partly"),
        ("Event types", 8, value["files_schema", "distinct_event_values"], not details["schema"]["event_values_not_in_readme"]),
        ("Position events are ~85%+ of rows", ">= 85%", f"{movement_share:.1%} (Position + BotPosition)", movement_share >= 0.85),
        ("Minimap images are 1024x1024", "1024x1024", sizes, all(s == "1024x1024" for s in sizes.values())),
        ("ts is milliseconds elapsed within the match", "match-relative ms", ts_found, False),
        ("UUID user_id = human, numeric user_id = bot", "no exceptions", numeric_humans, numeric_human_files == 0),
    ]
    verdict = {True: "yes", False: "no"}
    return [{"claim": claim, "readme": readme, "data": data, "holds": verdict.get(holds, holds)} for claim, readme, data, holds in checks]
