import { describe, expect, it } from "vitest";

import { manifest } from "../testing/committed.ts";
import { clock, countLabel, counted, dayLabel, fateLabel, whoLabel } from "./labels.ts";
import { findMatches, journeysIn, matchesOfMap } from "./matches.ts";
import { MARKER_KINDS } from "./drawList.ts";
import { MARKER_SHAPES, shapePath } from "./markerShapes.ts";

describe("who a journey belongs to", () => {
  it("is a human with a public id, a human without an account id, or a bot with its number", () => {
    expect(whoLabel({ actor: "human", player: "5e3a91c2" })).toBe("human 5e3a91c2");
    expect(whoLabel({ actor: "human", player: null })).toBe("human (no account id)");
    expect(whoLabel({ actor: "bot", player: "1432" })).toBe("bot 1432");
  });

  it("goes by the actor, never by what the id looks like: a human's public id can be digits only", () => {
    expect(whoLabel({ actor: "human", player: "03359228" })).toBe("human 03359228");
  });
});

describe("a fate in words", () => {
  it("is made from its own text", () => {
    expect(fateLabel("killed_by_bot")).toBe("killed by bot");
    expect(fateLabel("no_death_recorded")).toBe("no death recorded");
  });

  it("reads as words for every fate of the manifest", () => {
    expect(manifest.fates.map(fateLabel)).toEqual(["killed by bot", "killed by player", "killed by storm", "killed", "no death recorded"]);
  });
});

describe("times, days and counts", () => {
  it.each([
    [0, "0:00"],
    [59, "0:59"],
    [155, "2:35"],
    [887, "14:47"],
  ])("%s seconds into a match read %s", (seconds, text) => {
    expect(clock(seconds)).toBe(text);
  });

  it("names a day of the data by its UTC date", () => {
    expect(manifest.days.map((day) => dayLabel(day.date))).toEqual(["10 Feb", "11 Feb", "12 Feb", "13 Feb", "14 Feb"]);
  });

  it("separates thousands and picks the noun", () => {
    expect(countLabel(9902)).toBe("9,902");
    expect(counted(1, "match", "matches")).toBe("1 match");
    expect(counted(566, "match", "matches")).toBe("566 matches");
    expect(counted(0, "journey", "journeys")).toBe("0 journeys");
  });
});

describe("the match list of a map", () => {
  it.each([
    ["AmbroseValley", 566],
    ["GrandRift", 59],
    ["Lockdown", 171],
  ])("%s has %s matches, busiest first", (id, count) => {
    const matches = matchesOfMap(manifest, id);
    expect(matches).toHaveLength(count);
    expect(matches.every((match) => match.map === id)).toBe(true);
    for (let index = 1; index < matches.length; index += 1) {
      const [before, after] = [matches[index - 1], matches[index]];
      const inOrder = journeysIn(before) > journeysIn(after) || (journeysIn(before) === journeysIn(after) && (before.rows > after.rows || (before.rows === after.rows && before.id < after.id)));
      expect(inOrder, `${before.id} before ${after.id}`).toBe(true);
    }
  });

  it("starts Ambrose Valley with a match of 16 journeys and leaves the manifest's own order alone", () => {
    const before = manifest.matches.map((match) => match.id);
    expect(journeysIn(matchesOfMap(manifest, "AmbroseValley")[0])).toBe(16);
    expect(manifest.matches.map((match) => match.id)).toEqual(before);
  });

  it("is narrowed by a typed part of an id, whatever its case and the spaces around it", () => {
    const matches = matchesOfMap(manifest, "AmbroseValley");
    expect(findMatches(matches, " FBBC5D02 ").map((match) => match.id)).toEqual(["fbbc5d02"]);
    const some = findMatches(matches, "a47");
    expect(some.map((match) => match.id)).toContain("a476eb57");
    expect(some.every((match) => match.id.includes("a47"))).toBe(true);
    expect(findMatches(matches, "")).toHaveLength(566);
    expect(findMatches(matches, "no such id")).toEqual([]);
  });
});

describe("the marker shapes", () => {
  it("exist for every kind of marker and stay inside their size", () => {
    for (const kind of MARKER_KINDS) {
      const { radius, lines } = MARKER_SHAPES[kind];
      expect(radius).toBeGreaterThan(0);
      expect(lines.flat().every((value) => Math.abs(value) <= 1)).toBe(true);
      expect(lines.every((line) => line.length >= 4 && line.length % 2 === 0)).toBe(true);
    }
  });

  it("become the path the legend draws", () => {
    expect(shapePath(MARKER_SHAPES.loot)).toBe("M-3 -3L3 -3L3 3L-3 3Z");
    expect(shapePath(MARKER_SHAPES.death)).toBe("M-4.5 -4.5L4.5 4.5M-4.5 4.5L4.5 -4.5"); // two open strokes
  });

  it("differ from each other in outline, not only in colour", () => {
    expect(new Set(MARKER_KINDS.map((kind) => shapePath({ ...MARKER_SHAPES[kind], radius: 1 }))).size).toBe(MARKER_KINDS.length);
  });
});
