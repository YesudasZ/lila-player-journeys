"""The statistics behind INSIGHTS.md: the helpers on small cases, and the totals against the manifest and the tool."""
from pathlib import Path

import numpy as np

from analysis.insights import (
    CELL_UNITS,
    TITLES,
    cells_for_half,
    crossed,
    findings,
    load,
    map_data,
    near,
    on_artwork,
    pct,
    place,
    quadrant,
    ranks,
)

ROOT = Path(__file__).resolve().parents[2]
KIND_OF = {0: 0, 1: 0, 2: 1, 3: 2, 4: 1, 5: 2, 6: 3, 7: 4}  # the manifest's event codes as kinds
ARTWORK = {"left": 0.0, "top": 0.0, "right": 0.5, "bottom": 1.0}  # the west half of the image
ENTRY = {"id": "Tiny", "name": "Tiny", "scale": 100.0, "origin_x": -50.0, "origin_z": 0.0, "matches": 1}
TINY = ENTRY | {"minimap": {"width": 1000, "height": 1000, "artwork": ARTWORK}}
STEPS = 1000  # a stored u or v of 50 is 0.05 of the map: with 10 cells across, the middle of the first cell


def journey(u, v, events):
    who = {"id": "m-x", "match": "m", "actor": "human", "anonymous": False, "fate": "no_death_recorded"}
    return who | {"t": [5 * row for row in range(len(u))], "u": u, "v": v, "e": events}


def test_cells_for_half_is_the_fewest_cells_that_hold_half():
    assert cells_for_half(np.array([5, 1, 1, 1, 2])) == 1
    assert cells_for_half(np.array([1, 1, 1, 1])) == 2
    assert cells_for_half(np.array([3, 3, 3])) == 2
    assert cells_for_half(np.zeros(4, dtype=int)) == 0


def test_near_adds_the_eight_cells_around():
    grid = np.array([1, 0, 0, 0, 2, 0, 0, 0, 0])  # three by three: 1 in a corner, 2 in the middle
    assert near(grid, 3).tolist() == [3, 3, 2, 3, 3, 2, 2, 2, 2]


def test_a_path_is_followed_between_its_rows_and_ends_at_its_death():
    two_rows = journey([50, 950], [50, 50], [0, 0])  # west to east along the south edge, in one step
    dies = journey([50, 50, 50], [50, 450, 950], [0, 3, 0])  # northward; it dies at its second row, and a row follows the death
    data = map_data(TINY, [two_rows, dies], KIND_OF, STEPS)
    per_cell = crossed(data, np.array([True, True])).reshape(10, 10)
    assert per_cell[0].tolist() == [2, 1, 1, 1, 1, 1, 1, 1, 1, 1]  # every cell of the south row, the first by both
    assert per_cell[:, 0].tolist() == [2, 1, 1, 1, 1, 0, 0, 0, 0, 0]  # up to the cell of the death, and no further
    assert crossed(data, np.array([False, True])).sum() == 5


def test_artwork_cells_places_and_quarters():
    data = map_data(TINY, [journey([50], [50], [0])], KIND_OF, STEPS)
    assert on_artwork(data).reshape(10, 10).sum(axis=0).tolist() == [10, 10, 10, 10, 10, 0, 0, 0, 0, 0]
    assert place(data, 0) == {"x": -45, "z": 5} and place(data, 99) == {"x": 45, "z": 95}
    # the middle of this artwork is at a quarter of the width and half of the height
    assert quadrant(data, np.array([0.1, 0.4, 0.1, 0.4]), np.array([0.9, 0.9, 0.1, 0.1])).tolist() == ["NW", "NE", "SW", "SE"]


def test_ranks_share_the_mean_rank_among_equals_and_a_share_of_nothing_is_nothing():
    assert ranks(np.array([10, 30, 10, 20])).tolist() == [0.5, 3.0, 0.5, 2.0]
    assert (pct(1, 3), pct(0, 0)) == (33.3, 0.0)


def test_the_totals_are_the_manifests_and_the_tools():
    manifest, maps = load()
    numbers = findings(manifest, maps)
    kills = numbers[TITLES["C"]]
    assert sum(entry["kills_by_humans"] for entry in kills.values()) == manifest["totals"]["kills"] == 2_236
    assert sum(entry["kills_by_bots"] for entry in kills.values()) == manifest["totals"]["bot_kills"] == 170
    # What the legend of the tool's Kills layer says on each map: the matches behind the kills, and what the fullest cell holds.
    fullest = "fullest_cell_counting_all_kills_as_the_tools_legend_does"
    in_the_tool = {name: (entry["matches_with_a_kill"], entry[fullest]) for name, entry in kills.items()}
    assert in_the_tool == {"Ambrose Valley": (441, 29), "Grand Rift": (42, 8), "Lockdown": (122, 7)}
    assert sum(entry["storm_deaths"] for entry in numbers[TITLES["B"]].values()) == manifest["totals"]["storm_deaths"] == 39
    identified = manifest["totals"]["humans"] - manifest["totals"]["anonymous"]
    assert sum(entry["journeys"] for entry in numbers[TITLES["A"]].values()) == identified == 781
    assert sum(entry["loot_events_of_humans"] for entry in numbers[TITLES["D"]].values()) == manifest["totals"]["loot"] == 12_829
    assert all(entry["cells_crossed_outside_the_artwork"] == 0 for entry in numbers[TITLES["E"]].values())
    assert sum(entry["matches_with_a_bots_journey"] for entry in numbers[TITLES["F"]].values()) == 52


def test_the_cells_are_the_cells_of_the_apps_heat_layers():
    assert f"export const CELL_UNITS = {CELL_UNITS};" in (ROOT / "web" / "src" / "lib" / "heat.ts").read_text()
