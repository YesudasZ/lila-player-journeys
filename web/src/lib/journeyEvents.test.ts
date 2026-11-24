import { describe, expect, it } from "vitest";

import { journeysOf, manifest, mapOf } from "../testing/committed.ts";
import { buildDrawList, eventKinds, shownLayers, type Shown } from "./drawList.ts";
import { eventLines, placeOf, timeSpan } from "./journeyEvents.ts";

// The expected lines were worked out from the data files with a separate script, not with this code.
const ambrose = mapOf("AmbroseValley");
const grid = { steps: manifest.encoding.uv_steps, image: { width: ambrose.minimap.width, height: ambrose.minimap.height } };
const listOf = (match: string, hidden: Partial<Shown> = {}) =>
  buildDrawList(journeysOf("AmbroseValley"), match, { ...shownLayers({}, true), ...hidden }, eventKinds(manifest.event_groups), grid);
const lines = (journeyId: string, list = listOf("fbbc5d02")) =>
  eventLines(list, journeyId, ambrose, manifest.encoding).map(({ when, what, where }) => `${when} ${what} @ ${where}`);

describe("the events of a journey as text", () => {
  it("are one line for each of its markers, saying what the tooltip says: when, what and where", () => {
    expect(lines("fbbc5d02-5787de75")).toEqual(["1:58 Death: killed by bot @ x −111 z −41 · elevation 105"]);
    expect(lines("fbbc5d02-bot1432")).toEqual(["2:28 Death: killed @ x −56 z −72 · elevation 108"]);
    expect(lines("fbbc5d02-anon")).toEqual([
      "0:33 Loot @ x −163 z −228 · elevation 110",
      "1:30 Loot @ x −41 z −360 · elevation 127",
      "1:36 Loot @ x −42 z −359 · elevation 127",
      "1:41 Loot @ x −54 z −355 · elevation 127",
      "1:47 Loot @ x −53 z −359 · elevation 127",
      "1:53 to 1:54 Loot × 2 @ x −53 z −357 · elevation 127", // two events at one spot are one marker, and one line
    ]);
  });

  it("are in the order of time, though the draw list holds a journey's loot before its kills", () => {
    const list = listOf("e325a53a");
    const all = eventLines(list, "e325a53a-2c551757", ambrose, manifest.encoding);
    expect(list.markers.map((marker) => marker.kind).join(" ")).toMatch(/^(loot )+(kill ?)+$/); // by kind, as they are drawn
    const runs: [string, number][] = [];
    for (const { kind } of all) {
      const last = runs.at(-1);
      if (last?.[0] === kind) last[1] += 1;
      else runs.push([kind, 1]);
    }
    expect(runs).toEqual([
      ["loot", 17],
      ["kill", 1],
      ["loot", 6],
      ["kill", 2],
      ["loot", 3],
      ["kill", 1],
      ["loot", 3],
    ]);
    expect(all.filter((line) => line.kind === "kill").map((line) => `${line.when} ${line.what}`)).toEqual(["4:58 Kill", "8:31 Kill", "8:37 Kill × 2", "9:01 Kill"]);
    expect(new Set(all.map((line) => line.row)).size).toBe(33); // a row names its line
  });

  it("follow the legend's switches, and are none for a journey that is not drawn", () => {
    expect(lines("fbbc5d02-anon", listOf("fbbc5d02", { loot: false }))).toEqual([]);
    expect(lines("fbbc5d02-anon", listOf("fbbc5d02", { humans: false }))).toEqual([]);
    expect(lines("e325a53a-2c551757", listOf("e325a53a", { loot: false }))).toHaveLength(4);
    expect(lines("nobody")).toEqual([]);
  });

  it("say a time, a stretch of time, and a place in whole world units", () => {
    expect([timeSpan(118, 118), timeSpan(113, 114), timeSpan(0, 0)]).toEqual(["1:58", "1:53 to 1:54", "0:00"]);
    const journey = journeysOf("AmbroseValley").find((each) => each.id === "fbbc5d02-5787de75");
    expect(journey && placeOf(journey, 16, ambrose, manifest.encoding)).toBe("x −111 z −41 · elevation 105");
  });
});
