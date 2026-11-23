"""Build the static data files the web app loads.

    python -m pipeline.build_data --raw data/raw/player_data --out web/public/data

Reads the raw telemetry, checks it, applies the four cleaning rules and writes:

    manifest.json          maps, day folders and one entry per match
    maps/<Map>.json        every journey of a map as integer arrays
    minimaps/<Map>.webp    the minimap, downscaled
    cleaning_report.json   rows in, rows removed per rule, rows left

It also writes reference points for the app's projection tests (--fixtures).
docs/DATA_FORMAT.md describes every field. Nothing is written until all
checks have passed: no full player id in any file, no map bundle over the size
limit and, with --profile, the same counts as the profiler's report.
"""
from __future__ import annotations

import argparse
import gzip
import io
import json
import sys
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from PIL import Image

from pipeline.clean import Cleaned, clean
from pipeline.dataset import (
    COLUMNS,
    EPOCH_SECONDS,
    EVENT_GROUPS,
    EVENTS,
    EXPECTED_SCHEMA,
    FULL_ID,
    PUBLIC_ID_LENGTH,
    SAMPLE_STEP_SECONDS,
    RawData,
    day_date,
    day_dates,
    load_raw,
    short_ids,
)
from pipeline.encode import ELEVATION_STEPS_PER_UNIT, UV_STEPS, decode_elevation, decode_uv, encode_elevation, encode_uv
from pipeline.journeys import FATES, MATCH_COUNTS, check_journeys, journey_table, match_table
from pipeline.maps import MAPS, README_EXAMPLE, uv_to_pixel, uv_to_world, world_to_uv
from pipeline.minimap import load_minimap

MINIMAP_WIDTH = 2048
WEBP_QUALITY = 82
MAX_BUNDLE_GZIP_BYTES = 700_000
PARTIAL_DAYS = frozenset({"February_14"})  # the dataset README: collection was still running on this day
EVENT_CODE = {event: code for code, event in enumerate(EVENTS)}
EVENTS_COUNTED_PER_ACTOR = ("BotKill", "BotKilled", "Killed", "KilledByStorm", "Loot")  # the profiler counts these for humans and for bots

Json = dict[str, Any]  # a JSON object on its way to a file


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
        first = not_parquet[0]
        problems.append(f"{len(not_parquet)} files are not readable Parquet, e.g. {first.file}: {first.error or 'no PAR1 magic bytes'}")
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
    if not_last := sorted(PARTIAL_DAYS & set(list(day_dates(rows))[:-1])):
        raise ValueError(f"raw data check failed: {not_last} is marked as a partial day in PARTIAL_DAYS but is not the last day folder")


def with_uv(rows: pd.DataFrame) -> pd.DataFrame:
    """Add the u and v of every row on its own map. A row off the minimap is an error: it is never clipped."""
    x, z = rows["x"].to_numpy(np.float64), rows["z"].to_numpy(np.float64)
    u, v = np.empty(len(rows)), np.empty(len(rows))
    for map_id in rows["map_id"].unique():
        on_map = (rows["map_id"] == map_id).to_numpy()
        u[on_map], v[on_map] = world_to_uv(map_id, x[on_map], z[on_map])
    located = rows.assign(u=u, v=v)
    off = located[~(located["u"].between(0.0, 1.0) & located["v"].between(0.0, 1.0))]
    if len(off):
        first = off.iloc[0]
        where = f"x {first['x']:.1f}, z {first['z']:.1f} on {first['map_id']} in {first['file']}"
        raise ValueError(short_ids(f"{len(off)} rows are off the minimap, e.g. {where}"))
    return located


def _lines(head: Json, key: str, items: list[Json]) -> str:
    """A JSON object whose last member ``key`` is an array written one item per line."""
    opening = json.dumps(head, separators=(",", ":"))[:-1]
    body = ",\n".join(json.dumps(item, separators=(",", ":")) for item in items)
    return f'{opening},"{key}":[\n{body}\n]}}\n'


def minimap_images(raw_root: Path) -> dict[str, bytes]:
    """Each minimap as a WebP file's content, at most MINIMAP_WIDTH pixels wide."""
    images = {}
    for map_id, cfg in MAPS.items():
        encoded = io.BytesIO()
        load_minimap(raw_root / "minimaps" / cfg.minimap_file, MINIMAP_WIDTH).save(encoded, "WEBP", quality=WEBP_QUALITY, method=6)
        images[map_id] = encoded.getvalue()
    return images


