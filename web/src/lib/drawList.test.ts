import { describe, expect, it } from "vitest";

import { journeysOf, manifest, mapOf } from "../testing/committed.ts";
import { buildDrawList, eventKinds, pathLength, shownLayers, type Grid, type MarkerKind, type Shown } from "./drawList.ts";
import type { Journey } from "./journeys.ts";

const KINDS = eventKinds(manifest.event_groups);
const ALL: Shown = { humans: true, bots: true, kill: true, death: true, storm_death: true, loot: true };
const GRID: Grid = { steps: 65_535, image: { width: 2048, height: 2046 } };
/** The code of an event by its name in the manifest, so that no code is written into a test. */
const code = (name: string): number => {
  const found = manifest.events.indexOf(name);
  if (found === -1) throw new Error(`the manifest has no event ${name}`);
  return found;
};
const [MOVE, BOT_MOVE, BOT_KILL, KILLED, BOT_KILLED, STORM, LOOT] = ["Position", "BotPosition", "BotKill", "Killed", "BotKilled", "KilledByStorm", "Loot"].map(code);

/** A journey from its event codes: one row per second, each at its own spot unless `spots` says otherwise. */
function journey(id: string, events: number[], given: Partial<Pick<Journey, "match" | "actor">> & { seconds?: number[]; spots?: number[]; up?: number[] } = {}): Journey {
  const spots = given.spots ?? events.map((_, row) => row * 100);
  return {
    id,
    match: given.match ?? "m1",
    player: given.actor === "bot" ? "1432" : "5e3a91c2",
    actor: given.actor ?? "human",
    anonymous: false,
    fate: "no_death_recorded",
    t: Uint16Array.from(given.seconds ?? events.map((_, row) => row)),
    u: Uint16Array.from(spots),
    v: Uint16Array.from(given.up ?? spots),
    y: Int32Array.from(events.map(() => 0)),
    e: Uint8Array.from(events),
  };
}
const kindsOf = (markers: { kind: MarkerKind; count: number }[]) => markers.map((marker) => `${marker.kind} x${marker.count}`);

describe("the path of a journey", () => {
  it("is every row when no death was recorded", () => {
    expect(pathLength(journey("a", [MOVE, LOOT, MOVE, BOT_KILL, MOVE]), KINDS)).toBe(5);
  });

  it.each([
    ["killed by a player", KILLED],
    ["killed by a bot", BOT_KILLED],
    ["killed by the storm", STORM],
  ])("ends with the death row when %s, whatever was recorded after it", (_, death) => {
    expect(pathLength(journey("a", [MOVE, MOVE, LOOT, death]), KINDS)).toBe(4);
    expect(pathLength(journey("a", [MOVE, MOVE, LOOT, death, BOT_KILL]), KINDS)).toBe(4);
  });

  it("does not go on to a kill recorded after the death", () => {
    expect(pathLength(journey("a", [BOT_MOVE, BOT_MOVE, BOT_KILLED, BOT_KILL, BOT_KILL], { actor: "bot" }), KINDS)).toBe(3);
  });

  it("is one row when the death is the first row", () => {
    expect(pathLength(journey("a", [KILLED]), KINDS)).toBe(1);
  });
});

