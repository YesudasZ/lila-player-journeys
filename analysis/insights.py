"""The numbers behind INSIGHTS.md, counted from the files the app loads (web/public/data/).

Run it from the repo root with ``make insights``. It needs no raw data. It counts in the cells of
the app's heat layers, 10 x 10 world units, and follows a path between its rows, so every number
can be looked up in the tool at the link printed with it.
"""
from __future__ import annotations

import json
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

DATA = Path(__file__).resolve().parent.parent / "web" / "public" / "data"
SITE = "https://lila-player-journeys-psi.vercel.app/"
CELL_UNITS = 10  # the side of a cell in world units, as in the app's heat layers (web/src/lib/heat.ts)
KINDS = ("movement", "kill", "death", "storm_death", "loot")  # the manifest's event groups, in the order of the codes below
MOVEMENT, KILL, DEATH, STORM, LOOT = range(len(KINDS))
EARLY_SECONDS = 120  # a death in the first two minutes of a match counts as early


@dataclass(frozen=True)
class MapData:
    """One map: its manifest entry, its journeys, and every row of them as arrays."""

    entry: dict[str, Any]
    cells: int  # cells across, and as many up
    journeys: list[dict[str, Any]]
    start: np.ndarray  # where the rows of each journey start, and one more entry for the end
    owner: np.ndarray  # for every row, the index of its journey
    t: np.ndarray  # for every row, seconds into its match
    u: np.ndarray  # for every row, 0 to 1 across the map, west to east
    v: np.ndarray  # for every row, 0 to 1 up the map, south to north
    kind: np.ndarray  # for every row, an index into KINDS
    human: np.ndarray  # for every journey, whether it is a human's
    identified: np.ndarray  # for every journey, whether it is a human's with an account id

    @property
    def name(self) -> str:
        return str(self.entry["name"])

    @property
    def cell(self) -> np.ndarray:
        """For every row, the number of its cell."""
        return cell_of(self.u, self.v, self.cells)


def cell_of(u: np.ndarray, v: np.ndarray, cells: int) -> np.ndarray:
    """The number of the cell of each place: cells count from the west, rows of cells from the south."""
    across = np.minimum((u * cells).astype(int), cells - 1)
    up = np.minimum((v * cells).astype(int), cells - 1)
    return up * cells + across


def map_data(entry: dict[str, Any], journeys: list[dict[str, Any]], kind_of: dict[int, int], steps: int) -> MapData:
    """A map's journeys as arrays. ``kind_of`` says the kind of every event code, ``steps`` is the manifest's ``uv_steps``."""
    rows = [len(journey["t"]) for journey in journeys]

    def column(name: str) -> np.ndarray:
        return np.concatenate([np.asarray(journey[name], dtype=float) for journey in journeys])

    return MapData(
        entry=entry,
        cells=round(entry["scale"] / CELL_UNITS),
        journeys=journeys,
        start=np.concatenate([[0], np.cumsum(rows)]).astype(int),
        owner=np.repeat(np.arange(len(journeys)), rows),
        t=column("t"),
        u=column("u") / steps,
        v=column("v") / steps,
        kind=np.array([kind_of[code] for journey in journeys for code in journey["e"]]),
        human=np.array([journey["actor"] == "human" for journey in journeys]),
        identified=np.array([journey["actor"] == "human" and not journey["anonymous"] for journey in journeys]),
    )


def load(data_dir: Path = DATA) -> tuple[dict[str, Any], list[MapData]]:
    """The manifest and, for every map, its journeys."""
    manifest = json.loads((data_dir / "manifest.json").read_text())
    kind_of = {code: index for index, name in enumerate(KINDS) for code in manifest["event_groups"][name]}
    steps = manifest["encoding"]["uv_steps"]
    bundles = [json.loads((data_dir / entry["journeys_file"]).read_text())["journeys"] for entry in manifest["maps"]]
    return manifest, [map_data(entry, journeys, kind_of, steps) for entry, journeys in zip(manifest["maps"], bundles)]


def pct(part: float, whole: float) -> float:
    """A share in percent, to one decimal. Nothing of nothing is 0."""
    return round(100 * float(part) / float(whole), 1) if whole else 0.0


