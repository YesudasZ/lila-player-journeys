"""The loader, on synthetic files shaped like the real ones.

Like the real data: no .parquet extension, events stored as bytes, and Unix
seconds sitting inside a timestamp[ms] column.
"""
import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from pipeline.dataset import DEATH_EVENTS, EVENT_GROUPS, EVENTS, EXPECTED_SCHEMA, SCHEMA, UNDECODABLE, day_date, day_dates, id_kind, load_raw, short_ids
from pipeline.tests.helpers import FIRST_TS, HUMAN, MATCH, OTHER_MATCH, frame, rows_of, write_files


def test_ts_keeps_the_raw_integer_seconds(tmp_path):
    write_files(tmp_path, rows_of("February_10", HUMAN, MATCH, [(0, "Position"), (5, "Position"), (10, "Loot")]))
    rows = load_raw(tmp_path).rows
    assert rows["ts"].dtype == "int64"
    assert rows["ts"].tolist() == [FIRST_TS, FIRST_TS + 5, FIRST_TS + 10]


def test_event_bytes_are_decoded_to_text(tmp_path):
    write_files(tmp_path, rows_of("February_10", HUMAN, MATCH, [(0, "Position"), (5, "KilledByStorm")]))
    data = load_raw(tmp_path)
    assert data.rows["event"].tolist() == ["Position", "KilledByStorm"]
    assert data.undecodable_events == 0


def test_invalid_utf8_is_counted_not_hidden(tmp_path):
    write_files(tmp_path, rows_of("February_10", HUMAN, MATCH, [(0, "Position"), (5, b"\xff\xfe")]))
    data = load_raw(tmp_path)
    assert data.rows["event"].tolist() == ["Position", UNDECODABLE]
    assert data.undecodable_events == 1


def test_rows_keep_file_identity_and_file_order(tmp_path):
    write_files(
        tmp_path,
        frame(
            rows_of("February_10", HUMAN, MATCH, [(0, "Position"), (5, "Loot")]),
            rows_of("February_11", "1440", MATCH, [(0, "BotPosition")]),
        ),
    )
    data = load_raw(tmp_path)
    assert [f.file for f in data.files] == [f"February_10/{HUMAN}_{MATCH}", f"February_11/1440_{MATCH}"]
    assert data.rows["row"].tolist() == [0, 1, 0]
    assert data.rows["day"].tolist() == ["February_10", "February_10", "February_11"]
    assert data.rows["id_kind"].tolist() == ["uuid", "uuid", "numeric"]


def test_same_file_name_in_two_day_folders_stays_two_files(tmp_path):
    write_files(tmp_path, frame(rows_of("February_10", HUMAN, MATCH, [(0, "Position")]), rows_of("February_11", HUMAN, MATCH, [(0, "Position")])))
    data = load_raw(tmp_path)
    assert len(data.files) == 2
    assert data.rows["file"].nunique() == 2


def test_unreadable_file_is_reported_with_its_error(tmp_path):
    write_files(tmp_path, rows_of("February_10", HUMAN, MATCH, [(0, "Position")]))
    (tmp_path / "February_10" / "not_parquet.nakama-0").write_bytes(b"definitely not parquet")
    data = load_raw(tmp_path)
    broken = [f for f in data.files if f.error is not None]
    assert [f.name for f in broken] == ["not_parquet.nakama-0"]
    assert len(data.rows) == 1


def test_file_too_short_to_be_parquet_is_reported_too(tmp_path):
    write_files(tmp_path, rows_of("February_10", HUMAN, MATCH, [(0, "Position")]))
    (tmp_path / "February_10" / "cut_short.nakama-0").write_bytes(b"PAR")
    (broken,) = [f for f in load_raw(tmp_path).files if f.error is not None]
    assert (broken.name, broken.has_magic, broken.schema) == ("cut_short.nakama-0", False, "")


def test_schema_is_the_one_measured_on_the_real_files():
    assert EXPECTED_SCHEMA == (
        "user_id: string not null; match_id: string not null; map_id: string not null; "
        "x: float not null; y: float not null; z: float not null; ts: timestamp[ms] not null; event: binary not null"
    )


def test_file_with_another_schema_is_reported_and_not_loaded(tmp_path):
    write_files(tmp_path, rows_of("February_10", HUMAN, MATCH, [(0, "Position")]))
    as_text = pa.table({"user_id": ["1440"], "match_id": [MATCH], "map_id": ["Lockdown"], "x": [1.0], "y": [1.0], "z": [1.0], "ts": [FIRST_TS], "event": ["Position"]})
    pq.write_table(as_text, tmp_path / "February_10" / f"1440_{MATCH}")
    data = load_raw(tmp_path)
    (other,) = [f for f in data.files if f.error is not None]
    assert (other.error, other.rows, other.has_magic) == ("unexpected schema", 1, True)
    assert "event: string" in other.schema
    assert data.rows["user_id"].unique().tolist() == [HUMAN]


def test_file_without_rows_is_listed_with_zero_rows(tmp_path):
    write_files(tmp_path, rows_of("February_10", HUMAN, MATCH, [(0, "Position")]))
    pq.write_table(SCHEMA.empty_table(), tmp_path / "February_10" / f"1440_{MATCH}")
    data = load_raw(tmp_path)
    assert [(f.rows, f.error) for f in data.files] == [(0, None), (1, None)]
    assert len(data.rows) == 1


def test_every_sub_folder_is_read_except_minimaps_and_hidden_files(tmp_path):
    write_files(tmp_path, frame(rows_of("February_10", HUMAN, MATCH, [(0, "Position")]), rows_of("March_01", HUMAN, OTHER_MATCH, [(0, "Position")])))
    (tmp_path / "minimaps").mkdir()
    (tmp_path / "minimaps" / "AmbroseValley_Minimap.png").write_bytes(b"an image")
    (tmp_path / "February_10" / ".DS_Store").write_bytes(b"written by Finder")
    (tmp_path / "README.md").write_text("not in a folder")
    data = load_raw(tmp_path)
    assert [f.day for f in data.files] == ["February_10", "March_01"]
    assert all(f.error is None for f in data.files)


def test_missing_data_folder_is_a_clear_error(tmp_path):
    with pytest.raises(FileNotFoundError):
        load_raw(tmp_path)


def test_day_folders_are_dated_and_ordered_by_date_not_by_name():
    rows = frame(rows_of("February_10", HUMAN, MATCH, [(0, "Position")]), rows_of("February_9", HUMAN, OTHER_MATCH, [(0, "Position")]))
    assert list(day_dates(rows).items()) == [("February_9", "2026-02-09"), ("February_10", "2026-02-10")]
    with pytest.raises(ValueError):
        day_date("minimaps", 2026)


def test_every_event_is_in_exactly_one_group():
    grouped = [event for events in EVENT_GROUPS.values() for event in events]
    assert sorted(grouped) == sorted(EVENTS)
    assert DEATH_EVENTS == ("Killed", "BotKilled", "KilledByStorm")


def test_short_ids_cuts_every_full_id_to_its_public_prefix():
    assert short_ids(f"February_10/{HUMAN}_{MATCH} and 1440_{MATCH}") == "February_10/1a2b3c4d_aaaaaaaa.nakama-0 and 1440_aaaaaaaa.nakama-0"


@pytest.mark.parametrize(
    ("user_id", "kind"),
    [(HUMAN, "uuid"), ("1440", "numeric"), ("382", "numeric"), ("", "other"), ("bot-7", "other"), (HUMAN.upper(), "other")],
)
def test_id_kind_looks_only_at_the_format(user_id, kind):
    assert id_kind(user_id) == kind
