"""What must never be committed: raw telemetry, the assignment brief, a full player or match id."""
import re
import subprocess
from pathlib import Path

import pytest

from pipeline.tests import helpers

ROOT = Path(__file__).resolve().parents[2]
RAW_INPUT = re.compile(r"\.(nakama-0|parquet|pdf|zip)$|^(_inbox|data/raw)/")
FULL_ID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
IMAGE = re.compile(r"\.(jpg|png|webp)$")
MADE_UP_IDS = {FULL_ID.search(value).group() for value in (helpers.HUMAN, helpers.OTHER_HUMAN, helpers.MATCH, helpers.OTHER_MATCH, helpers.THIRD_MATCH)}


@pytest.fixture(scope="module")
def tracked_files():
    try:
        listing = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError):
        pytest.skip("not a git checkout")
    return [name for name in listing.splitlines() if (ROOT / name).is_file()]


@pytest.mark.parametrize("name", ["data/raw/player_data/February_10/1440_match.nakama-0", "_inbox/brief.pdf", "player_data.zip", "export.parquet"])
def test_raw_inputs_would_be_caught(name):
    assert RAW_INPUT.search(name)


@pytest.mark.parametrize("name", ["web/public/data/maps/AmbroseValley.json", "docs/img/overlay_Lockdown.jpg", "pipeline/dataset.py"])
def test_generated_and_source_files_are_allowed(name):
    assert not RAW_INPUT.search(name)


def test_a_full_id_would_be_caught():
    real_looking = "-".join(["0" * 8, "1" * 4, "4" + "2" * 3, "8" + "3" * 3, "4" * 12])
    assert set(FULL_ID.findall(f"player {real_looking} in a match")) - MADE_UP_IDS == {real_looking}


def test_no_raw_data_or_brief_is_tracked(tracked_files):
    assert [name for name in tracked_files if RAW_INPUT.search(name)] == []


def test_no_full_player_or_match_id_is_tracked(tracked_files):
    found = {}
    for name in tracked_files:
        if IMAGE.search(name):
            continue
        ids = set(FULL_ID.findall((ROOT / name).read_text())) - MADE_UP_IDS
        if ids:
            found[name] = sorted(ids)
    assert found == {}