def counts(data: MapData, rows: np.ndarray) -> np.ndarray:
    """For every cell, how many of the chosen rows lie in it."""
    return np.bincount(data.cell[rows], minlength=data.cells * data.cells)


def cells_for_half(per_cell: np.ndarray) -> int:
    """The smallest number of cells that together hold at least half of what was counted."""
    ordered = np.sort(per_cell)[::-1]
    if ordered.sum() == 0:
        return 0
    return int(np.searchsorted(np.cumsum(ordered), ordered.sum() / 2) + 1)


def near(per_cell: np.ndarray, cells: int) -> np.ndarray:
    """For every cell, the sum over the cell itself and the eight cells around it."""
    grid = np.pad(per_cell.reshape(cells, cells), 1)
    around = [grid[1 + up : 1 + up + cells, 1 + across : 1 + across + cells] for up in (-1, 0, 1) for across in (-1, 0, 1)]
    return np.sum(around, axis=0).ravel()


def crossed(data: MapData, chosen: np.ndarray) -> np.ndarray:
    """For every cell, how many of the chosen journeys cross it.

    A path is followed from row to row in steps of half a cell, so that a cell between two
    recorded positions is not missed. A path ends at its death row.
    """
    per_cell = np.zeros(data.cells * data.cells, dtype=int)
    for index in np.flatnonzero(chosen):
        rows = slice(data.start[index], data.start[index + 1])
        u, v, kind = data.u[rows], data.v[rows], data.kind[rows]
        dead = np.flatnonzero((kind == DEATH) | (kind == STORM))
        if len(dead):
            u, v = u[: dead[0] + 1], v[: dead[0] + 1]
        du, dv = np.diff(u), np.diff(v)
        pieces = np.maximum(1, np.ceil(np.hypot(du, dv) * data.entry["scale"] / (CELL_UNITS / 2))).astype(int)
        leg = np.repeat(np.arange(len(du)), pieces)
        share = np.concatenate([np.arange(count) / count for count in pieces]) if len(pieces) else np.zeros(0)
        along_u, along_v = np.append(u[leg] + du[leg] * share, u[-1]), np.append(v[leg] + dv[leg] * share, v[-1])
        per_cell[np.unique(cell_of(along_u, along_v, data.cells))] += 1
    return per_cell


def on_artwork(data: MapData) -> np.ndarray:
    """For every cell, whether its middle lies on the artwork of the minimap: the most that could be walked on."""
    box = data.entry["minimap"]["artwork"]
    middle = (np.arange(data.cells) + 0.5) / data.cells
    across = (middle >= box["left"]) & (middle <= box["right"])
    up = (1 - middle >= box["top"]) & (1 - middle <= box["bottom"])
    return (up[:, None] & across[None, :]).ravel()


def quadrant(data: MapData, u: np.ndarray, v: np.ndarray) -> np.ndarray:
    """For every place its quarter of the map's artwork: "NW", "NE", "SW" or "SE"."""
    box = data.entry["minimap"]["artwork"]
    north = (1 - v) < (box["top"] + box["bottom"]) / 2
    east = u > (box["left"] + box["right"]) / 2
    return np.char.add(np.where(north, "N", "S"), np.where(east, "E", "W"))


def place(data: MapData, cell: int) -> dict[str, int]:
    """The middle of a cell in world units, as whole x and z."""
    up, across = divmod(int(cell), data.cells)
    side = data.entry["scale"] / data.cells
    return {"x": round(data.entry["origin_x"] + (across + 0.5) * side), "z": round(data.entry["origin_z"] + (up + 0.5) * side)}


def link(data: MapData, query: str, cell: int | None = None, zoom: int = 4) -> str:
    """The address of a view of the tool on this map; with a cell, the view is centred on it and zoomed in."""
    parts = [f"map={data.entry['id']}", query]
    if cell is not None:
        up, across = divmod(int(cell), data.cells)
        image = data.entry["minimap"]
        x, y = (across + 0.5) / data.cells * image["width"], (1 - (up + 0.5) / data.cells) * image["height"]
        parts.append(f"view={x:.0f},{y:.0f},{zoom}")
    return SITE + "?" + "&".join(part for part in parts if part)


