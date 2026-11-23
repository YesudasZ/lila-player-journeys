import { describe, expect, it } from "vitest";

import committed from "../../public/data/manifest.json";
import { artworkInPixels, parseManifest } from "./manifest.ts";

/** A deep copy of the committed manifest that a test may damage. */
const copy = (): Record<string, unknown> => structuredClone(committed);

describe("the committed manifest", () => {
  const manifest = parseManifest(committed);

  it("passes the check and keeps every field the app uses", () => {
    expect(manifest.maps.map((map) => map.id)).toEqual(["AmbroseValley", "GrandRift", "Lockdown"]);
    expect(manifest.maps.map((map) => map.name)).toEqual(["Ambrose Valley", "Grand Rift", "Lockdown"]);
    expect(manifest.encoding).toEqual({ uv_steps: 65_535, elevation_steps_per_unit: 10 });
    expect(manifest.sample_step_seconds).toBe(5);
    expect(manifest.events).toHaveLength(8);
    expect(manifest.event_groups.movement).toEqual([0, 1]);
    expect(manifest.matches).toHaveLength(manifest.totals.matches);
    expect(manifest.days.map((day) => day.id)).toEqual(["February_10", "February_11", "February_12", "February_13", "February_14"]);
  });

  it("drops nothing and adds nothing to a match entry", () => {
    expect(manifest.matches[0]).toEqual(committed.matches[0]);
    expect(manifest.totals).toEqual(committed.totals);
  });

  it("gives the non-square Grand Rift minimap its own width and height", () => {
    expect(manifest.maps[1].minimap).toMatchObject({ file: "minimaps/GrandRift.webp", width: 2048, height: 2046 });
  });

  it("turns the artwork fractions into a box in image pixels", () => {
    const box = artworkInPixels(manifest.maps[1].minimap);
    expect(box.left).toBeCloseTo(0.0767 * 2048, 9);
    expect(box.top).toBeCloseTo(0.1911 * 2046, 9);
    expect(box.right).toBeCloseTo(0.9556 * 2048, 9);
    expect(box.bottom).toBeCloseTo(0.8773 * 2046, 9);
  });
});

describe("a manifest that is not what the app was built for", () => {
  it.each([
    ["not an object at all", () => [1, 2, 3], "manifest is missing or not an object"],
    ["no maps", () => ({ ...copy(), maps: undefined }), "manifest.maps is missing or not a list"],
    ["an empty list of maps", () => ({ ...copy(), maps: [] }), "manifest.maps is empty"],
    ["no encoding", () => ({ ...copy(), encoding: null }), "manifest.encoding is missing or not an object"],
    ["an event group that is not a list", () => ({ ...copy(), event_groups: { movement: 0 } }), "manifest.event_groups.movement is missing or not a list"],
  ])("is refused: %s", (_, damaged, message) => {
    expect(() => parseManifest(damaged())).toThrow(message);
  });

  it("names the map and the field when a minimap has no artwork box", () => {
    const damaged = copy();
    const maps = damaged.maps as { minimap: Record<string, unknown> }[];
    delete maps[1].minimap.artwork;
    expect(() => parseManifest(damaged)).toThrow("manifest.maps[1].minimap.artwork is missing or not an object");
  });

  it("names the match and the field when a count is text", () => {
    const damaged = copy();
    const matches = damaged.matches as Record<string, unknown>[];
    matches[2].bot_kills = "5";
    expect(() => parseManifest(damaged)).toThrow("manifest.matches[2].bot_kills is missing or not a number");
  });

  it("refuses a match id that is a number: ids are text even when they look like one", () => {
    const damaged = copy();
    const matches = damaged.matches as Record<string, unknown>[];
    matches[0].id = 3359228;
    expect(() => parseManifest(damaged)).toThrow("manifest.matches[0].id is missing or not text");
  });
});
