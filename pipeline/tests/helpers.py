"""Builders for synthetic telemetry shaped like the real files. All ids are made up."""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from pipeline.dataset import SCHEMA, id_kind

HUMAN = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"
OTHER_HUMAN = "9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f"
MATCH = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.nakama-0"
OTHER_MATCH = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff.nakama-0"
THIRD_MATCH = "cccccccc-dddd-4eee-8fff-000000000000.nakama-0"
FIRST_TS = 1_770_727_161  # 2026-02-10 12:39:21 UTC when read as seconds


def rows_of(day: str, user_id: str, match_id: str, events: list[tuple], map_id: str = "AmbroseValley") -> pd.DataFrame:
    """One file's rows, as ``load_raw`` returns them.

    ``events`` holds (seconds, event) or (seconds, event, x, z) tuples in file
    order; seconds count from FIRST_TS. Without x and z a row gets a position
    that depends on its second only.
    """
    seconds = [e[0] for e in events]
    x = [float(e[2]) if len(e) > 2 else 10.0 + e[0] for e in events]
    z = [float(e[3]) if len(e) > 2 else -20.0 for e in events]
    return pd.DataFrame(
        {
            "user_id": user_id,
            "match_id": match_id,
            "map_id": map_id,
            "x": np.array(x, dtype=np.float32),
            "y": np.float32(100.0),
            "z": np.array(z, dtype=np.float32),
            "ts": np.array([FIRST_TS + s for s in seconds], dtype=np.int64),
            "event": pd.Series([e[1] for e in events], dtype=object),
            "file": f"{day}/{user_id}_{match_id}",
            "day": day,
            "row": np.arange(len(events), dtype=np.int32),
            "id_kind": id_kind(user_id),
        }
    )


def frame(*files: pd.DataFrame) -> pd.DataFrame:
    """Several files' rows as one frame, like the ``rows`` of ``load_raw``."""
    return pd.concat(files, ignore_index=True)


def write_files(raw_root: Path, rows: pd.DataFrame) -> None:
    """Write each file of ``rows`` the way the real data is stored.

    No .parquet extension, the event as bytes, and Unix seconds inside a
    timestamp[ms] column. An event given as bytes is written as it is.
    """
    for file_id, part in rows.groupby("file", sort=False):
        events = [e if isinstance(e, bytes) else e.encode() for e in part["event"]]
        table = pa.table(
            {
                "user_id": part["user_id"].tolist(),
                "match_id": part["match_id"].tolist(),
                "map_id": part["map_id"].tolist(),
                "x": pa.array(part["x"], pa.float32()),
                "y": pa.array(part["y"], pa.float32()),
                "z": pa.array(part["z"], pa.float32()),
                "ts": pa.array(part["ts"].tolist(), pa.timestamp("ms")),
                "event": pa.array(events, pa.binary()),
            },
            schema=SCHEMA,
        )
        path = raw_root / file_id
        path.parent.mkdir(parents=True, exist_ok=True)
        pq.write_table(table, path)
