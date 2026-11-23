"""Build the static data files the web app loads.

    python -m pipeline.build_data --raw data/raw/player_data --out web/public/data

Reads the raw telemetry, checks it, applies the four cleaning rules and writes:

    manifest.json          maps, day folders and one entry per match
    maps/<Map>.json        every journey of a map as integer arrays
    minimaps/<Map>.webp    the minimap, downscaled
    cleaning_report.json   rows in, rows removed per rule, rows left

It also writes reference points for the app's projection tests (--fixtures).
With --profile the counts are compared with the profiler's report, and any
difference fails the build. No full player id is written anywhere.
"""
from __future__ import annotations

import argparse
import gzip
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image

from pipeline.clean import Cleaned, clean
from pipeline.dataset import COLUMNS, EPOCH_SECONDS, EVENTS, EXPECTED_SCHEMA, RawData, day_date, load_raw, short_ids
from pipeline.encode import ELEVATION_STEPS_PER_UNIT, UV_STEPS, encode_elevation, encode_uv
from pipeline.journeys import check_journeys, journey_table, match_table
from pipeline.maps import MAPS, uv_to_pixel, world_to_uv
from pipeline.minimap import load_minimap

MINIMAP_WIDTH = 2048
WEBP_QUALITY = 82
MAX_BUNDLE_GZIP_BYTES = 700_000
PARTIAL_DAYS = frozenset({"February_14"})  # the dataset README: collection was still running on this day
EVENT_CODE = {event: code for code, event in enumerate(EVENTS)}
README_EXAMPLE = {"name": "README worked example", "map": "AmbroseValley", "x": -301.45, "z": -355.55, "width": 1024, "height": 1024}
_FULL_UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")


def _is_day_folder(name: str) -> bool:
    try:
        day_date(name, 2000)  # a leap year, so that February_29 is a day folder too
    except ValueError:
        return False
    return True


def check_raw(data: RawData) -> None:
    """Raise ValueError when the raw files are not what this pipeline was built for."""
    rows, problems = data.rows, []
    not_parquet = [f for f in data.files if not f.schema or not f.has_magic]
    if not_parquet:
        problems.append(f"{len(not_parquet)} files are not readable Parquet, e.g. {not_parquet[0].file}: {not_parquet[0].error or 'no PAR1 magic bytes'}")
    other_schema = [f for f in data.files if f.schema and f.schema != EXPECTED_SCHEMA]
    if other_schema:
        problems.append(f"{len(other_schema)} files do not have the expected schema, e.g. {other_schema[0].file}: {other_schema[0].schema}")
    if empty := [f.file for f in data.files if f.error is None and f.rows == 0]:
        problems.append(f"{len(empty)} files hold no rows, e.g. {empty[0]}")
    if odd_folders := sorted({f.day for f in data.files if not _is_day_folder(f.day)}):
        problems.append(f"folders that are not day folders such as February_10: {odd_folders}")
    if not rows["ts"].between(*EPOCH_SECONDS).all():
        problems.append(f"ts runs from {rows['ts'].min()} to {rows['ts'].max()}, which is not Unix seconds")
    if unknown := sorted(set(rows["event"]) - set(EVENTS)):
        problems.append(f"unknown event values {unknown}")
    if unknown := sorted(set(rows["map_id"]) - set(MAPS)):
        problems.append(f"unknown map ids {unknown}")
    if rows[COLUMNS].isna().any().any() or not np.isfinite(rows[["x", "y", "z"]].to_numpy()).all():
        problems.append("null or non-finite values")
    if (rows.groupby("file")[["user_id", "match_id", "map_id"]].nunique() > 1).any().any():
        problems.append("a file holds several user, match or map ids")
    if (rows["file"] != rows["day"] + "/" + rows["user_id"] + "_" + rows["match_id"]).any():
        problems.append("a file is not named <user_id>_<match_id>")
    if (rows["id_kind"] == "other").any():
        problems.append("a user_id is neither a UUID nor a number")
    if problems:
        raise ValueError(short_ids("raw data check failed: " + "; ".join(problems)))


