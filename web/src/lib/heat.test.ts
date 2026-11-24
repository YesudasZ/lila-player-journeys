import { describe, expect, it } from "vitest";

import { journeysOf, manifest, mapOf } from "../testing/committed.ts";
import { buildDrawList, eventKinds, shownLayers, type DrawList } from "./drawList.ts";
import { CELL_UNITS, HEAT_GROUPS, HEAT_KINDS, HEAT_LABELS, HEAT_TOKENS, buildHeat, cellOf, cellsAcross, heatEvents, heatSummary, rgbOf, smoothed, strength, type HeatKind } from "./heat.ts";

const MAPS = ["AmbroseValley", "GrandRift", "Lockdown"];
const steps = manifest.encoding.uv_steps;
const listOf = (mapId: string, match: string | null = null, hidden: object = {}): DrawList => {
  const map = mapOf(mapId);
  const grid = { steps, image: { width: map.minimap.width, height: map.minimap.height } };
  return buildDrawList(journeysOf(mapId), match, { ...shownLayers({}, match !== null), ...hidden }, eventKinds(manifest.event_groups), grid);
};
const heatOf = (mapId: string, kind: HeatKind, list = listOf(mapId)) => buildHeat(list, kind, manifest, cellsAcross(mapOf(mapId)), steps);
const sum = (values: ArrayLike<number>) => Array.from(values).reduce((total, value) => total + value, 0);
const codesOf = (kind: HeatKind): number[] => HEAT_GROUPS[kind].flatMap((group) => manifest.event_groups[group]);
/** The rows of a kind, counted straight from the journeys. */
const rowsOf = (mapId: string, kind: HeatKind, wanted: (actor: string) => boolean = () => true) =>
  sum(journeysOf(mapId).filter((journey) => wanted(journey.actor)).map((journey) => journey.e.filter((code) => codesOf(kind).includes(code)).length));

describe("the grid of a heat layer", () => {
  it("has cells of 10 world units: 90, 58 and 100 of them across the three maps", () => {
    expect(CELL_UNITS).toBe(10);
    expect(MAPS.map((id) => cellsAcross(mapOf(id)))).toEqual([90, 58, 100]);
    expect(cellsAcross({ scale: 3 })).toBe(1);
  });

  it("puts the corners of the map into its corner cells, the top row first, also where the image is not square", () => {
    const cells = cellsAcross(mapOf("GrandRift"));
    expect(cellOf(0, steps, cells, steps)).toBe(0); // top left: v grows upward
    expect(cellOf(steps, steps, cells, steps)).toBe(cells - 1);
    expect(cellOf(0, 0, cells, steps)).toBe((cells - 1) * cells);
    expect(cellOf(steps, 0, cells, steps)).toBe(cells * cells - 1);
    expect(cellOf(Math.floor(steps / 2), Math.ceil(steps / 2), cells, steps)).toBe(28 * cells + 28); // just left of and above the middle
    expect(cellOf(Math.ceil(steps / 2), Math.floor(steps / 2), cells, steps)).toBe(29 * cells + 29);
  });
});

