import { describe, expect, it } from "vitest";

import fixture from "./__fixtures__/projection.json";
import { codeToElevation, codeToUnit, pixelToUv, uvToPixel, uvToWorld, worldToUv } from "./projection.ts";

// Reference points written by the pipeline (pipeline/build_data.py) with its own projection code.
const { points, maps, encoding } = fixture;
const frameOf = (mapId: string) => maps[mapId as keyof typeof maps];

describe("projection, against the pipeline's reference points", () => {
  it("has points on every map and on the non-square Grand Rift image", () => {
    expect(points).toHaveLength(13);
    expect(new Set(points.map((point) => point.map))).toEqual(new Set(["AmbroseValley", "GrandRift", "Lockdown"]));
    expect(points.some((point) => point.width === 2048 && point.height === 2046)).toBe(true);
  });

  it.each(points)("$name: the integer codes give the fixture's pixel", (point) => {
    const u = codeToUnit(point.u_code, encoding.uv_steps);
    const v = codeToUnit(point.v_code, encoding.uv_steps);
    const pixel = uvToPixel(u, v, point);
    expect(pixel.x).toBeCloseTo(point.px_from_codes, 5);
    expect(pixel.y).toBeCloseTo(point.py_from_codes, 5);
    // the codes are at most half a grid step from the exact position: far less than half a pixel
    expect(Math.abs(pixel.x - point.px)).toBeLessThan(0.5);
    expect(Math.abs(pixel.y - point.py)).toBeLessThan(0.5);
  });

  it.each(points)("$name: the integer codes give the fixture's world position", (point) => {
    const world = uvToWorld(codeToUnit(point.u_code, encoding.uv_steps), codeToUnit(point.v_code, encoding.uv_steps), frameOf(point.map));
    expect(world.x).toBeCloseTo(point.x_from_codes, 5);
    expect(world.z).toBeCloseTo(point.z_from_codes, 5);
    expect(Math.abs(world.x - point.x)).toBeLessThan(0.01);
    expect(Math.abs(world.z - point.z)).toBeLessThan(0.01);
  });

  it.each(points)("$name: the exact u and v give the exact pixel", (point) => {
    const { u, v } = worldToUv(point.x, point.z, frameOf(point.map));
    expect(u).toBeCloseTo(point.u, 8);
    expect(v).toBeCloseTo(point.v, 8);
    const pixel = uvToPixel(u, v, point);
    expect(pixel.x).toBeCloseTo(point.px, 5);
    expect(pixel.y).toBeCloseTo(point.py, 5);
  });

  it.each(points)("$name: pixel to world and back returns the same pixel and the same world point", (point) => {
    const frame = frameOf(point.map);
    const pixel = { x: point.px, y: point.py };
    const { u, v } = pixelToUv(pixel, point);
    const world = uvToWorld(u, v, frame);
    expect(Math.abs(world.x - point.x)).toBeLessThan(0.01);
    expect(Math.abs(world.z - point.z)).toBeLessThan(0.01);
    const back = worldToUv(world.x, world.z, frame);
    const again = uvToPixel(back.u, back.v, point);
    expect(again.x).toBeCloseTo(pixel.x, 6);
    expect(again.y).toBeCloseTo(pixel.y, 6);
  });

  it("puts the dataset README's worked example on pixel (78, 890) of a 1024 image", () => {
    const example = points.find((point) => point.name === "README worked example");
    expect(example).toBeDefined();
    if (!example) return;
    const { u, v } = worldToUv(-301.45, -355.55, frameOf("AmbroseValley"));
    const pixel = uvToPixel(u, v, { width: 1024, height: 1024 });
    expect([Math.round(pixel.x), Math.round(pixel.y)]).toEqual([78, 890]);
    expect([example.width, example.height]).toEqual([1024, 1024]);
  });

  it("decodes an elevation code to tenths of a world unit", () => {
    const withElevation = points.flatMap((point) => ("y_code" in point && point.y_code !== undefined ? [point] : []));
    expect(withElevation).toHaveLength(12);
    for (const point of withElevation) {
      expect(codeToElevation(point.y_code, encoding.elevation_steps_per_unit)).toBe(point.y_from_code);
      expect(Math.abs(point.y_from_code - point.y)).toBeLessThanOrEqual(0.05);
    }
  });
});

describe("projection, by hand", () => {
  const image = { width: 800, height: 600 };

  it("puts u = 0, v = 0 at the bottom left and u = 1, v = 1 at the top right", () => {
    expect(uvToPixel(0, 0, image)).toEqual({ x: 0, y: 600 });
    expect(uvToPixel(1, 1, image)).toEqual({ x: 800, y: 0 });
    expect(pixelToUv({ x: 400, y: 150 }, image)).toEqual({ u: 0.5, v: 0.75 });
  });

  it("maps the ends of the code grid to the edges of the image", () => {
    expect(codeToUnit(0, 65_535)).toBe(0);
    expect(codeToUnit(65_535, 65_535)).toBe(1);
  });

  it("uses a map's own scale and origin", () => {
    const lockdown = { scale: 1000, origin_x: -500, origin_z: -500 };
    expect(uvToWorld(0.5, 0.5, lockdown)).toEqual({ x: 0, z: 0 });
    expect(uvToWorld(0, 1, lockdown)).toEqual({ x: -500, z: 500 });
    expect(worldToUv(250, -250, lockdown)).toEqual({ u: 0.75, v: 0.25 });
  });
});