def fullest(data: MapData, per_cell: np.ndarray, noun: str, query: str) -> dict[str, Any]:
    """The cell that holds the most, with its place and a link to it."""
    top = int(per_cell.argmax())
    return {noun: int(per_cell[top]), **place(data, top), "link": link(data, query, top)}


def death_seconds(data: MapData) -> np.ndarray:
    """For every journey, the second of its death; nan when it has none. No journey has two death rows."""
    seconds = np.full(len(data.journeys), np.nan)
    rows = np.flatnonzero((data.kind == DEATH) | (data.kind == STORM))
    seconds[data.owner[rows]] = data.t[rows]
    return seconds


def fates(data: MapData, manifest: dict[str, Any]) -> dict[str, Any]:
    """A. How the journeys of humans with an account id ended."""
    ended = [journey["fate"] for journey, known in zip(data.journeys, data.identified) if known]
    out: dict[str, Any] = {"journeys": len(ended)}
    for fate in manifest["fates"]:
        out[fate] = ended.count(fate)
        out[f"{fate}_pct"] = pct(ended.count(fate), len(ended))
    return out


def storm(data: MapData, earliest: int) -> dict[str, Any]:
    """B. Deaths in the storm: how many, when, in which quarter of the map, and how long after the last loot."""
    rows = np.flatnonzero((data.kind == STORM) & data.identified[data.owner])
    last_second = data.t[data.start[1:] - 1]
    lasting = int((data.identified & (last_second >= earliest)).sum())
    since_loot = []
    for row in rows:
        own = slice(data.start[data.owner[row]], row)
        loot = data.t[own][data.kind[own] == LOOT]
        if len(loot):
            since_loot.append(data.t[row] - loot[-1])
    moving = (data.kind == MOVEMENT) & data.human[data.owner]
    where, traffic = quadrant(data, data.u[rows], data.v[rows]), quadrant(data, data.u[moving], data.v[moving])
    out: dict[str, Any] = {
        "storm_deaths": len(rows),
        "pct_of_identified_journeys": pct(len(rows), data.identified.sum()),
        "identified_journeys_still_recorded_at_the_earliest_storm_death": lasting,
        "pct_of_those_that_die_in_the_storm": pct(len(rows), lasting),
    }
    if len(rows):
        seconds = data.t[rows]
        out |= {"first_second": int(seconds.min()), "median_second": float(np.median(seconds)), "last_second": int(seconds.max())}
        out["median_seconds_since_the_victims_last_loot"] = float(np.median(since_loot)) if since_loot else None
        out["by_quarter"] = {name: int((where == name).sum()) for name in ("NW", "NE", "SW", "SE")}
    out["human_movement_by_quarter_pct"] = {name: pct((traffic == name).sum(), len(traffic)) for name in ("NW", "NE", "SW", "SE")}
    out["link"] = link(data, "fate=killed_by_storm")
    return out


def kill_zones(data: MapData, humans_cross: np.ndarray) -> dict[str, Any]:
    """C. Where humans kill, and in how few cells."""
    kills = data.kind == KILL
    by_humans = counts(data, kills & data.human[data.owner])
    half = cells_for_half(by_humans)
    walked = int((humans_cross > 0).sum())
    return {
        "kills_by_humans": int(by_humans.sum()),
        "kills_by_bots": int((kills & ~data.human[data.owner]).sum()),
        "matches_with_a_kill": len({data.journeys[index]["match"] for index in np.unique(data.owner[kills])}),
        "cells_humans_cross": walked,
        "cells_with_a_kill_by_a_human": int((by_humans > 0).sum()),
        "cells_that_hold_half_of_those_kills": half,
        "which_is_pct_of_the_cells_humans_cross": pct(half, walked),
        "fullest_cell": fullest(data, by_humans, "kills_by_humans", "heat=kill"),
        "fullest_cell_counting_all_kills_as_the_tools_legend_does": int(counts(data, kills).max()),
    }


def ranks(values: np.ndarray) -> np.ndarray:
    """The rank of every value, equal values sharing the mean of their ranks."""
    order = np.empty(len(values))
    order[values.argsort(kind="stable")] = np.arange(len(values))
    _, group, size = np.unique(values, return_inverse=True, return_counts=True)
    return (np.bincount(group, weights=order) / size)[group]