describe("counting", () => {
  it("has four kinds, which stand for event groups of the manifest; deaths are those in combat and in the storm", () => {
    expect(HEAT_KINDS).toEqual(["movement", "kill", "death", "loot"]);
    expect(HEAT_GROUPS.death).toEqual(["death", "storm_death"]);
    expect(HEAT_KINDS.flatMap((kind) => [...HEAT_GROUPS[kind]]).sort()).toEqual(Object.keys(manifest.event_groups).sort()); // every group is counted by one kind
  });

  it.each(MAPS.flatMap((map) => HEAT_KINDS.map((kind) => [map, kind] as const)))("%s, %s: before smoothing the grid sums to the rows that fed it", (map, kind) => {
    const heat = heatOf(map, kind);
    expect(heat.total).toBe(rowsOf(map, kind));
    expect(sum(heat.counts)).toBe(heat.total);
    expect(sum(heat.events.map((event) => event.count))).toBe(heat.total);
    expect(heat.most).toBe(Math.max(...heat.counts));
    expect(heat.counts).toHaveLength(heat.cells * heat.cells);
  });

  it("counts, over the three maps, what the manifest counts, event by event", () => {
    const over = (kind: HeatKind) => MAPS.map((map) => heatOf(map, kind));
    const { kills, bot_kills, deaths, bot_deaths, storm_deaths, loot, rows } = manifest.totals;
    const totals = Object.fromEntries(HEAT_KINDS.map((kind) => [kind, sum(over(kind).map((heat) => heat.total))]));
    expect(totals).toEqual({ movement: rows - kills - bot_kills - deaths - bot_deaths - storm_deaths - loot, kill: kills + bot_kills, death: deaths + bot_deaths + storm_deaths, loot });
    expect(totals).toEqual({ movement: 72_643, kill: 2_406, death: 739, loot: 12_829 });
    expect(sum(over("death").map((heat) => heat.storm))).toBe(39);
    expect(sum(over("kill").map((heat) => heat.storm))).toBe(0);
    const byName = (kind: HeatKind) => over(kind).reduce<Record<string, number>>((all, heat) => Object.fromEntries(heat.events.map(({ name, count }) => [name, (all[name] ?? 0) + count])), {});
    expect(byName("movement")).toEqual({ Position: 50_931, BotPosition: 21_712 });
    expect(byName("kill")).toEqual({ Kill: 0, BotKill: 2_406 }); // every kill that is left is a kill of a bot
    expect(byName("death")).toEqual({ Killed: 3, BotKilled: 697, KilledByStorm: 39 });
    expect(byName("loot")).toEqual({ Loot: 12_829 });
  });

  it("says how many matches the rows come from", () => {
    expect(heatOf("AmbroseValley", "movement").matches).toBe(566); // every match has movement
    expect(heatOf("AmbroseValley", "kill").matches).toBeLessThan(566);
    expect(heatOf("Lockdown", "movement").matches).toBe(171);
  });

  it("follows the journeys that are drawn: humans alone, one match alone, whatever markers are hidden", () => {
    const humans = heatOf("AmbroseValley", "movement", listOf("AmbroseValley", null, { bots: false }));
    expect(humans.total).toBe(rowsOf("AmbroseValley", "movement", (actor) => actor === "human"));
    const match = listOf("AmbroseValley", "fbbc5d02");
    const one = heatOf("AmbroseValley", "kill", match);
    expect([one.total, one.matches]).toEqual([match.counts.kill, 1]);
    const deaths = heatOf("AmbroseValley", "death", listOf("AmbroseValley", "5a081fe4")); // this match ends in the storm
    expect([deaths.total, deaths.storm]).toEqual([1, 1]);
    const unmarked = listOf("AmbroseValley", "fbbc5d02", { kill: false });
    expect(heatOf("AmbroseValley", "kill", unmarked).total).toBe(one.total); // the kill markers are hidden, the kills are still counted
    expect(heatOf("AmbroseValley", "loot", listOf("AmbroseValley", null, { humans: false, bots: false })).total).toBe(0);
  });

  it("counts Ambrose Valley with all matches in well under 50 ms", () => {
    const list = listOf("AmbroseValley");
    const times = Array.from({ length: 15 }, () => {
      const started = performance.now();
      heatOf("AmbroseValley", "movement", list);
      return performance.now() - started;
    }).sort((a, b) => a - b);
    expect(times[7]).toBeLessThan(50); // the median; on the development machine it was 1.7 ms
  });
});

describe("smoothing", () => {
  it("spreads a count over its neighbours and keeps the total, also at an edge", () => {
    const middle = new Uint32Array(25);
    middle[12] = 16;
    expect(Array.from(smoothed(middle, 5)).slice(5, 20)).toEqual([0, 1, 2, 1, 0, 0, 2, 4, 2, 0, 0, 1, 2, 1, 0]);
    const corner = new Uint32Array(25);
    corner[0] = 16;
    const spread = smoothed(corner, 5);
    expect([spread[0], spread[1], spread[5], spread[6], sum(spread)]).toEqual([9, 3, 3, 1, 16]);
  });

  it("keeps the total of a real grid, and its largest value is the full strength", () => {
    const heat = heatOf("AmbroseValley", "movement");
    expect(sum(heat.smooth) / heat.total).toBeCloseTo(1, 4);
    expect(heat.top).toBeCloseTo(Math.max(...heat.smooth), 6);
    expect(heat.top).toBeLessThanOrEqual(heat.most);
  });
});

