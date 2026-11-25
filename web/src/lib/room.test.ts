import { describe, expect, it } from "vitest";

import { LAND_THRESHOLD, cornerIsClear, landProfile, roomForCorner, type LandProfile } from "./room.ts";
import { NO_INSETS, fitScale, type Box } from "./view.ts";

/** RGBA pixels of a sample whose land pixels are the given [x, y] pairs. */
function pixels(width: number, height: number, land: [number, number][], shade = 200): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y] of land) data.set([shade, shade, shade, 255], (y * width + x) * 4);
  return data;
}

/** A square island that fills its whole box: every row is land from its first pixel. */
const SOLID: LandProfile = { width: 100, height: 100, leftmost: new Float64Array(100).fill(0) };
const IMAGE = { width: 100, height: 100 };
const BOX: Box = { left: 0, top: 0, right: 100, bottom: 100 };

describe("the land of a minimap", () => {
  it("gives each row the x of its leftmost land pixel, and Infinity to a row without land", () => {
    const profile = landProfile(pixels(4, 3, [[2, 0], [0, 2], [3, 2]]), 4, 3);
    expect([...profile.leftmost]).toEqual([2, Infinity, 0]);
    expect([profile.width, profile.height]).toEqual([4, 3]);
  });

  it("counts a pixel as land only when its brightest channel is above the threshold", () => {
    const dark = pixels(2, 1, [[0, 0]], LAND_THRESHOLD);
    dark.set([0, 0, LAND_THRESHOLD + 1, 255], 4); // only blue is bright: still land
    expect([...landProfile(dark, 2, 1).leftmost]).toEqual([1]);
  });
});

describe("room for the legend's corner", () => {
  it("needs none when the fitted map leaves the corner free", () => {
    // 400 x 200: the island is fitted 152 px high and starts 124 px from the left; the corner is 100 x 60
    expect(cornerIsClear(SOLID, IMAGE, BOX, { width: 400, height: 200 }, { width: 100, height: 60 }, NO_INSETS)).toBe(true);
    expect(roomForCorner(SOLID, IMAGE, BOX, { width: 400, height: 200 }, { width: 100, height: 60 })).toEqual(NO_INSETS);
  });

  it("moves the map right as far as needed, without shrinking it, while it has room on its sides", () => {
    // 300 x 200: the island starts 74 px from the left; room L moves it by L/2, so it clears at 52
    const viewport = { width: 300, height: 200 };
    const corner = { width: 100, height: 60 };
    expect(cornerIsClear(SOLID, IMAGE, BOX, viewport, corner, NO_INSETS)).toBe(false);
    const room = roomForCorner(SOLID, IMAGE, BOX, viewport, corner);
    expect(room).toEqual({ left: 52, top: 0, right: 0, bottom: 0 });
    expect(fitScale({ viewport, artwork: BOX, insets: room })).toBeCloseTo(fitScale({ viewport, artwork: BOX }), 12);
    expect(cornerIsClear(SOLID, IMAGE, BOX, viewport, corner, room)).toBe(true);
    expect(cornerIsClear(SOLID, IMAGE, BOX, viewport, corner, { ...room, left: 50 })).toBe(false);
  });

  it("moves the map up instead when that leaves it larger", () => {
    // 200 x 300, a corner 100 x 100: room on the left shrinks the map at once, room at the bottom not before 100 px
    const viewport = { width: 200, height: 300 };
    const corner = { width: 100, height: 100 };
    const room = roomForCorner(SOLID, IMAGE, BOX, viewport, corner);
    expect(room).toEqual({ left: 0, top: 0, right: 0, bottom: 52 });
    expect(cornerIsClear(SOLID, IMAGE, BOX, viewport, corner, room)).toBe(true);
    expect(fitScale({ viewport, artwork: BOX, insets: room })).toBeCloseTo(fitScale({ viewport, artwork: BOX }), 12);
  });

  it("shrinks the map when moving is not enough, and still clears the corner", () => {
    const viewport = { width: 200, height: 200 };
    const corner = { width: 90, height: 90 };
    const room = roomForCorner(SOLID, IMAGE, BOX, viewport, corner);
    expect(room).not.toEqual(NO_INSETS);
    expect(cornerIsClear(SOLID, IMAGE, BOX, viewport, corner, room)).toBe(true);
    expect(fitScale({ viewport, artwork: BOX, insets: room })).toBeLessThan(fitScale({ viewport, artwork: BOX }));
  });

  it("follows the island's shape, not its box: land away from the corner needs no room", () => {
    // land only in the top half of the box: the bottom left corner of the box is sea
    const leftmost = new Float64Array(100).fill(Infinity);
    leftmost.fill(0, 0, 50);
    const island = { width: 100, height: 100, leftmost };
    expect(roomForCorner(island, IMAGE, BOX, { width: 300, height: 200 }, { width: 100, height: 60 })).toEqual(NO_INSETS);
  });

  it("keeps the room it is given for something else, such as a panel over the map's right edge", () => {
    const viewport = { width: 400, height: 200 };
    const corner = { width: 100, height: 60 };
    const base = { ...NO_INSETS, right: 150 };
    const room = roomForCorner(SOLID, IMAGE, BOX, viewport, corner, base);
    expect(room.right).toBe(150);
    expect(room.left + room.bottom).toBeGreaterThan(0); // the panel pushed the island into the corner: it needs room
    expect(cornerIsClear(SOLID, IMAGE, BOX, viewport, corner, room)).toBe(true);
    expect(roomForCorner(SOLID, IMAGE, BOX, { width: 600, height: 200 }, corner, base)).toEqual(base); // clear already
  });

  it("reads a sample of another size than the image", () => {
    // the same solid island sampled at 10 x 10 for an image of 100 x 100 gives the same room
    const coarse = { width: 10, height: 10, leftmost: new Float64Array(10).fill(0) };
    expect(roomForCorner(coarse, IMAGE, BOX, { width: 300, height: 200 }, { width: 100, height: 60 })).toEqual({ left: 52, top: 0, right: 0, bottom: 0 });
    // land that starts 30% of the way in: 30 of 100 sample pixels, or 3 of 10, is the same place in the image
    const fine = { width: 100, height: 100, leftmost: new Float64Array(100).fill(30) };
    const sparse = { width: 10, height: 10, leftmost: new Float64Array(10).fill(3) };
    const viewport = { width: 220, height: 200 };
    const corner = { width: 100, height: 60 };
    expect(roomForCorner(sparse, IMAGE, BOX, viewport, corner)).toEqual(roomForCorner(fine, IMAGE, BOX, viewport, corner));
    expect(roomForCorner(fine, IMAGE, BOX, viewport, corner)).not.toEqual(roomForCorner(SOLID, IMAGE, BOX, viewport, corner));
  });
});