def with_uv(rows: pd.DataFrame) -> pd.DataFrame:
    """Add the u and v of every row on its own map."""
    x, z = rows["x"].to_numpy(np.float64), rows["z"].to_numpy(np.float64)
    u, v = np.empty(len(rows)), np.empty(len(rows))
    for map_id in rows["map_id"].unique():
        on_map = (rows["map_id"] == map_id).to_numpy()
        u[on_map], v[on_map] = world_to_uv(map_id, x[on_map], z[on_map])
    return rows.assign(u=u, v=v)


def _lines(head: dict[str, object], key: str, items: list[dict[str, object]]) -> str:
    """A JSON object whose last member ``key`` is an array written one item per line."""
    opening = json.dumps(head, separators=(",", ":"))[:-1]
    body = ",\n".join(json.dumps(item, separators=(",", ":")) for item in items)
    return f'{opening},"{key}":[\n{body}\n]}}\n'


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def write_minimaps(raw_root: Path, out_dir: Path) -> dict[str, dict[str, object]]:
    """Write each minimap as WebP and return its file name and its size as written."""
    written = {}
    for map_id, cfg in MAPS.items():
        target = out_dir / "minimaps" / f"{map_id}.webp"
        target.parent.mkdir(parents=True, exist_ok=True)
        load_minimap(raw_root / "minimaps" / cfg.minimap_file, MINIMAP_WIDTH).save(target, "WEBP", quality=WEBP_QUALITY, method=6)
        with Image.open(target) as image:
            written[map_id] = {"file": f"minimaps/{map_id}.webp", "width": image.width, "height": image.height}
    return written


def bundle_text(map_id: str, rows: pd.DataFrame, journeys: pd.DataFrame, match_start: pd.Series) -> str:
    """Every journey of one map: who it is, how it ended, and its rows as integer arrays."""
    order = journeys[journeys["map_id"] == map_id].assign(bot=lambda j: j["actor"] == "bot", name=lambda j: j["player"].fillna(""))
    order = order.sort_values(["match", "bot", "name"])
    by_file = {file: part for file, part in rows[rows["map_id"] == map_id].groupby("file", sort=False)}
    records = []
    for journey in order.itertuples():
        part = by_file[journey.Index]
        records.append(
            {
                "match": journey.match,
                "player": journey.player,
                "actor": journey.actor,
                "anonymous": bool(journey.anonymous),
                "death": journey.death,
                "t": (part["ts"] - match_start[journey.match]).tolist(),
                "u": encode_uv(part["u"].to_numpy()).tolist(),
                "v": encode_uv(part["v"].to_numpy()).tolist(),
                "y": encode_elevation(part["y"].to_numpy()).tolist(),
                "e": part["event"].map(EVENT_CODE).tolist(),
            }
        )
    return _lines({"map": map_id}, "journeys", records)


def _iso_date(day: str, any_ts: int) -> str:
    year = datetime.fromtimestamp(int(any_ts), timezone.utc).year
    return datetime.strptime(f"{year} {day}", "%Y %B_%d").date().isoformat()


def manifest_text(journeys: pd.DataFrame, matches: pd.DataFrame, minimaps: dict[str, dict[str, object]]) -> str:
    counted = ["humans", "anonymous", "bots", "kills", "deaths", "storm_deaths", "loot", "bot_deaths", "rows"]
    maps = [
        {
            "id": map_id,
            "name": cfg.name,
            "scale": cfg.scale,
            "origin_x": cfg.origin_x,
            "origin_z": cfg.origin_z,
            "minimap": minimaps[map_id],
            "journeys_file": f"maps/{map_id}.json",
            "matches": int((matches["map_id"] == map_id).sum()),
            "journeys": int((journeys["map_id"] == map_id).sum()),
        }
        for map_id, cfg in MAPS.items()
    ]
    days = [
        {"id": day, "date": _iso_date(day, part["start"].iloc[0]), "partial": day in PARTIAL_DAYS, "matches": len(part)}
        for day, part in matches.groupby("day")
    ]
    head = {
        "generated_by": "pipeline/build_data.py",
        "time": "t is seconds since the first recorded row of the match; start is Unix seconds, UTC",
        "encoding": {"uv_steps": UV_STEPS, "elevation_steps_per_unit": ELEVATION_STEPS_PER_UNIT},
        "events": list(EVENTS),
        "maps": maps,
        "days": days,
        "totals": {"matches": len(matches)} | {name: int(matches[name].sum()) for name in counted},
    }
    listing = matches.sort_values(["map_id", "start"]).reset_index()
    entries = [
        {"id": m.match, "map": m.map_id, "day": m.day, "start": int(m.start), "span": int(m.span)} | {name: int(getattr(m, name)) for name in counted}
        for m in listing.itertuples()
    ]
    return _lines(head, "matches", entries)