describe("the strength of a cell's colour", () => {
  it("is nothing for an empty cell, full for the fullest, and a square root between", () => {
    expect([strength(0, 100), strength(100, 100), strength(25, 100), strength(1, 100)]).toEqual([0, 1, 0.5, 0.1]);
    expect([strength(5, 0), strength(150, 100), strength(-3, 100)]).toEqual([0, 1, 0]);
  });
});

describe("a token colour as numbers", () => {
  it("reads six hexadecimal digits, in either case and with spaces around", () => {
    expect(rgbOf("#2ec4b6")).toEqual([46, 196, 182]);
    expect(rgbOf(" #D55E00 ")).toEqual([213, 94, 0]);
  });

  it("refuses anything else", () => {
    expect(() => rgbOf("teal")).toThrow("not a colour");
    expect(() => rgbOf("#2ec")).toThrow("not a colour");
  });

  it("has a token and a label for every kind", () => {
    expect(Object.keys(HEAT_TOKENS)).toEqual(HEAT_KINDS);
    expect(HEAT_KINDS.map((kind) => HEAT_LABELS[kind])).toEqual(["Traffic", "Kills", "Deaths", "Loot"]);
  });
});

describe("the legend of a heat layer", () => {
  const some = { total: 12, matches: 3, most: 4, cells: 100, storm: 0 };

  it("gives the rows, the matches, the fullest cell and the cell's size, then what is counted and at whose position", () => {
    const heat = heatOf("AmbroseValley", "movement");
    expect(heatSummary(heat, 900)).toBe(
      `${heat.total.toLocaleString("en-US")} movement samples of 566 matches; the fullest cell holds ${heat.most.toLocaleString("en-US")}. A cell is 10 × 10 units. Each movement sample is counted where the player or bot was. The samples show movement, not time spent.`,
    );
    expect(heatSummary({ ...some, kind: "kill", total: 1, matches: 1, most: 1, cells: 58 }, 581)).toBe(
      "1 kill of 1 match; the fullest cell holds 1. A cell is 10 × 10 units. Kills of players and of bots are counted, each where the killer stood.",
    );
    expect(heatSummary({ ...some, kind: "loot" }, 1000)).toBe("12 loot events of 3 matches; the fullest cell holds 4. A cell is 10 × 10 units. Each loot event is counted where the player stood.");
  });

  it("says how many of the deaths are storm deaths, also when none is", () => {
    expect(heatSummary({ ...some, kind: "death", storm: 2 }, 1000)).toBe(
      "12 deaths of 3 matches, incl. 2 storm deaths; the fullest cell holds 4. A cell is 10 × 10 units. Deaths in combat and in the storm are counted, each where the victim fell.",
    );
    expect(heatSummary({ ...some, kind: "death", storm: 1 }, 1000)).toContain("incl. 1 storm death;");
    expect(heatSummary({ ...some, kind: "death" }, 1000)).toContain("incl. 0 storm deaths;");
  });

  it("says so when there is nothing to count", () => {
    expect(heatSummary({ ...some, kind: "loot", total: 0, matches: 0, most: 0 }, 900)).toBe("The journeys that are drawn have no loot events.");
  });

  it("lists the rows of each event by its name in the data", () => {
    expect(heatEvents(heatOf("AmbroseValley", "death", listOf("AmbroseValley", "5a081fe4")))).toBe("Killed 0 · BotKilled 0 · KilledByStorm 1");
    expect(heatEvents({ events: [{ name: "BotKill", count: 2406 }] })).toBe("BotKill 2,406");
  });
});
