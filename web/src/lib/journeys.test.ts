import { describe, expect, it } from "vitest";

import { journeysOf, manifest, mapOf } from "../testing/committed.ts";
import { parseBundle } from "./journeys.ts";
import { DataError } from "./reader.ts";

describe("the committed journeys", () => {
  it.each([
    ["AmbroseValley", 836, 60_631],
    ["GrandRift", 111, 6_835],
    ["Lockdown", 295, 21_151],
  ])("%s has %s journeys and %s rows", (id, journeys, rows) => {
    const read = journeysOf(id);
    expect(read).toHaveLength(journeys);
    expect(read).toHaveLength(mapOf(id).journeys);
    expect(read.reduce((sum, journey) => sum + journey.t.length, 0)).toBe(rows);
  });

  it("add up to the rows of the manifest", () => {
    const rows = manifest.maps.flatMap((map) => journeysOf(map.id)).reduce((sum, journey) => sum + journey.t.length, 0);
    expect(rows).toBe(manifest.totals.rows);
    expect(rows).toBe(88_617);
  });

  it("keeps a journey as the file has it", () => {
    const [first] = journeysOf("AmbroseValley");
    expect(first).toMatchObject({ id: "00c95178-dfe4466b", match: "00c95178", player: "dfe4466b", actor: "human", anonymous: false, fate: "killed_by_bot" });
    expect([...first.t.slice(0, 6)]).toEqual([0, 20, 25, 29, 30, 35]);
    expect([...first.u.slice(0, 6)]).toEqual([14531, 15107, 14556, 14192, 14192, 15792]);
    expect([...first.v.slice(0, 6)]).toEqual([59091, 57794, 56956, 57204, 57204, 57002]);
    expect([...first.y.slice(0, 6)]).toEqual([1523, 1478, 1475, 1475, 1475, 1475]);
    expect([...first.e.slice(0, 6)]).toEqual([0, 0, 0, 7, 0, 0]);
  });

  it("has five columns of one length in every journey", () => {
    for (const map of manifest.maps) {
      for (const journey of journeysOf(map.id)) {
        expect(new Set([journey.t.length, journey.u.length, journey.v.length, journey.y.length, journey.e.length]).size).toBe(1);
      }
    }
  });
});

describe("a bundle that is not what the app was built for", () => {
  type Loose = Record<string, unknown>;
  const journey = (): Loose => ({
    id: "0273e16e-94d042cb",
    match: "0273e16e",
    player: "94d042cb",
    actor: "human",
    anonymous: false,
    fate: "no_death_recorded",
    t: [0, 5],
    u: [1, 2],
    v: [3, 4],
    y: [10, -11],
    e: [0, 7],
  });
  const read = (bundle: unknown) => parseBundle(bundle, mapOf("GrandRift"), manifest);

  it("is read when it is right", () => {
    const [only] = read({ map: "GrandRift", journeys: [journey()] });
    expect(only).toMatchObject({ id: "0273e16e-94d042cb", match: "0273e16e", player: "94d042cb", actor: "human", anonymous: false, fate: "no_death_recorded" });
    expect([...only.t]).toEqual([0, 5]);
    expect([...only.y]).toEqual([10, -11]);
    expect([...only.e]).toEqual([0, 7]);
  });

  it("reads a human without an account id as a player of null", () => {
    const [only] = read({ map: "GrandRift", journeys: [{ ...journey(), player: null, anonymous: true }] });
    expect(only.player).toBeNull();
    expect(only.anonymous).toBe(true);
  });

  it.each<[string, Loose, string]>([
    ["an actor that is neither human nor bot", { actor: "npc" }, "bundle.journeys[0].actor is neither human nor bot"],
    ["a match that the manifest has on another map", { match: "fbbc5d02" }, "bundle.journeys[0].match is not a match of GrandRift in the manifest"],
    ["a fate the manifest does not know", { fate: "vanished" }, "bundle.journeys[0].fate is not one of the manifest's fates"],
    ["columns of unequal length", { u: [1] }, "bundle.journeys[0].u has 1 entries where t has 2"],
    ["an event code that stands for no event", { e: [0, 8] }, "bundle.journeys[0].e[1] is not a whole number from 0 to 7"],
    ["a position beyond the grid", { v: [3, 70_000] }, "bundle.journeys[0].v[1] is not a whole number from 0 to 65535"],
    ["a position that is not whole", { u: [1.5, 2] }, "bundle.journeys[0].u[0] is not a whole number from 0 to 65535"],
    ["time running backwards", { t: [5, 0] }, "bundle.journeys[0].t goes back in time at row 1"],
    ["no rows", { t: [], u: [], v: [], y: [], e: [] }, "bundle.journeys[0].t is empty"],
    ["a column that is missing", { y: undefined }, "bundle.journeys[0].y is missing or not a list"],
    ["a player that is a number", { player: 1432 }, "bundle.journeys[0].player is missing or not text or null"],
    ["a flag that is text", { anonymous: "no" }, "bundle.journeys[0].anonymous is missing or not true or false"],
  ])("is refused: %s", (_, damage, message) => {
    expect(() => read({ map: "GrandRift", journeys: [{ ...journey(), ...damage }] })).toThrow(message);
  });

  it("is refused when it is the bundle of another map", () => {
    expect(() => read({ map: "Lockdown", journeys: [] })).toThrow("bundle.map is not GrandRift");
  });

  it("is refused with a DataError, which the app tells apart from a failed download", () => {
    expect(() => read({ map: "GrandRift" })).toThrow(DataError);
    expect(() => read(null)).toThrow(DataError);
  });
});