def cleaning_report(data: RawData, cleaned: Cleaned, journeys: pd.DataFrame, matches: pd.DataFrame) -> dict[str, object]:
    rows = cleaned.rows
    human = rows["file"].map(journeys["actor"]) == "human"

    def by_event(part: pd.DataFrame) -> dict[str, int]:
        return {event: int(count) for event, count in part["event"].value_counts().sort_index().items()}

    return {
        "rows_in": len(data.rows),
        "removed": cleaned.removed,
        "rows_out": len(rows),
        "rows_out_by_event": {event: int((rows["event"] == event).sum()) for event in EVENTS},
        "events_of_human_journeys": by_event(rows[human]),
        "events_of_bot_journeys": by_event(rows[~human]),
        "journeys": {
            "total": len(journeys),
            "human": int((journeys["actor"] == "human").sum()),
            "anonymous": int(journeys["anonymous"].sum()),
            "bot": int((journeys["actor"] == "bot").sum()),
        },
        "matches": len(matches),
        "matches_by_day": {day: int(count) for day, count in matches.groupby("day").size().items()},
    }


def projection_fixtures(rows: pd.DataFrame, minimaps: dict[str, dict[str, object]]) -> dict[str, object]:
    """Reference points for the app's projection tests, computed with pipeline/maps.py."""
    points = [dict(README_EXAMPLE)]
    for map_id in MAPS:
        on_map = rows[rows["map_id"] == map_id]
        if on_map.empty:
            continue
        extremes = {"smallest x": on_map["x"].idxmin(), "largest x": on_map["x"].idxmax(), "smallest z": on_map["z"].idxmin(), "largest z": on_map["z"].idxmax()}
        for label, index in extremes.items():
            size = minimaps[map_id]
            points.append({"name": f"{map_id}, {label}", "map": map_id, "x": float(rows.at[index, "x"]), "z": float(rows.at[index, "z"]), "width": size["width"], "height": size["height"]})
    for point in points:
        u, v = world_to_uv(point["map"], point["x"], point["z"])
        px, py = uv_to_pixel(u, v, point["width"], point["height"])
        point.update(u=round(u, 9), v=round(v, 9), px=round(px, 6), py=round(py, 6))
    constants = {map_id: {"scale": cfg.scale, "origin_x": cfg.origin_x, "origin_z": cfg.origin_z} for map_id, cfg in MAPS.items()}
    return {"generated_by": "pipeline/build_data.py from pipeline/maps.py; do not edit", "maps": constants, "points": points}


def counts_to_reconcile(report: dict[str, object]) -> dict[tuple[str, str], int]:
    """The build's counts, keyed by the profiler metric (topic, key) that measures the same thing."""
    removed, journeys = report["removed"], report["journeys"]
    counts = {
        ("files_schema", "rows_total"): report["rows_in"],
        ("cleaning", "rows_removed_spare_copy_of_journey"): removed["spare_copy_of_journey"],
        ("cleaning", "rows_removed_second_half_of_file_written_twice"): removed["second_half_of_file_written_twice"],
        ("cleaning", "rows_removed_Kill_mirroring_Killed"): removed["kill_mirroring_killed"],
        ("cleaning", "rows_removed_movement_after_death"): removed["movement_after_death"],
        ("cleaning", "rows_after_cleaning"): report["rows_out"],
        ("cleaning", "journeys_after_cleaning"): journeys["total"],
        ("cleaning", "journeys_after_cleaning_Position"): journeys["human"],
        ("cleaning", "journeys_after_cleaning_BotPosition"): journeys["bot"],
        ("actors_events", "files_numeric_with_Position"): journeys["anonymous"],
        ("matches_quality", "distinct_matches"): report["matches"],
    }
    counts |= {("cleaning", f"rows_after_cleaning_{event}"): count for event, count in report["rows_out_by_event"].items()}
    counts |= {("cleaning", f"matches_after_cleaning_in_{day}"): count for day, count in report["matches_by_day"].items()}
    for who in ("human", "bot"):
        events = report[f"events_of_{who}_journeys"]
        counts |= {("cleaning", f"rows_after_cleaning_{who}_{event}"): events.get(event, 0) for event in ("BotKill", "BotKilled", "Killed", "KilledByStorm", "Loot")}
    return counts