describe("the draw list", () => {
  it("has a marker for every row that is not movement, also after the death row", () => {
    const list = buildDrawList([journey("a", [BOT_MOVE, LOOT, BOT_KILL, BOT_MOVE, BOT_KILLED, BOT_KILL], { actor: "bot" })], null, ALL, KINDS, GRID);
    expect(list.journeys).toHaveLength(1);
    expect(list.journeys[0].pathLength).toBe(5);
    expect(list.markers.map((marker) => [marker.kind, marker.row])).toEqual([["loot", 1], ["kill", 2], ["death", 4], ["kill", 5]]);
    expect(list.counts).toEqual({ humans: 0, bots: 1, kill: 2, death: 1, storm_death: 0, loot: 1 });
  });

  it("makes one marker with a count of identical events of one journey in the same second at the same spot", () => {
    const repeated = journey("a", [MOVE, LOOT, LOOT, LOOT, LOOT, BOT_KILL], { seconds: [0, 5, 5, 5, 9, 9], spots: [10, 20, 20, 20, 20, 20] });
    const list = buildDrawList([repeated], null, ALL, KINDS, GRID);
    expect(kindsOf(list.markers)).toEqual(["loot x3", "loot x1", "kill x1"]); // a later second and another event stay apart
    expect(list.markers[0].row).toBe(1);
    expect(list.counts.loot).toBe(4); // the legend counts rows, not markers
  });

  it("keeps the same event of two journeys apart", () => {
    const spots = { seconds: [0, 5], spots: [10, 20] };
    const list = buildDrawList([journey("a", [MOVE, LOOT], spots), journey("b", [MOVE, LOOT], spots)], null, ALL, KINDS, GRID);
    expect(kindsOf(list.markers)).toEqual(["loot x1", "loot x1"]);
    expect(list.markers.map((marker) => marker.journey)).toEqual([0, 1]);
  });

  it("holds one match when one is open, and says so", () => {
    const journeys = [journey("a", [MOVE, LOOT], { match: "m1" }), journey("b", [MOVE, BOT_KILL], { match: "m2" }), journey("c", [BOT_MOVE], { match: "m2", actor: "bot" })];
    const one = buildDrawList(journeys, "m2", ALL, KINDS, GRID);
    expect(one.journeys.map((drawn) => drawn.journey.id)).toEqual(["b", "c"]);
    expect([one.matches, one.single]).toEqual([1, true]);
    expect(one.counts).toMatchObject({ humans: 1, bots: 1, kill: 1, loot: 0 });
    const all = buildDrawList(journeys, null, ALL, KINDS, GRID);
    expect([all.journeys.length, all.matches, all.single]).toEqual([3, 2, false]);
  });

  it("puts every row at its place in the image: u to the right, v upward", () => {
    const corners = journey("a", [MOVE, MOVE, MOVE], { spots: [0, 65_535, 13_107], up: [0, 65_535, 52_428] });
    const { x, y } = buildDrawList([corners], null, ALL, KINDS, GRID).journeys[0];
    expect([x[0], y[0]]).toEqual([0, 2046]); // u 0, v 0 is the bottom left
    expect([x[1], y[1]]).toEqual([2048, 0]); // u 1, v 1 is the top right
    expect(x[2]).toBeCloseTo(0.2 * 2048, 3); // a fifth of the way across
    expect(y[2]).toBeCloseTo(0.2 * 2046, 3); // four fifths of the way up, so a fifth down from the top
  });
});

describe("the switches", () => {
  const journeys = [journey("a", [MOVE, LOOT, BOT_KILL, KILLED]), journey("b", [BOT_MOVE, BOT_KILL, BOT_KILLED], { actor: "bot" })];

  it("hide a kind of marker and still say how many it would show", () => {
    const list = buildDrawList(journeys, null, { ...ALL, kill: false }, KINDS, GRID);
    expect(kindsOf(list.markers)).toEqual(["loot x1", "death x1", "death x1"]);
    expect(list.counts.kill).toBe(2);
  });

  it("hide the journeys of an actor with their markers, and still count the journeys", () => {
    const list = buildDrawList(journeys, null, { ...ALL, bots: false }, KINDS, GRID);
    expect(list.journeys.map((drawn) => drawn.journey.id)).toEqual(["a"]);
    expect(list.markers.every((marker) => marker.journey === 0)).toBe(true);
    expect(list.counts).toEqual({ humans: 1, bots: 1, kill: 1, death: 1, storm_death: 0, loot: 1 });
  });

  it("show everything by default, except loot while all matches are open", () => {
    expect(shownLayers({}, false)).toEqual({ ...ALL, loot: false });
    expect(shownLayers({}, true)).toEqual(ALL);
  });

  it("keep a choice made by hand in both views", () => {
    expect(shownLayers({ loot: true }, false).loot).toBe(true);
    expect(shownLayers({ loot: false }, true).loot).toBe(false);
    expect(shownLayers({ bots: false, death: false }, true)).toEqual({ ...ALL, bots: false, death: false });
  });
});