def image_size(encoded: bytes) -> tuple[int, int]:
    """Width and height of an encoded image, read back from the bytes that will be shipped."""
    with Image.open(io.BytesIO(encoded)) as image:
        return image.size


def bundle_text(map_id: str, rows: pd.DataFrame, journeys: pd.DataFrame, match_start: pd.Series) -> str:
    """Every journey of one map: who it is, how it ended, and its rows as integer arrays.

    Humans come before bots within a match, and bots in the order of their number.
    """
    on_map = journeys[journeys["map_id"] == map_id]
    is_bot = on_map["actor"] == "bot"
    listing = on_map.assign(bot=is_bot, number=pd.to_numeric(on_map["user_id"].where(is_bot, "0")), name=on_map["player"].fillna(""))
    by_file = {file: part for file, part in rows[rows["map_id"] == map_id].groupby("file", sort=False)}
    records = []
    for journey in listing.sort_values(["match", "bot", "number", "name"]).itertuples():
        part = by_file[journey.Index]
        records.append(
            {
                "id": journey.id,
                "match": journey.match,
                "player": journey.player,
                "actor": journey.actor,
                "anonymous": bool(journey.anonymous),
                "fate": journey.fate,
                "t": (part["ts"] - match_start[journey.match]).tolist(),
                "u": encode_uv(part["u"].to_numpy()).tolist(),
                "v": encode_uv(part["v"].to_numpy()).tolist(),
                "y": encode_elevation(part["y"].to_numpy()).tolist(),
                "e": part["event"].map(EVENT_CODE).tolist(),
            }
        )
    return _lines({"map": map_id}, "journeys", records)


def manifest_text(journeys: pd.DataFrame, matches: pd.DataFrame, minimap_sizes: dict[str, tuple[int, int]]) -> str:
    """What the app loads first: constants, maps, day folders, totals and one line per match."""
    maps = [
        {
            "id": map_id,
            "name": cfg.name,
            "scale": cfg.scale,
            "origin_x": cfg.origin_x,
            "origin_z": cfg.origin_z,
            "minimap": {"file": f"minimaps/{map_id}.webp", "width": minimap_sizes[map_id][0], "height": minimap_sizes[map_id][1]},
            "journeys_file": f"maps/{map_id}.json",
            "matches": int((matches["map_id"] == map_id).sum()),
            "journeys": int((journeys["map_id"] == map_id).sum()),
        }
        for map_id, cfg in MAPS.items()
    ]
    days = [
        {"id": day, "date": date, "partial": day in PARTIAL_DAYS, "matches": len(part)}
        for (date, day), part in matches.groupby(["date", "day"])
    ]
    head = {
        "generated_by": "pipeline/build_data.py; the fields are described in docs/DATA_FORMAT.md",
        "encoding": {"uv_steps": UV_STEPS, "elevation_steps_per_unit": ELEVATION_STEPS_PER_UNIT},
        "sample_step_seconds": SAMPLE_STEP_SECONDS,
        "events": list(EVENTS),
        "event_groups": {group: [EVENT_CODE[event] for event in events] for group, events in EVENT_GROUPS.items()},
        "fates": list(FATES),
        "maps": maps,
        "days": days,
        "totals": {"matches": len(matches)} | {name: int(matches[name].sum()) for name in MATCH_COUNTS},
    }
    listing = matches.reset_index().sort_values(["map_id", "start", "match"])
    entries = [
        {"id": m.match, "map": m.map_id, "day": m.day, "start": int(m.start), "span": int(m.span)}
        | {name: int(getattr(m, name)) for name in MATCH_COUNTS}
        for m in listing.itertuples()
    ]
    return _lines(head, "matches", entries)