def differences_from_profile(report: dict[str, object], profile: dict[str, object]) -> list[str]:
    """One line for every count that the profiler's report and this build disagree on."""
    lines = []
    for (topic, key), built in counts_to_reconcile(report).items():
        measured = profile["metrics"].get(topic, {}).get(key, {}).get("value")
        if measured != built:
            lines.append(f"{topic}.{key}: profiler {measured}, build {built}")
    return lines


def build(raw_root: Path, out_dir: Path, fixtures_dir: Path) -> dict[str, object]:
    """Write every output file and return the cleaning report plus the size of each map bundle."""
    data = load_raw(raw_root)
    check_raw(data)
    cleaned = clean(data.rows)
    rows = with_uv(cleaned.rows)
    journeys = journey_table(rows)
    check_journeys(journeys)
    matches = match_table(journeys)

    minimaps = write_minimaps(raw_root, out_dir)
    texts = {out_dir / "manifest.json": manifest_text(journeys, matches, minimaps)}
    bundle_bytes = {}
    for map_id in MAPS:
        text = bundle_text(map_id, rows, journeys, matches["start"])
        texts[out_dir / "maps" / f"{map_id}.json"] = text
        bundle_bytes[map_id] = {"bytes": len(text.encode()), "gzip_bytes": len(gzip.compress(text.encode(), mtime=0))}
    report = cleaning_report(data, cleaned, journeys, matches)
    texts[out_dir / "cleaning_report.json"] = json.dumps(report, indent=2) + "\n"
    texts[fixtures_dir / "projection.json"] = json.dumps(projection_fixtures(rows, minimaps), indent=2) + "\n"

    for path, text in texts.items():
        if leaked := _FULL_UUID.search(text):
            raise ValueError(f"{path.name} would contain a full id: {leaked.group()[:8]}...")
        _write(path, text)
    too_big = [map_id for map_id, size in bundle_bytes.items() if size["gzip_bytes"] > MAX_BUNDLE_GZIP_BYTES]
    if too_big:
        raise ValueError(f"map bundles over {MAX_BUNDLE_GZIP_BYTES} bytes gzipped: {too_big}")
    return report | {"bundles": bundle_bytes}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--raw", type=Path, default=Path("data/raw/player_data"), help="the unzipped player_data folder")
    parser.add_argument("--out", type=Path, default=Path("web/public/data"), help="folder for the app's data files")
    parser.add_argument("--fixtures", type=Path, default=Path("web/src/lib/__fixtures__"), help="folder for the projection test fixtures")
    parser.add_argument("--profile", type=Path, help="profile_report.json to reconcile the counts with")
    args = parser.parse_args()

    try:
        report = build(args.raw, args.out, args.fixtures)
    except ValueError as error:
        sys.exit(f"build failed: {error}")
    removed = ", ".join(f"{count} {name.replace('_', ' ')}" for name, count in report["removed"].items())
    print(f"rows: {report['rows_in']:,} in, {report['rows_out']:,} out (removed: {removed})")
    print(f"journeys: {report['journeys']}; matches: {report['matches']}")
    for map_id, size in report["bundles"].items():
        print(f"maps/{map_id}.json: {size['bytes'] / 1e3:,.0f} kB, {size['gzip_bytes'] / 1e3:,.0f} kB gzipped")
    if args.profile:
        differences = differences_from_profile(report, json.loads(args.profile.read_text()))
        if differences:
            sys.exit("build differs from the profiler's report:\n  " + "\n  ".join(differences))
        print(f"counts agree with {args.profile}")


if __name__ == "__main__":
    main()