def loot_and_kills(data: MapData, humans_cross: np.ndarray) -> dict[str, Any]:
    """D. Whether humans kill where they loot."""
    by_humans = data.human[data.owner]
    loot, kills = counts(data, (data.kind == LOOT) & by_humans), counts(data, (data.kind == KILL) & by_humans)
    walked = humans_cross > 0
    loot_near, kills_near = near(loot, data.cells) > 0, near(kills, data.cells) > 0
    together = round(float(np.corrcoef(ranks(loot[walked]), ranks(kills[walked]))[0, 1]), 2)
    return {
        "loot_events_of_humans": int(loot.sum()),
        "kills_by_humans": int(kills.sum()),
        "pct_of_kills_within_one_cell_of_loot": pct(kills[loot_near].sum(), kills.sum()),
        "pct_of_the_cells_humans_cross_that_are_within_one_cell_of_loot": pct((loot_near & walked).sum(), walked.sum()),
        "pct_of_loot_within_one_cell_of_a_kill": pct(loot[kills_near].sum(), loot.sum()),
        "pct_of_the_cells_humans_cross_that_are_within_one_cell_of_a_kill": pct((kills_near & walked).sum(), walked.sum()),
        "rank_correlation_of_loot_and_kills_over_the_cells_humans_cross": together,
        "fullest_loot_cell": fullest(data, loot, "loot_events", "heat=loot"),
    }


