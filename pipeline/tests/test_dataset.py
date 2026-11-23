"""The loader, on synthetic files shaped like the real ones.

Like the real data: no .parquet extension, events stored as bytes, and Unix
seconds sitting inside a timestamp[ms] column.
"""
import os
import time

import pyarrow.parquet as pq
import pytest

from pipeline.dataset import (
    DEATH_EVENTS,
    EVENT_GROUPS,
    EVENTS,
    EXPECTED_SCHEMA,
    SCHEMA,
    UNDECODABLE,
    day_date,
    day_dates,
    id_kind,
    load_raw,
    short_ids,
    unexpected_entries,
)
from pipeline.tests.helpers import FIRST_TS, HUMAN, MATCH, OTHER_MATCH, frame, rows_of, write_file_with_text_events, write_files


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
    once = [(0, "Position")]
    write_files(tmp_path, frame(rows_of("February_10", HUMAN, MATCH, once), rows_of("February_11", HUMAN, MATCH, once)))
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
    write_file_with_text_events(tmp_path, "February_10", "1440", MATCH)
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
    once = [(0, "Position")]
    write_files(tmp_path, frame(rows_of("February_10", HUMAN, MATCH, once), rows_of("March_01", HUMAN, OTHER_MATCH, once)))
    (tmp_path / "minimaps").mkdir()
    (tmp_path / "minimaps" / "AmbroseValley_Minimap.png").write_bytes(b"an image")
    (tmp_path / "February_10" / ".DS_Store").write_bytes(b"written by Finder")
    (tmp_path / "README.md").write_text("not in a folder")
    data = load_raw(tmp_path)
    assert [f.day for f in data.files] == ["February_10", "March_01"]
    assert all(f.error is None for f in data.files)


def test_hidden_folders_and_folders_inside_a_day_folder_are_not_read_as_data(tmp_path):
    write_files(tmp_path, rows_of("February_10", HUMAN, MATCH, [(0, "Position")]))
    (tmp_path / ".Trashes").mkdir()
    (tmp_path / ".Trashes" / "deleted.nakama-0").write_bytes(b"left behind by the Finder")
    (tmp_path / "February_10" / "a_folder").mkdir()
    assert [f.file for f in load_raw(tmp_path).files] == [f"February_10/{HUMAN}_{MATCH}"]


def test_what_the_loader_passes_over_is_listed_unless_it_is_hidden_the_minimaps_or_the_readme(tmp_path):
    write_files(tmp_path, rows_of("February_10", HUMAN, MATCH, [(0, "Position")]))
    for folder in ("minimaps", ".git", "February_10/one_level_too_deep"):
        (tmp_path / folder).mkdir()
    for name in ("README.md", ".DS_Store", f"1440_{MATCH}", "February_10/.hidden", "minimaps/Lockdown_Minimap.jpg"):
        (tmp_path / name).write_bytes(b"not looked at")
    (tmp_path / "February_10" / "broken_link").symlink_to(tmp_path / "gone")
    assert unexpected_entries(tmp_path) == [f"1440_{MATCH}", "February_10/broken_link", "February_10/one_level_too_deep"]
    assert load_raw(tmp_path).unexpected == unexpected_entries(tmp_path)


@pytest.mark.parametrize(
    ("content", "has_magic"),
    [(b"PAR1", False), (b"PAR1PAR1", True), (b"PAR1 and no footer", False), (b"no header but PAR1", False)],
)
def test_magic_bytes_have_to_be_at_both_ends_of_the_file(tmp_path, content, has_magic):
    write_files(tmp_path, rows_of("February_10", HUMAN, MATCH, [(0, "Position")]))
    (tmp_path / "February_10" / "damaged.nakama-0").write_bytes(content)
    (damaged,) = [f for f in load_raw(tmp_path).files if f.error is not None]
    assert damaged.has_magic is has_magic


def test_file_with_both_magics_and_no_parquet_between_them_is_reported_with_its_error(tmp_path):
    write_files(tmp_path, rows_of("February_10", HUMAN, MATCH, [(0, "Position")]))
    (tmp_path / "February_10" / "hollow.nakama-0").write_bytes(b"PAR1" + bytes(20) + b"PAR1")
    (hollow,) = [f for f in load_raw(tmp_path).files if f.error is not None]
    assert (hollow.name, hollow.has_magic, hollow.schema) == ("hollow.nakama-0", True, "")
    assert hollow.error.startswith("OSError")


@pytest.mark.skipif(os.geteuid() == 0, reason="root can read any file")
def test_file_that_may_not_be_opened_is_reported_like_any_other_unreadable_file(tmp_path):
    two_files = frame(rows_of("February_10", HUMAN, MATCH, [(0, "Position")]), rows_of("February_10", "1440", MATCH, [(0, "BotPosition")]))
    write_files(tmp_path, two_files)
    (tmp_path / "February_10" / f"1440_{MATCH}").chmod(0)
    (locked,) = [f for f in load_raw(tmp_path).files if f.error is not None]
    assert locked.error.startswith("PermissionError") and HUMAN not in locked.error and MATCH not in locked.error


