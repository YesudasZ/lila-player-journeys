"""The loader, on synthetic files shaped like the real ones.

Like the real data: no .parquet extension, events stored as bytes, and Unix
seconds sitting inside a timestamp[ms] column.
"""
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from pipeline.dataset import UNDECODABLE, id_kind, load_raw

HUMAN = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"  # made up, not a real player
MATCH = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.nakama-0"
FIRST_TS = 1_770_727_161  # 2026-02-10 12:39:21 UTC when read as seconds


def write_journey(folder: Path, user_id: str, events: list[bytes]) -> None:
    n = len(events)
    table = pa.table(
        {
            "user_id": [user_id] * n,
            "match_id": [MATCH] * n,
            "map_id": ["AmbroseValley"] * n,
            "x": pa.array([1.5] * n, pa.float32()),
            "y": pa.array([100.0] * n, pa.float32()),
            "z": pa.array([-2.5] * n, pa.float32()),
            "ts": pa.array([FIRST_TS + 5 * i for i in range(n)], pa.timestamp("ms")),
            "event": pa.array(events, pa.binary()),
        }
    )
    folder.mkdir(parents=True, exist_ok=True)
    pq.write_table(table, folder / f"{user_id}_{MATCH}")


def test_ts_keeps_the_raw_integer_seconds(tmp_path):
    write_journey(tmp_path / "February_10", HUMAN, [b"Position", b"Position", b"Loot"])
    rows = load_raw(tmp_path).rows
    assert rows["ts"].dtype == "int64"
    assert rows["ts"].tolist() == [FIRST_TS, FIRST_TS + 5, FIRST_TS + 10]


def test_event_bytes_are_decoded_to_text(tmp_path):
    write_journey(tmp_path / "February_10", HUMAN, [b"Position", b"KilledByStorm"])
    data = load_raw(tmp_path)
    assert data.rows["event"].tolist() == ["Position", "KilledByStorm"]
    assert data.undecodable_events == 0


def test_invalid_utf8_is_counted_not_hidden(tmp_path):
    write_journey(tmp_path / "February_10", HUMAN, [b"Position", b"\xff\xfe"])
    data = load_raw(tmp_path)
    assert data.rows["event"].tolist() == ["Position", UNDECODABLE]
    assert data.undecodable_events == 1


def test_rows_keep_file_identity_and_file_order(tmp_path):
    write_journey(tmp_path / "February_10", HUMAN, [b"Position", b"Loot"])
    write_journey(tmp_path / "February_11", "1440", [b"BotPosition"])
    data = load_raw(tmp_path)
    assert [f.file for f in data.files] == [f"February_10/{HUMAN}_{MATCH}", f"February_11/1440_{MATCH}"]
    assert data.rows["row"].tolist() == [0, 1, 0]
    assert data.rows["day"].tolist() == ["February_10", "February_10", "February_11"]
    assert data.rows["id_kind"].tolist() == ["uuid", "uuid", "numeric"]


def test_same_file_name_in_two_day_folders_stays_two_files(tmp_path):
    write_journey(tmp_path / "February_10", HUMAN, [b"Position"])
    write_journey(tmp_path / "February_11", HUMAN, [b"Position"])
    data = load_raw(tmp_path)
    assert len(data.files) == 2
    assert data.rows["file"].nunique() == 2


def test_unreadable_file_is_reported_with_its_error(tmp_path):
    write_journey(tmp_path / "February_10", HUMAN, [b"Position"])
    (tmp_path / "February_10" / "not_parquet.nakama-0").write_bytes(b"definitely not parquet")
    data = load_raw(tmp_path)
    broken = [f for f in data.files if f.error is not None]
    assert [f.name for f in broken] == ["not_parquet.nakama-0"]
    assert len(data.rows) == 1


def test_missing_data_folder_is_a_clear_error(tmp_path):
    with pytest.raises(FileNotFoundError):
        load_raw(tmp_path)


@pytest.mark.parametrize(
    ("user_id", "kind"),
    [(HUMAN, "uuid"), ("1440", "numeric"), ("382", "numeric"), ("", "other"), ("bot-7", "other"), (HUMAN.upper(), "other")],
)
def test_id_kind_looks_only_at_the_format(user_id, kind):
    assert id_kind(user_id) == kind
