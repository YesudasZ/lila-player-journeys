import { describe, expect, it } from "vitest";

import { mapOf } from "../testing/committed.ts";
import fixture from "./__fixtures__/projection.json";
import { artworkInPixels, type MapEntry } from "./manifest.ts";
import { uvToPixel } from "./projection.ts";
import { unitsPerPixel, wholeUnits, worldUnder } from "./readout.ts";
import { fitView, imageToScreen, type Stage, type View } from "./view.ts";

const VIEWPORT = { width: 1440, height: 742 };
const stageOf = (map: MapEntry): Stage => ({ viewport: VIEWPORT, artwork: artworkInPixels(map.minimap) });
const imageOf = (map: MapEntry) => ({ width: map.minimap.width, height: map.minimap.height });
const fitted = (map: MapEntry): View => fitView(artworkInPixels(map.minimap));

describe("the world position under the pointer", () => {
  const views: [string, (map: MapEntry) => View][] = [
    ["fitted", fitted],
    ["zoomed in and moved", (map) => ({ x: map.minimap.width * 0.4, y: map.minimap.height * 0.55, zoom: 3.5 })],
  ];

  // The pipeline's reference points: where a point is drawn, the read-out has to show the point's own world position.
  describe.each(views)("on a %s map", (_, viewOf) => {
    it.each(fixture.points)("$name", (point) => {
      const map = mapOf(point.map);
      const [stage, image, view] = [stageOf(map), imageOf(map), viewOf(map)];
      const drawnAt = imageToScreen(uvToPixel(point.u, point.v, image), view, stage);
      const world = worldUnder(drawnAt, view, stage, image, map);
      expect(world?.x).toBeCloseTo(point.x, 6);
      expect(world?.z).toBeCloseTo(point.z, 6);
    });
  });

  describe("on Ambrose Valley, by hand from its scale of 900 and its origin at −370, −473", () => {
    const map = mapOf("AmbroseValley");
    const [stage, image, view] = [stageOf(map), imageOf(map), fitted(map)];
    /** The read-out for the pointer over a point of the image, given as fractions from its left and top edges. */
    const over = (across: number, down: number) =>
      worldUnder(imageToScreen({ x: across * image.width, y: down * image.height }, view, stage), view, stage, image, map);

    it.each([
      [0.5, 0.5, 80, -23],
      [0.25, 0.25, -145, 202], // a quarter in from the left, a quarter down from the top: z grows upward
      [0.75, 0.25, 305, 202],
      [0.25, 0.75, -145, -248],
    ])("the point %s across and %s down is at x %s, z %s", (across, down, x, z) => {
      const world = over(across, down);
      expect(world?.x).toBeCloseTo(x, 6);
      expect(world?.z).toBeCloseTo(z, 6);
    });

    it("is nothing beyond any edge of the image, and something just inside each", () => {
      const pixel = 1 / image.width;
      for (const [across, down] of [[-pixel, 0.5], [1 + pixel, 0.5], [0.5, -pixel], [0.5, 1 + pixel]] as const) {
        expect(over(across, down)).toBeNull();
      }
      for (const [across, down] of [[pixel, 0.5], [1 - pixel, 0.5], [0.5, pixel], [0.5, 1 - pixel]] as const) {
        expect(over(across, down)).not.toBeNull();
      }
    });
  });
});

describe("world units per pixel", () => {
  it.each([
    ["AmbroseValley", 1.183],
    ["GrandRift", 0.574],
    ["Lockdown", 1.239],
  ])("of %s fitted to a 1440 x 742 viewport is %s", (id, expected) => {
    const map = mapOf(id);
    expect(unitsPerPixel(fitted(map), stageOf(map), imageOf(map), map)).toBeCloseTo(expected, 3);
  });

  it("halves when the zoom doubles", () => {
    const map = mapOf("Lockdown");
    const [stage, image] = [stageOf(map), imageOf(map)];
    const closer = { ...fitted(map), zoom: 2 };
    expect(unitsPerPixel(closer, stage, image, map)).toBeCloseTo(unitsPerPixel(fitted(map), stage, image, map) / 2, 12);
  });
});

describe("a coordinate as text", () => {
  it.each([
    [123.4, "123"],
    [1234.5, "1235"],
    [-56.6, "−57"],
    [-0.51, "−1"],
    [-0.3, "0"], // never "−0"
    [0.49, "0"],
  ])("%s reads %s", (value, text) => {
    expect(wholeUnits(value)).toBe(text);
  });
});
