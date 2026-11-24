"""The statistics behind INSIGHTS.md: the helpers on small cases, and the totals against the manifest and the tool."""
import re
from pathlib import Path

import numpy as np

from analysis.insights import (
    CELL_UNITS,
    TITLES,
    cells_for_half,
    crossed,
    findings,
    lines,
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
    expected = {"days": 5, "matches": 796, "journeys": 1_242, "journeys_of_humans": 798}
    assert numbers[TITLES["T"]] == expected | {"journeys_of_humans_with_an_account_id": 781, "journeys_of_bots": 444}
    total = manifest["totals"]
    assert (total["matches"], total["humans"], total["bots"], total["humans"] - total["anonymous"]) == (796, 798, 444, 781)
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


MAPS = ("Ambrose Valley", "Grand Rift", "Lockdown")


def test_the_numbers_insights_md_quotes():
    numbers = findings(*load())

    def of(title, key):
        return [numbers[TITLES[title]][name][key] for name in MAPS]

    # 1. The storm.
    assert of("A", "journeys") == [554, 57, 170]
    assert of("B", "storm_deaths") == [17, 5, 17]
    assert of("B", "pct_of_identified_journeys") == [3.1, 8.8, 10.0]
    assert of("B", "identified_journeys_still_recorded_at_the_earliest_storm_death") == [90, 8, 35]
    assert of("B", "pct_of_those_that_die_in_the_storm") == [18.9, 62.5, 48.6]
    assert [ended["no_death_recorded"] for ended in of("B", "how_those_journeys_ended")] == [66, 3, 18]
    assert of("B", "median_seconds_since_the_victims_last_loot") == [75, 96, 132]
    assert of("B", "first_second") == [669, 683, 655]
    assert of("B", "by_quarter")[2] == {"NW": 1, "NE": 7, "SW": 4, "SE": 5}
    # 2. Kills and loot.
    assert of("D", "kills_by_humans") == [1669, 179, 388]
    assert of("D", "pct_of_kills_within_one_cell_of_loot") == [99.3, 96.1, 94.8]
    assert of("D", "pct_of_the_cells_humans_cross_that_are_within_one_cell_of_loot") == [66.7, 58.8, 56.7]
    assert of("D", "cells_that_hold_half_of_the_loot") == [68, 36, 70]
    assert of("D", "pct_of_kills_in_those_cells_or_next_to_them") == [45.0, 48.0, 36.1]
    assert of("D", "pct_of_the_cells_humans_cross_that_are_those_cells_or_next_to_them") == [12.1, 21.0, 16.6]
    assert of("D", "rank_correlation_of_loot_and_kills_over_the_cells_humans_cross") == [0.55, 0.35, 0.33]
    assert of("C", "cells_that_hold_half_of_those_kills") == [125, 27, 74]
    assert of("C", "which_is_pct_of_the_cells_humans_cross") == [4.1, 2.6, 3.2]
    top = of("C", "fullest_cell")[0]
    assert (top["kills_by_humans"], top["x"], top["z"]) == (29, 95, -258)
    assert top["link"].endswith("?map=AmbroseValley&heat=kill&view=1058,1559,4")
    # 3. Traffic.
    assert of("E", "journeys") == [836, 111, 295]
    assert of("E", "cells_some_journey_crosses") == [3103, 1099, 2560]
    assert of("E", "pct_of_all_crossings_in_the_busiest_tenth_of_the_crossed_cells") == [30.1, 25.9, 27.8]
    assert of("E", "pct_of_those_crossed_by_fewer_than_one_journey_in_a_hundred") == [27.9, 9.3, 19.1]
    quarters = of("E", "pct_of_all_crossings_by_quarter")
    assert [f"{max(share, key=share.get)} {max(share.values())}" for share in quarters] == ["SW 30.0", "NW 37.5", "NE 32.6"]
    assert [f"{min(share, key=share.get)} {min(share.values())}" for share in quarters] == ["NE 19.2", "SE 16.9", "SE 17.6"]
    assert of("E", "pct_no_journey_crosses") == [45.9, 46.1, 64.6]


def test_every_number_in_insights_md_is_a_number_the_script_prints():
    printed = "\n".join(lines(findings(*load()))) + "\n"
    text = (ROOT / "INSIGHTS.md").read_text()
    decimals = set(re.findall(r"(?<![\w.,])\d+\.\d+(?![\w.])", text))
    prose = re.sub(r"\(https?://[^)]*\)|docs/[\w/.-]+", "", text)  # links and image paths hold ids and places, not findings
    whole = {n.replace(",", "") for n in re.findall(r"(?<![\w.:/−-])\d[\d,]*(?![\w.:%/])", prose)} - {"2026"}  # 2026: the year of the data
    assert len(decimals) > 30 and len(whole) > 30
    assert sorted(number for number in decimals if f": {number}\n" not in printed) == []
    assert sorted((n for n in whole if f": {n}\n" not in printed and f": {n}.0\n" not in printed), key=int) == []
