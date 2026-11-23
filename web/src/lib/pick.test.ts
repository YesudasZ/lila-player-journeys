import { describe, expect, it } from "vitest";

import type { DrawList, DrawnJourney, Marker } from "./drawList.ts";
import type { Journey } from "./journeys.ts";
import { pickMarker, pickPath } from "./pick.ts";

/** A drawn journey from its points in image pixels. Picking looks at nothing else. */
function drawn(points: [number, number][], pathLength = points.length): DrawnJourney {
  return { journey: {} as Journey, pathLength, x: Float32Array.from(points.map(([x]) => x)), y: Float32Array.from(points.map(([, y]) => y)) };
}
function listOf(journeys: DrawnJourney[], markers: Marker[] = []): DrawList {
  return { journeys, markers, counts: { humans: 0, bots: 0, kill: 0, death: 0, storm_death: 0, loot: 0 }, matches: 1, single: true };
}
const marker = (journey: number, row: number): Marker => ({ kind: "kill", journey, row, count: 1 });
/** The reach in image pixels of 10 screen pixels at a scale of the view. */
const reachAt = (scale: number) => 10 / scale;

describe("the marker under the pointer", () => {
  const list = listOf([drawn([[100, 100], [112, 100]]), drawn([[112, 100]])], [marker(0, 0), marker(0, 1)]);

  it("is the nearest one within reach", () => {
    expect(pickMarker({ x: 104, y: 100 }, 10, list)).toBe(0);
    expect(pickMarker({ x: 109, y: 103 }, 10, list)).toBe(1);
  });

  it("is none when the nearest is beyond reach", () => {
    expect(pickMarker({ x: 100, y: 111 }, 10, list)).toBeNull();
    expect(pickMarker({ x: 100, y: 110 }, 10, list)).toBe(0); // exactly at reach still counts
  });

  it("is the one drawn later, on top, when two are equally near", () => {
    expect(pickMarker({ x: 106, y: 100 }, 10, list)).toBe(1);
    const stacked = listOf([drawn([[50, 50]]), drawn([[50, 50]])], [marker(0, 0), marker(1, 0)]);
    expect(pickMarker({ x: 50, y: 50 }, 10, stacked)).toBe(1);
  });

  it("reaches 10 screen pixels at every zoom: 15 image pixels away is near when zoomed out, far when zoomed in", () => {
    const at = { x: 100, y: 115 };
    expect(pickMarker(at, reachAt(0.5), list)).toBe(0);
    expect(pickMarker(at, reachAt(1), list)).toBeNull();
    expect(pickMarker(at, reachAt(4), list)).toBeNull();
    expect(pickMarker({ x: 100, y: 102 }, reachAt(4), list)).toBe(0);
  });

  it("is none on a map without markers", () => {
    expect(pickMarker({ x: 0, y: 0 }, 10, listOf([]))).toBeNull();
  });
});

describe("the path under the pointer", () => {
  const corner = drawn([[0, 0], [100, 0], [100, 100]]);

  it("is found between two rows, with the row at the nearer end", () => {
    expect(pickPath({ x: 30, y: 3 }, 6, listOf([corner]))).toEqual({ journey: 0, row: 0 });
    expect(pickPath({ x: 80, y: 3 }, 6, listOf([corner]))).toEqual({ journey: 0, row: 1 });
    expect(pickPath({ x: 97, y: 90 }, 6, listOf([corner]))).toEqual({ journey: 0, row: 2 });
  });

  it("is none beyond reach, also past the end of the line", () => {
    expect(pickPath({ x: 50, y: 7 }, 6, listOf([corner]))).toBeNull();
    expect(pickPath({ x: -7, y: 0 }, 6, listOf([corner]))).toBeNull();
    expect(pickPath({ x: -6, y: 0 }, 6, listOf([corner]))).toEqual({ journey: 0, row: 0 });
  });

  it("ends where the path ends: rows after the death row are not part of the line", () => {
    const died = drawn([[0, 0], [100, 0], [100, 100]], 2);
    expect(pickPath({ x: 100, y: 50 }, 6, listOf([died]))).toBeNull();
    expect(pickPath({ x: 50, y: 0 }, 6, listOf([died]))).toEqual({ journey: 0, row: 1 });
  });

  it("finds a path of a single row as a point", () => {
    expect(pickPath({ x: 203, y: 204 }, 6, listOf([drawn([[200, 200]])]))).toEqual({ journey: 0, row: 0 });
    expect(pickPath({ x: 210, y: 200 }, 6, listOf([drawn([[200, 200]])]))).toBeNull();
  });

  it("is the nearer of two paths", () => {
    const list = listOf([drawn([[0, 0], [100, 0]]), drawn([[0, 8], [100, 8]])]);
    expect(pickPath({ x: 50, y: 3 }, 6, list)?.journey).toBe(0);
    expect(pickPath({ x: 50, y: 5 }, 6, list)?.journey).toBe(1);
  });

  it("does not trip over two rows at the same spot", () => {
    expect(pickPath({ x: 2, y: 2 }, 6, listOf([drawn([[0, 0], [0, 0], [50, 0]])]))?.journey).toBe(0);
  });
});