describe("the draw lists of the committed data", () => {
  const gridOf = (id: string): Grid => ({ steps: manifest.encoding.uv_steps, image: { width: mapOf(id).minimap.width, height: mapOf(id).minimap.height } });
  const listOf = (id: string, match: string | null = null) => buildDrawList(journeysOf(id), match, ALL, KINDS, gridOf(id));

  it("show for every one of the 796 matches the markers its manifest entry counts", () => {
    let checked = 0;
    for (const map of manifest.maps) {
      const list = listOf(map.id);
      const shown = new Map<string, Record<MarkerKind, number>>();
      for (const marker of list.markers) {
        const match = list.journeys[marker.journey].journey.match;
        const counts = shown.get(match) ?? { kill: 0, death: 0, storm_death: 0, loot: 0 };
        counts[marker.kind] += marker.count;
        shown.set(match, counts);
      }
      for (const match of manifest.matches.filter((entry) => entry.map === map.id)) {
        expect(shown.get(match.id) ?? { kill: 0, death: 0, storm_death: 0, loot: 0 }, match.id).toEqual({
          kill: match.kills + match.bot_kills,
          death: match.deaths + match.bot_deaths,
          storm_death: match.storm_deaths,
          loot: match.loot,
        });
        checked += 1;
      }
    }
    expect(checked).toBe(796);
  });

  it("count journeys and marker rows per map as the manifest's entries add up", () => {
    const ambrose = listOf("AmbroseValley");
    expect(ambrose.counts).toEqual({ humans: 568, bots: 268, kill: 1789, death: 487, storm_death: 17, loot: 9902 });
    expect([ambrose.matches, ambrose.journeys.length]).toEqual([566, 836]);
    expect(listOf("GrandRift").counts).toEqual({ humans: 59, bots: 52, kill: 192, death: 47, storm_death: 5, loot: 880 });
    expect(listOf("Lockdown").counts).toEqual({ humans: 171, bots: 124, kill: 425, death: 166, storm_death: 17, loot: 2047 });
  });

  it("draw fewer markers than rows where events repeat: Ambrose Valley's 9,902 loot rows are 8,988 markers", () => {
    const markers = listOf("AmbroseValley").markers;
    const of = (kind: MarkerKind) => markers.filter((marker) => marker.kind === kind);
    expect(of("loot")).toHaveLength(8988);
    expect(of("kill")).toHaveLength(1772);
    expect(of("loot").reduce((sum, marker) => sum + marker.count, 0)).toBe(9902);
  });

  it("show fbbc5d02 as 16 journeys, one of them a human without an account id", () => {
    const list = listOf("AmbroseValley", "fbbc5d02");
    expect(list.counts).toEqual({ humans: 2, bots: 14, kill: 5, death: 8, storm_death: 0, loot: 7 });
    expect(list.journeys).toHaveLength(16);
    expect(list.journeys.filter((drawn) => drawn.journey.anonymous)).toHaveLength(1);
    expect([list.matches, list.single]).toEqual([1, true]);
  });

  it("show a476eb57 as one journey whose path is all of its 218 rows", () => {
    const list = listOf("AmbroseValley", "a476eb57");
    expect(list.counts).toEqual({ humans: 1, bots: 0, kill: 10, death: 0, storm_death: 0, loot: 58 });
    expect(list.journeys.map((drawn) => [drawn.pathLength, drawn.journey.t.length])).toEqual([[218, 218]]);
  });

  it("end the path of 5a081fe4 at its storm death", () => {
    const list = listOf("AmbroseValley", "5a081fe4");
    expect(list.counts).toEqual({ humans: 1, bots: 0, kill: 4, death: 0, storm_death: 1, loot: 37 });
    const [{ journey: only, pathLength: length }] = list.journeys;
    expect(only.fate).toBe("killed_by_storm");
    expect(KINDS.kindOf.get(only.e[length - 1])).toBe("storm_death");
    expect(length).toBe(only.t.length);
  });

  it("find no movement after the end of a path anywhere: the 2 rows that follow a death are kills", () => {
    const after: string[] = [];
    for (const map of manifest.maps) {
      for (const { journey: one, pathLength: length } of listOf(map.id).journeys) {
        for (let row = length; row < one.e.length; row += 1) after.push(KINDS.kindOf.get(one.e[row]) ?? "movement");
      }
    }
    expect(after).toEqual(["kill", "kill"]);
  });
});