def cleaning_report(data: RawData, cleaned: Cleaned, journeys: pd.DataFrame, matches: pd.DataFrame) -> Json:
    """What went in, what each rule removed and what is left, in the terms of the profiler's report."""
    rows = cleaned.rows
    human = rows["file"].map(journeys["actor"]) == "human"

    def by_event(part: pd.DataFrame) -> dict[str, int]:
        return {event: int((part["event"] == event).sum()) for event in EVENTS}

    return {
        "rows_in": len(data.rows),
        "removed": cleaned.removed,
        "rows_out": len(rows),
        "rows_out_by_event": by_event(rows),
        "events_of_human_journeys": by_event(rows[human]),
        "events_of_bot_journeys": by_event(rows[~human]),
        "journeys": {
            "total": len(journeys),
            "human": int((journeys["actor"] == "human").sum()),
            "anonymous": int(journeys["anonymous"].sum()),
            "bot": int((journeys["actor"] == "bot").sum()),
        },
        "matches": len(matches),
        "matches_by_day": {day: len(part) for (_, day), part in matches.groupby(["date", "day"])},
        "match_span_seconds": {"median": float(matches["span"].median()), "max": int(matches["span"].max())},
    }


def projection_fixtures(rows: pd.DataFrame, minimap_sizes: dict[str, tuple[int, int]]) -> Json:
    """Reference points for the app's projection tests, computed with pipeline/maps.py and pipeline/encode.py.

    Each point has the exact transform (x, z to u, v to px, py on an image of
    the given size) and what the app really works with: u and v as integer
    codes, and the pixel and world position those codes decode to. Points
    taken from the data also carry an elevation and its code.
    """
    example = README_EXAMPLE
    size = example.image_size
    points: list[Json] = [
        {"name": "README worked example", "map": example.map_id, "x": example.x, "z": example.z, "width": size, "height": size}
    ]
    for map_id in MAPS:
        on_map = rows[rows["map_id"] == map_id]
        if on_map.empty:
            continue
        width, height = minimap_sizes[map_id]
        extremes = {
            "smallest x": on_map["x"].idxmin(),
            "largest x": on_map["x"].idxmax(),
            "smallest z": on_map["z"].idxmin(),
            "largest z": on_map["z"].idxmax(),
        }
        for label, index in extremes.items():
            row = rows.loc[index]
            position = {"x": float(row["x"]), "z": float(row["z"]), "y": float(row["y"])}
            points.append({"name": f"{map_id}, {label}", "map": map_id} | position | {"width": width, "height": height})
    for point in points:
        u, v = world_to_uv(point["map"], point["x"], point["z"])
        px, py = uv_to_pixel(u, v, point["width"], point["height"])
        u_code, v_code = encode_uv(np.array([u, v])).tolist()
        coded_u, coded_v = decode_uv(np.array([u_code, v_code])).tolist()
        coded_px, coded_py = uv_to_pixel(coded_u, coded_v, point["width"], point["height"])
        coded_x, coded_z = uv_to_world(point["map"], coded_u, coded_v)
        point.update(u=round(u, 9), v=round(v, 9), px=round(px, 6), py=round(py, 6))
        point.update(u_code=u_code, v_code=v_code, px_from_codes=round(coded_px, 6), py_from_codes=round(coded_py, 6))
        point.update(x_from_codes=round(coded_x, 6), z_from_codes=round(coded_z, 6))
        if "y" in point:
            y_code = int(encode_elevation(np.array([point["y"]]))[0])
            point.update(y_code=y_code, y_from_code=float(decode_elevation(np.array([y_code]))[0]))
    return {
        "generated_by": "pipeline/build_data.py from pipeline/maps.py and pipeline/encode.py; do not edit",
        "encoding": {"uv_steps": UV_STEPS, "elevation_steps_per_unit": ELEVATION_STEPS_PER_UNIT},
        "maps": {map_id: {"scale": cfg.scale, "origin_x": cfg.origin_x, "origin_z": cfg.origin_z} for map_id, cfg in MAPS.items()},
        "points": points,
    }


def counts_to_reconcile(report: Json) -> dict[tuple[str, str], float]:
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
        ("cleaning", "match_span_median_after_cleaning"): report["match_span_seconds"]["median"],
        ("cleaning", "match_span_max_after_cleaning"): report["match_span_seconds"]["max"],
    }
    counts |= {("cleaning", f"rows_after_cleaning_{event}"): count for event, count in report["rows_out_by_event"].items()}
    counts |= {("cleaning", f"matches_after_cleaning_in_{day}"): count for day, count in report["matches_by_day"].items()}
    for who in ("human", "bot"):
        left = report[f"events_of_{who}_journeys"]
        counts |= {("cleaning", f"rows_after_cleaning_{who}_{event}"): left[event] for event in EVENTS_COUNTED_PER_ACTOR}
    return counts


