"""Load the raw LILA BLACK telemetry files into one DataFrame.

One file holds one player's (or bot's) journey through one match. The files are
Parquet without a .parquet extension. Two columns need care:

* ``ts`` is typed timestamp[ms], but the integer stored in it is Unix epoch
  SECONDS (measured; see docs/DATA_NOTES.md). The loader returns that raw
  integer untouched and never lets a library interpret it as milliseconds.
* ``event`` is stored as bytes and is decoded to str here (strict UTF-8).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field, replace
from datetime import date, datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

NOT_DAY_FOLDERS = frozenset({"minimaps"})  # every other sub-folder of the dataset holds the files of one day
NOT_DATA_FILES = frozenset({"README.md"})  # the only file that lies beside the folders
PARQUET_MAGIC = b"PAR1"
# Every file of the dataset has this schema (docs/DATA_NOTES.md, row 2). A file with another one is not loaded.
SCHEMA = pa.schema(
    [
        pa.field("user_id", pa.string(), nullable=False),
        pa.field("match_id", pa.string(), nullable=False),
        pa.field("map_id", pa.string(), nullable=False),
        pa.field("x", pa.float32(), nullable=False),
        pa.field("y", pa.float32(), nullable=False),
        pa.field("z", pa.float32(), nullable=False),
        pa.field("ts", pa.timestamp("ms"), nullable=False),
        pa.field("event", pa.binary(), nullable=False),
    ]
)
COLUMNS = SCHEMA.names
EPOCH_SECONDS = (1_000_000_000, 4_000_000_000)  # 2001 to 2096: where ts lies when it is Unix seconds, as measured

# The eight event types of the dataset README. The position in this tuple is the event's code in the app's data.
EVENTS = ("Position", "BotPosition", "Kill", "Killed", "BotKill", "BotKilled", "KilledByStorm", "Loot")
# What each event is to the app: a step of the path, or one of four markers. Events are written from the
# side of the journey's owner (docs/DATA_NOTES.md, row 9): a kill is the owner killing, a death the owner dying.
EVENT_GROUPS = {
    "movement": ("Position", "BotPosition"),
    "kill": ("Kill", "BotKill"),
    "death": ("Killed", "BotKilled"),
    "storm_death": ("KilledByStorm",),
    "loot": ("Loot",),
}
MOVEMENT_EVENTS = EVENT_GROUPS["movement"]
KILL_EVENTS = EVENT_GROUPS["kill"]
COMBAT_DEATH_EVENTS = EVENT_GROUPS["death"]
DEATH_EVENTS = COMBAT_DEATH_EVENTS + EVENT_GROUPS["storm_death"]
SAMPLE_STEP_SECONDS = 5  # a moving player's position is recorded this often (docs/DATA_NOTES.md, row 6)
UNDECODABLE = "<undecodable>"

PUBLIC_ID_LENGTH = 8  # leading characters of a player or match id that are published
FULL_ID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
_FULL_ID_IN_ANY_CASE = re.compile(FULL_ID.pattern, re.IGNORECASE)  # what a message must never show


def id_kind(user_id: str) -> str:
    """Classify a user_id by its format alone: 'uuid', 'numeric' or 'other'."""
    if FULL_ID.fullmatch(user_id):
        return "uuid"
    if user_id.isascii() and user_id.isdigit():
        return "numeric"
    return "other"


def short_ids(text: str) -> str:
    """The text with every full player or match id cut to its public prefix, for messages."""
    return _FULL_ID_IN_ANY_CASE.sub(lambda found: found.group()[:PUBLIC_ID_LENGTH], text)


def day_date(day: str, year: int) -> date:
    """The date of a day folder such as 'February_10' in a given year. Any other name is a ValueError that names it."""
    try:
        found = datetime.strptime(f"{year} {day}", "%Y %B_%d").date()
    except ValueError:
        found = None
    if found is None or not day.startswith(f"{found:%B}_"):  # strptime would also take 'february_10'
        raise ValueError(f"folder {day!r} is not a day of {year} named like February_10")
    return found


def day_dates(rows: pd.DataFrame) -> dict[str, str]:
    """The ISO date of every day folder, earliest first.

    A folder name carries no year; it is taken from the latest row filed in the folder.
    """
    latest = rows.groupby("day")["ts"].max()
    dates = {day: day_date(day, datetime.fromtimestamp(int(ts), timezone.utc).year).isoformat() for day, ts in latest.items()}
    return dict(sorted(dates.items(), key=lambda item: item[1]))


def describe_schema(schema: pa.Schema) -> str:
    """Column name, type and nullability of every column, as one line of text."""
    return "; ".join(f"{field.name}: {field.type}{'' if field.nullable else ' not null'}" for field in schema)


EXPECTED_SCHEMA = describe_schema(SCHEMA)


@dataclass(frozen=True)
class FileInfo:
    file: str  # "<day folder>/<file name>", unique per file
    day: str
    name: str
    size_bytes: int
    has_magic: bool  # starts and ends with the Parquet magic bytes
    rows: int
    created_by: str
    schema: str  # describe_schema of the file; empty when it could not be read as Parquet
    ts_logical_type: str  # Parquet logical type of the ts column
    error: str | None  # set when the file's rows were not loaded: not Parquet, or not the expected schema


@dataclass(frozen=True)
class RawData:
    rows: pd.DataFrame  # every row of every loaded file, in file order
    files: list[FileInfo]
    undecodable_events: int  # rows whose event bytes are not valid UTF-8
    unexpected: list[str] = field(default_factory=list)  # see unexpected_entries


def list_files(raw_root: Path) -> list[Path]:
    """Every data file: the regular files in the sub-folders of ``raw_root``, sorted by folder then name.

    The minimaps folder is not a day folder, and hidden files such as .DS_Store are not data.
    """
    in_day_folders = (p for p in raw_root.glob("*/*") if p.parent.name not in NOT_DAY_FOLDERS and not p.parent.name.startswith("."))
    return sorted(p for p in in_day_folders if p.is_file() and not p.name.startswith("."))


def unexpected_entries(raw_root: Path) -> list[str]:
    """What ``list_files`` passes over although it is neither hidden, the minimaps folder nor the README.

    A file beside the day folders, or a folder or a broken link inside one, may be data in a layout this loader does not read.
    """
    found = []
    for entry in sorted(raw_root.iterdir()):
        if entry.name.startswith(".") or entry.name in NOT_DAY_FOLDERS | NOT_DATA_FILES:
            continue
        if not entry.is_dir():
            found.append(entry.name)
            continue
        inside = (inner for inner in sorted(entry.iterdir()) if not inner.name.startswith("."))
        found += [f"{entry.name}/{inner.name}" for inner in inside if not inner.is_file()]
    return found


def _has_magic(path: Path) -> bool:
    if path.stat().st_size < 2 * len(PARQUET_MAGIC):
        return False
    with path.open("rb") as fh:
        head = fh.read(4)
        fh.seek(-4, 2)
        return head == PARQUET_MAGIC and fh.read(4) == PARQUET_MAGIC


def _decode(values: list[bytes], cache: dict[bytes, str]) -> list[str]:
    decoded = []
    for value in values:
        if value not in cache:
            try:
                cache[value] = value.decode("utf-8")
            except UnicodeDecodeError:
                cache[value] = UNDECODABLE
        decoded.append(cache[value])
    return decoded


def _read_file(path: Path, cache: dict[bytes, str]) -> tuple[FileInfo, pd.DataFrame | None]:
    """A file's description and its rows. The rows are None when the file is not Parquet or has another schema."""
    file_id = f"{path.parent.name}/{path.name}"
    info = FileInfo(
        file=file_id,
        day=path.parent.name,
        name=path.name,
        size_bytes=0,
        has_magic=False,
        rows=0,
        created_by="",
        schema="",
        ts_logical_type="",
        error=None,
    )
    try:
        info = replace(info, size_bytes=path.stat().st_size, has_magic=_has_magic(path))
        parquet = pq.ParquetFile(path)
        table = parquet.read()
    except (pa.ArrowException, OSError) as exc:  # cannot be opened or is not Parquet: reported by the caller, never skipped
        return replace(info, error=repr(exc)), None
    ts_index = table.schema.get_field_index("ts")
    info = replace(
        info,
        rows=table.num_rows,
        created_by=parquet.metadata.created_by or "",
        schema=describe_schema(table.schema),
        ts_logical_type=str(parquet.schema.column(ts_index).logical_type) if ts_index >= 0 else "",
    )
    if info.schema != EXPECTED_SCHEMA:
        return replace(info, error="unexpected schema"), None
    frame = table.drop_columns(["ts", "event"]).to_pandas()
    frame["ts"] = table["ts"].cast(pa.int64()).to_numpy()
    frame["event"] = _decode(table["event"].to_pylist(), cache)
    frame["file"] = file_id
    frame["day"] = path.parent.name
    frame["row"] = np.arange(len(frame), dtype=np.int32)
    return info, frame


def load_raw(raw_root: Path) -> RawData:
    """Read every telemetry file under ``raw_root`` (the unzipped player_data folder)."""
    paths = list_files(raw_root)
    if not paths:
        raise FileNotFoundError(f"No telemetry files found in the day folders of {raw_root}")
    cache: dict[bytes, str] = {}
    infos, frames = [], []
    for path in paths:
        info, frame = _read_file(path, cache)
        infos.append(info)
        if frame is not None:
            frames.append(frame)
    if not frames:
        first = infos[0]
        why = short_ids(f"{first.file}: {first.error}{', ' + first.schema if first.schema else ''}")
        raise ValueError(f"None of the {len(paths)} files in {raw_root} could be loaded, e.g. {why}")
    rows = pd.concat(frames, ignore_index=True)
    rows["id_kind"] = rows["user_id"].map(id_kind)
    undecodable = int((rows["event"] == UNDECODABLE).sum())
    return RawData(rows=rows, files=infos, undecodable_events=undecodable, unexpected=unexpected_entries(raw_root))