def unused(data: MapData, all_cross: np.ndarray) -> dict[str, Any]:
    """E. How much of the map's artwork no journey crosses. The artwork includes roofs, rocks and water, so this is an upper limit."""
    art = on_artwork(data)
    used = np.sort(all_cross[all_cross > 0])[::-1]
    tenth = -(-len(used) // 10)
    return {
        "journeys": len(data.journeys),
        "cells_on_the_artwork": int(art.sum()),
        "cells_no_journey_crosses": int(((all_cross == 0) & art).sum()),
        "pct_no_journey_crosses": pct(((all_cross == 0) & art).sum(), art.sum()),
        "pct_crossed_by_one_or_two_journeys": pct(((all_cross > 0) & (all_cross <= 2) & art).sum(), art.sum()),
        "cells_crossed_outside_the_artwork": int(((all_cross > 0) & ~art).sum()),
        "pct_of_all_crossings_in_the_busiest_tenth_of_the_crossed_cells": pct(used[:tenth].sum(), used.sum()),
        "busiest_cell": fullest(data, all_cross, "journeys_crossing", "heat=movement"),
        "link": link(data, "heat=movement"),
    }


def bots_and_humans(data: MapData, humans_cross: np.ndarray, bots_cross: np.ndarray) -> dict[str, Any]:
    """F. Where bots go compared with humans, and how many kills come from matches without a bot's journey."""
    bots = ~data.human
    bot_matches = {journey["match"] for journey, bot in zip(data.journeys, bots) if bot}
    human_kills = np.flatnonzero((data.kind == KILL) & data.human[data.owner])
    without = sum(data.journeys[index]["match"] not in bot_matches for index in data.owner[human_kills])
    both = int(((humans_cross > 0) & (bots_cross > 0)).sum())
    return {
        "journeys_of_bots": int(bots.sum()),
        "matches_with_a_bots_journey": len(bot_matches),
        "matches_on_the_map": data.entry["matches"],
        "cells_humans_cross": int((humans_cross > 0).sum()),
        "cells_bots_cross": int((bots_cross > 0).sum()),
        "pct_of_the_cells_bots_cross_that_humans_cross_too": pct(both, (bots_cross > 0).sum()),
        "pct_of_the_cells_humans_cross_that_bots_cross_too": pct(both, (humans_cross > 0).sum()),
        "kills_by_humans": len(human_kills),
        "pct_of_them_in_matches_without_a_bots_journey": pct(without, len(human_kills)),
    }


def early_deaths(data: MapData) -> dict[str, Any]:
    """G. When humans with an account id die, and where the deaths of the first two minutes are."""
    seconds = death_seconds(data)[data.identified]
    died = seconds[~np.isnan(seconds)]
    rows = ((data.kind == DEATH) | (data.kind == STORM)) & data.identified[data.owner] & (data.t <= EARLY_SECONDS)
    early = counts(data, rows)
    out: dict[str, Any] = {
        "deaths": len(died),
        "median_second_of_death": float(np.median(died)) if len(died) else None,
        "deaths_in_the_first_minute": int((died <= 60).sum()),
        "deaths_in_the_first_two_minutes": int((died <= EARLY_SECONDS).sum()),
        "pct_of_deaths_in_the_first_two_minutes": pct((died <= EARLY_SECONDS).sum(), len(died)),
        "pct_of_deaths_after_ten_minutes": pct((died > 600).sum(), len(died)),
        "cells_with_an_early_death": int((early > 0).sum()),
    }
    if early.sum():
        out["cell_with_the_most_early_deaths"] = fullest(data, early, "early_deaths", "heat=death")
    return out


def by_fate(manifest: dict[str, Any], maps: list[MapData]) -> dict[str, Any]:
    """H. What the journeys of humans with an account id did before they ended one way or another, over all maps."""
    rows: dict[str, list[tuple[int, int, float]]] = {fate: [] for fate in manifest["fates"]}
    for data in maps:
        loot = np.bincount(data.owner[data.kind == LOOT], minlength=len(data.journeys))
        kills = np.bincount(data.owner[data.kind == KILL], minlength=len(data.journeys))
        recorded = data.t[data.start[1:] - 1] - data.t[data.start[:-1]]
        for index in np.flatnonzero(data.identified):
            rows[data.journeys[index]["fate"]].append((int(loot[index]), int(kills[index]), float(recorded[index])))
    out: dict[str, Any] = {}
    for fate, journeys in rows.items():
        if journeys:
            loot_of, kills_of, seconds_of = (np.array(column) for column in zip(*journeys))
            out[fate] = {
                "journeys": len(journeys),
                "median_loot_events": float(np.median(loot_of)),
                "pct_without_any_loot": pct((loot_of == 0).sum(), len(journeys)),
                "median_kills": float(np.median(kills_of)),
                "pct_without_any_kill": pct((kills_of == 0).sum(), len(journeys)),
                "median_seconds_recorded": float(np.median(seconds_of)),
            }
    return out


TITLES = {
    "A": "A. How the journeys of humans with an account id ended, by map",
    "B": "B. Deaths in the storm",
    "C": "C. Where humans kill (every kill left in the data is a kill of a bot)",
    "D": "D. Kills and loot",
    "E": "E. Cells that no journey crosses",
    "F": "F. Bots and humans",
    "G": "G. Early deaths of humans with an account id",
    "H": "H. Loot, kills and time by fate (humans with an account id, all maps)",
}


def findings(manifest: dict[str, Any], maps: list[MapData]) -> dict[str, dict[str, Any]]:
    """Every number, by candidate finding and map."""
    earliest = int(min(data.t[data.kind == STORM].min() for data in maps if (data.kind == STORM).any()))
    out: dict[str, dict[str, Any]] = {title: {} for title in TITLES.values()}
    for data in maps:
        humans_cross, bots_cross = crossed(data, data.human), crossed(data, ~data.human)
        out[TITLES["A"]][data.name] = fates(data, manifest)
        out[TITLES["B"]][data.name] = storm(data, earliest)
        out[TITLES["C"]][data.name] = kill_zones(data, humans_cross)
        out[TITLES["D"]][data.name] = loot_and_kills(data, humans_cross)
        out[TITLES["E"]][data.name] = unused(data, crossed(data, np.ones(len(data.journeys), dtype=bool)))
        out[TITLES["F"]][data.name] = bots_and_humans(data, humans_cross, bots_cross)
        out[TITLES["G"]][data.name] = early_deaths(data)
    out[TITLES["H"]] = by_fate(manifest, maps)
    return out


def lines(value: dict[str, Any], indent: int = 0) -> Iterator[str]:
    """A nested dict as indented lines of text."""
    for key, item in value.items():
        if isinstance(item, dict):
            yield f"{'  ' * indent}{key}"
            yield from lines(item, indent + 1)
        else:
            yield f"{'  ' * indent}{key}: {item}"


def main() -> None:
    manifest, maps = load()
    for title, numbers in findings(manifest, maps).items():
        print(f"\n{title}")
        print("\n".join(lines(numbers, 1)))


if __name__ == "__main__":
    main()
