/**
 * The shapes of the markers, in one place: the map's canvas and the legend both draw from these,
 * so the legend cannot drift from the map.
 */
import type { MarkerKind } from "./drawList.ts";

export interface MarkerShape {
  /** Half the marker's size on screen, in CSS pixels, at every zoom. */
  radius: number;
  /** Lines in a box from -1 to 1, each as x, y pairs. */
  lines: readonly (readonly number[])[];
  /** A closed and filled outline, or open strokes: the cross. */
  filled: boolean;
}

export const MARKER_SHAPES: Record<MarkerKind, MarkerShape> = {
  kill: { radius: 5.5, lines: [[0, -1, 0.95, 0.8, -0.95, 0.8]], filled: true }, // triangle
  death: { radius: 4.5, lines: [[-1, -1, 1, 1], [-1, 1, 1, -1]], filled: false }, // cross
  storm_death: { radius: 6, lines: [[0, -1, 0.8, 0, 0, 1, -0.8, 0]], filled: true }, // diamond
  loot: { radius: 3, lines: [[-1, -1, 1, -1, 1, 1, -1, 1]], filled: true }, // small square
};

/** Half the size of a path's head, in CSS pixels: a circle for a human, a square for a bot. */
export const HEAD_RADIUS = 3.5;

/** A shape as the `d` of an SVG path around 0, 0, at its size on screen. */
export function shapePath({ radius, lines, filled }: MarkerShape): string {
  return lines
    .map((line) => {
      let d = "";
      for (let index = 0; index < line.length; index += 2) d += `${index === 0 ? "M" : "L"}${line[index] * radius} ${line[index + 1] * radius}`;
      return filled ? `${d}Z` : d;
    })
    .join("");
}