def test_file_description_holds_its_size_its_writer_and_the_logical_type_of_ts(tmp_path):
    write_files(tmp_path, rows_of("February_10", HUMAN, MATCH, [(0, "Position"), (5, "Position")]))
    (info,) = load_raw(tmp_path).files
    assert info.size_bytes == (tmp_path / "February_10" / f"{HUMAN}_{MATCH}").stat().st_size > 0
    assert info.created_by.startswith("parquet-cpp-arrow version ")
    assert info.ts_logical_type.startswith("Timestamp(isAdjustedToUTC=false, timeUnit=milliseconds")


def test_folder_in_which_no_file_can_be_loaded_is_an_error_that_says_why(tmp_path):
    (tmp_path / "February_10").mkdir()
    (tmp_path / "February_10" / f"{HUMAN}_{MATCH}").write_bytes(b"definitely not parquet")
    message = "None of the 1 files in .* could be loaded, e.g. February_10/1a2b3c4d_aaaaaaaa.nakama-0: ArrowInvalid"
    with pytest.raises(ValueError, match=message):
        load_raw(tmp_path)


def test_missing_data_folder_is_a_clear_error(tmp_path):
    with pytest.raises(FileNotFoundError):
        load_raw(tmp_path)


def test_day_folders_are_dated_and_ordered_by_date_not_by_name():
    rows = frame(rows_of("February_10", HUMAN, MATCH, [(0, "Position")]), rows_of("February_9", HUMAN, OTHER_MATCH, [(0, "Position")]))
    assert list(day_dates(rows).items()) == [("February_9", "2026-02-09"), ("February_10", "2026-02-10")]


@pytest.mark.parametrize("name", ["minimaps", "february_10", "Feb_10", "February 10", "February_10_copy", "February_30", "2026-02-10"])
def test_folder_that_is_not_named_like_a_day_is_an_error_that_names_it(name):
    with pytest.raises(ValueError, match=f"folder '{name}' is not a day of 2026 named like February_10"):
        day_date(name, 2026)


def test_february_29_is_a_day_in_a_leap_year_only():
    assert day_date("February_29", 2028).isoformat() == "2028-02-29"
    with pytest.raises(ValueError, match="folder 'February_29' is not a day of 2026"):
        day_date("February_29", 2026)


@pytest.fixture
def far_from_utc(monkeypatch):
    """Local time 13 hours ahead of UTC, for a test that must not depend on the time zone of the machine."""
    monkeypatch.setenv("TZ", "Pacific/Auckland")
    time.tzset()
    yield
    monkeypatch.undo()
    time.tzset()


def test_year_of_a_day_folder_is_that_of_its_latest_row_in_utc(far_from_utc):
    new_year = 28_034_439  # seconds from FIRST_TS to 2027-01-01 00:00:00 UTC
    written_after_midnight = rows_of("January_1", HUMAN, MATCH, [(new_year - 30, "Position"), (new_year + 5, "Position")])
    two_hours_before = rows_of("December_31", HUMAN, OTHER_MATCH, [(new_year - 7200, "Position")])
    dates = day_dates(frame(written_after_midnight, two_hours_before))
    assert list(dates.items()) == [("December_31", "2026-12-31"), ("January_1", "2027-01-01")]


def test_every_event_is_in_exactly_one_group():
    grouped = [event for events in EVENT_GROUPS.values() for event in events]
    assert sorted(grouped) == sorted(EVENTS)
    assert DEATH_EVENTS == ("Killed", "BotKilled", "KilledByStorm")


def test_short_ids_cuts_every_full_id_to_its_public_prefix():
    assert short_ids(f"February_10/{HUMAN}_{MATCH} and 1440_{MATCH}") == "February_10/1a2b3c4d_aaaaaaaa.nakama-0 and 1440_aaaaaaaa.nakama-0"
    assert short_ids(f"an id in capitals, {HUMAN.upper()}, is cut too") == "an id in capitals, 1A2B3C4D, is cut too"


ID_KINDS = [
    (HUMAN, "uuid"),
    ("1440", "numeric"),
    ("382", "numeric"),
    ("", "other"),
    ("bot-7", "other"),
    (HUMAN.upper(), "other"),
    ("１４４０", "other"),  # digits, but not the ASCII ones
]


@pytest.mark.parametrize(("user_id", "kind"), ID_KINDS)
def test_id_kind_looks_only_at_the_format(user_id, kind):
    assert id_kind(user_id) == kind