def differences_from_profile(report: Json, profile: Json) -> list[str]:
    """One line for every count that the profiler's report and this build disagree on."""
    lines = []
    for (topic, key), built in counts_to_reconcile(report).items():
        measured = profile["metrics"].get(topic, {}).get(key, {}).get("value")
        if measured != built:
            lines.append(f"{topic}.{key}: profiler {measured}, build {built}")
    return lines


def check_output(texts: dict[Path, str], bundle_bytes: dict[str, dict[str, int]]) -> None:
    """Raise ValueError when a file about to be written holds a full id, or a map bundle is too large."""
    for path, text in texts.items():
        if leaked := FULL_ID.search(text):
            raise ValueError(f"{path.name} would contain a full id: {leaked.group()[:PUBLIC_ID_LENGTH]}...")
    too_big = [map_id for map_id, size in bundle_bytes.items() if size["gzip_bytes"] > MAX_BUNDLE_GZIP_BYTES]
    if too_big:
        raise ValueError(f"map bundles over {MAX_BUNDLE_GZIP_BYTES} bytes gzipped: {too_big}")


def build(raw_root: Path, out_dir: Path, fixtures_dir: Path, profile: Path | None = None) -> Json:
    """Build every output file, check them all, and only then write them.

    Returns the cleaning report plus the size of each map bundle. Any failed
    check is a ValueError and leaves ``out_dir`` and ``fixtures_dir`` as they were.
    """
    data = load_raw(raw_root)
    check_raw(data)
    cleaned = clean(data.rows)
    rows = with_uv(cleaned.rows)
    journeys = journey_table(rows)
    check_journeys(journeys)
    matches = match_table(journeys)
    report = cleaning_report(data, cleaned, journeys, matches)

    images = {out_dir / "minimaps" / f"{map_id}.webp": image for map_id, image in minimap_images(raw_root).items()}
    minimap_sizes = {path.stem: image_size(image) for path, image in images.items()}
    bundles = {map_id: bundle_text(map_id, rows, journeys, matches["start"]) for map_id in MAPS}
    bundle_bytes = {}
    for map_id, text in bundles.items():
        encoded = text.encode()
        bundle_bytes[map_id] = {"bytes": len(encoded), "gzip_bytes": len(gzip.compress(encoded, mtime=0))}
    texts = {out_dir / "manifest.json": manifest_text(journeys, matches, minimap_sizes)}
    texts |= {out_dir / "maps" / f"{map_id}.json": text for map_id, text in bundles.items()}
    texts[out_dir / "cleaning_report.json"] = json.dumps(report, indent=2) + "\n"
    texts[fixtures_dir / "projection.json"] = json.dumps(projection_fixtures(rows, minimap_sizes), indent=2) + "\n"

    check_output(texts, bundle_bytes)
    if profile is not None:
        differences = differences_from_profile(report, json.loads(profile.read_text()))
        if differences:
            raise ValueError("the counts differ from the profiler's report:\n  " + "\n  ".join(differences))
    for path, content in (images | {path: text.encode() for path, text in texts.items()}).items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    return report | {"bundles": bundle_bytes}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--raw", type=Path, default=Path("data/raw/player_data"), help="the unzipped player_data folder")
    parser.add_argument("--out", type=Path, default=Path("web/public/data"), help="folder for the app's data files")
    parser.add_argument("--fixtures", type=Path, default=Path("web/src/lib/__fixtures__"), help="folder for the projection test fixtures")
    parser.add_argument("--profile", type=Path, help="profile_report.json to reconcile the counts with")
    args = parser.parse_args()

    try:
        report = build(args.raw, args.out, args.fixtures, args.profile)
    except (ValueError, FileNotFoundError) as error:
        sys.exit(f"build failed, nothing was written: {error}")
    removed = ", ".join(f"{count} {name.replace('_', ' ')}" for name, count in report["removed"].items())
    print(f"rows: {report['rows_in']:,} in, {report['rows_out']:,} out (removed: {removed})")
    print(f"journeys: {report['journeys']}; matches: {report['matches']}")
    for map_id, size in report["bundles"].items():
        print(f"maps/{map_id}.json: {size['bytes'] / 1e3:,.0f} kB, {size['gzip_bytes'] / 1e3:,.0f} kB gzipped")
    if args.profile:
        print(f"counts agree with {args.profile}")


if __name__ == "__main__":
    main()
