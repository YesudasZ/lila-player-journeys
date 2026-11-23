import { describe, expect, it } from "vitest";

import committed from "../../public/data/manifest.json";
import { artworkInPixels, parseManifest } from "./manifest.ts";
import { DataError } from "./reader.ts";

/** The committed manifest as loose data that a test may damage. */
interface Loose {
  encoding: unknown;
  events: unknown[];
  event_groups: Record<string, unknown>;
  maps: { id: unknown; scale: unknown; origin_x: unknown; minimap: { width: unknown; height: unknown; artwork?: unknown } }[];
  days: { partial: unknown }[];
  matches: Record<string, unknown>[];
}
const copy = (): Loose => structuredClone(committed);

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

  it("hands every part on exactly as the file has it: nothing dropped, added or read from another field", () => {
    expect(manifest.encoding).toEqual(committed.encoding);
    expect(manifest.events).toEqual(committed.events);
    expect(manifest.event_groups).toEqual(committed.event_groups);
    expect(manifest.fates).toEqual(committed.fates);
    expect(manifest.maps).toEqual(committed.maps);
    expect(manifest.days).toEqual(committed.days);
    expect(manifest.totals).toEqual(committed.totals);
    expect(manifest.matches).toEqual(committed.matches);
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

  it.each<[string, (manifest: Loose) => void, string]>([
    ["a minimap without an artwork box", ({ maps }) => delete maps[1].minimap.artwork, "manifest.maps[1].minimap.artwork is missing or not an object"],
    ["a count that is text", ({ matches }) => (matches[2].bot_kills = "5"), "manifest.matches[2].bot_kills is missing or not a number"],
    ["a match id that is a number: ids are text even when they look like one", ({ matches }) => (matches[0].id = 3359228), "manifest.matches[0].id is missing or not text"],
    ["an event name that is not text", ({ events }) => (events[3] = 7), "manifest.events[3] is not text"],
    ["an event code that is not whole", ({ event_groups }) => (event_groups.kill = [2.5]), "manifest.event_groups.kill[0] is not a whole number"],
    ["an event code that stands for no event", ({ event_groups }) => (event_groups.loot = [99]), "manifest.event_groups.loot has a code that stands for no event"],
    ["a day that is neither partial nor complete", ({ days }) => (days[4].partial = "yes"), "manifest.days[4].partial is missing or not true or false"],
    ["an origin that is not a finite number", ({ maps }) => (maps[0].origin_x = Number.POSITIVE_INFINITY), "manifest.maps[0].origin_x is missing or not a number"],
    ["a scale of zero", ({ maps }) => (maps[0].scale = 0), "manifest.maps[0].scale is missing or not above zero"],
    ["an image without a width", ({ maps }) => (maps[1].minimap.width = 0), "manifest.maps[1].minimap.width is missing or not above zero"],
    ["an image with a negative height", ({ maps }) => (maps[1].minimap.height = -5), "manifest.maps[1].minimap.height is missing or not above zero"],
    ["two maps with one id", ({ maps }) => (maps[2].id = maps[0].id), "manifest.maps has two maps with one id"],
  ])("is refused: %s", (_, damage, message) => {
    const damaged = copy();
    damage(damaged);
    expect(() => parseManifest(damaged)).toThrow(message);
  });

  it.each([
    ["inside out", { left: 0.9, top: 0.1, right: 0.1, bottom: 0.9 }],
    ["without a height", { left: 0.1, top: 0.5, right: 0.9, bottom: 0.5 }],
    ["wider than the image", { left: 0.1, top: 0.1, right: 1.5, bottom: 0.9 }],
    ["starting before the image", { left: -0.1, top: 0.1, right: 0.9, bottom: 0.9 }],
  ])("is refused: an artwork box %s", (_, artwork) => {
    const damaged = copy();
    damaged.maps[2].minimap.artwork = artwork;
    expect(() => parseManifest(damaged)).toThrow("manifest.maps[2].minimap.artwork is not a box inside the image");
  });

  it("is refused with a DataError, which the app tells apart from a failed download", () => {
    expect(() => parseManifest({ ...copy(), maps: [] })).toThrow(DataError);
    expect(() => parseManifest(null)).toThrow(DataError);
  });
});
