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
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

DAY_FOLDER_GLOB = "February_*"
PARQUET_MAGIC = b"PAR1"
COLUMNS = ["user_id", "match_id", "map_id", "x", "y", "z", "ts", "event"]
MOVEMENT_EVENTS = ("Position", "BotPosition")
DEATH_EVENTS = ("Killed", "BotKilled", "KilledByStorm")
UNDECODABLE = "<undecodable>"

_UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")


def id_kind(user_id: str) -> str:
    """Classify a user_id by its format alone: 'uuid', 'numeric' or 'other'."""
    if _UUID.fullmatch(user_id):
        return "uuid"
    if user_id.isascii() and user_id.isdigit():
        return "numeric"
    return "other"


@dataclass(frozen=True)
class FileInfo:
    file: str  # "<day folder>/<file name>", unique per file
    day: str
    name: str
    size_bytes: int
    has_magic: bool  # starts and ends with the Parquet magic bytes
    rows: int
    created_by: str
    schema: str  # column name, type and nullability of every column
    ts_logical_type: str  # Parquet logical type of the ts column
    error: str | None  # set when the file could not be read


@dataclass(frozen=True)
class RawData:
    rows: pd.DataFrame  # every row of every readable file, in file order
    files: list[FileInfo]
    undecodable_events: int  # rows whose event bytes are not valid UTF-8


def list_files(raw_root: Path) -> list[Path]:
    """Every regular file inside the day folders, sorted by folder then name."""
    return sorted(p for p in raw_root.glob(f"{DAY_FOLDER_GLOB}/*") if p.is_file())


def _has_magic(path: Path) -> bool:
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
    file_id = f"{path.parent.name}/{path.name}"
    base = dict(file=file_id, day=path.parent.name, name=path.name, size_bytes=path.stat().st_size)
    try:
        has_magic = _has_magic(path)
        parquet = pq.ParquetFile(path)
        table = parquet.read()
        ts_column = parquet.schema.column(table.schema.get_field_index("ts"))
        frame = table.drop_columns(["ts", "event"]).to_pandas()
        frame["ts"] = table["ts"].cast(pa.int64()).to_numpy()
        frame["event"] = _decode(table["event"].to_pylist(), cache)
    except Exception as exc:  # any unreadable file is reported, never skipped silently
        info = FileInfo(**base, has_magic=False, rows=0, created_by="", schema="", ts_logical_type="", error=repr(exc))
        return info, None
    frame["file"] = file_id
    frame["day"] = path.parent.name
    frame["row"] = np.arange(len(frame), dtype=np.int32)
    info = FileInfo(
        **base,
        has_magic=has_magic,
        rows=table.num_rows,
        created_by=parquet.metadata.created_by,
        schema="; ".join(f"{f.name}: {f.type}{'' if f.nullable else ' not null'}" for f in table.schema),
        ts_logical_type=str(ts_column.logical_type),
        error=None,
    )
    return info, frame


def load_raw(raw_root: Path) -> RawData:
    """Read every telemetry file under ``raw_root`` (the unzipped player_data folder)."""
    paths = list_files(raw_root)
    if not paths:
        raise FileNotFoundError(f"No telemetry files found in {raw_root}/{DAY_FOLDER_GLOB}/")
    cache: dict[bytes, str] = {}
    infos, frames = [], []
    for path in paths:
        info, frame = _read_file(path, cache)
        infos.append(info)
        if frame is not None:
            frames.append(frame)
    if not frames:
        raise ValueError(f"None of the {len(paths)} files in {raw_root} could be read as Parquet")
    rows = pd.concat(frames, ignore_index=True)
    rows["id_kind"] = rows["user_id"].map(id_kind)
    return RawData(rows=rows, files=infos, undecodable_events=int((rows["event"] == UNDECODABLE).sum()))
