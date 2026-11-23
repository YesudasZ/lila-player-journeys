"""What must never be committed: raw telemetry, the assignment brief, a full player or match id."""
import os
import re
import subprocess
from pathlib import Path

import pytest

from pipeline.dataset import FULL_ID
from pipeline.tests import helpers

ROOT = Path(__file__).resolve().parents[2]
RAW_INPUT = re.compile(r"\.(nakama-0|parquet|pdf|zip)$|^(_inbox|data/raw)/")
FULL_ID_IN_BYTES = re.compile(FULL_ID.pattern.encode())
# The ids the tests are built from. They are made up, and helpers.py is the only place allowed to hold a full id.
MADE_UP_IDS = {found.group() for value in vars(helpers).values() if isinstance(value, str) and (found := FULL_ID.search(value))}


def full_ids_in(content: bytes) -> set[str]:
    """Every full id in a file's content that is not one of the made-up test ids. Works for text and binary files."""
    return {found.decode() for found in FULL_ID_IN_BYTES.findall(content)} - MADE_UP_IDS


@pytest.fixture(scope="module")
def tracked_files():
    try:
        listing = subprocess.run(["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError):
        if os.environ.get("CI"):
            pytest.fail("CI has to check the tracked files, but git could not list them")
        pytest.skip("not a git checkout")
    return [name for name in listing.split("\0") if name and (ROOT / name).is_file()]


RAW_INPUT_NAMES = ["data/raw/player_data/February_10/1440_match.nakama-0", "_inbox/brief.pdf", "player_data.zip", "export.parquet"]


@pytest.mark.parametrize("name", RAW_INPUT_NAMES)
def test_raw_inputs_would_be_caught(name):
    assert RAW_INPUT.search(name)


@pytest.mark.parametrize("name", ["web/public/data/maps/AmbroseValley.json", "docs/img/overlay_Lockdown.jpg", "pipeline/dataset.py"])
def test_generated_and_source_files_are_allowed(name):
    assert not RAW_INPUT.search(name)


def test_a_full_id_would_be_caught_in_text_and_in_a_binary_file():
    real_looking = "-".join(["0" * 8, "1" * 4, "4" + "2" * 3, "8" + "3" * 3, "4" * 12])
    assert full_ids_in(f"player {real_looking} and test player {helpers.HUMAN}".encode()) == {real_looking}
    assert full_ids_in(b"\x89PNG\r\n\xff\xfe" + real_looking.encode() + b"\x00\xff") == {real_looking}
    assert len(MADE_UP_IDS) == 6


def test_no_raw_data_or_brief_is_tracked(tracked_files):
    assert [name for name in tracked_files if RAW_INPUT.search(name)] == []


def test_no_full_player_or_match_id_is_tracked(tracked_files):
    found = {name: sorted(ids) for name in tracked_files if (ids := full_ids_in((ROOT / name).read_bytes()))}
    assert found == {}
