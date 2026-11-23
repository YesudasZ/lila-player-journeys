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
  /** A filled outline, or strokes: the cross and the ring. */
  filled: boolean;
}

/** A circle as a line through twelve points that returns to its start. */
const RING: readonly number[] = Array.from({ length: 13 }, (_, step) => [Math.cos((step * Math.PI) / 6), Math.sin((step * Math.PI) / 6)]).flat();

export const MARKER_SHAPES: Record<MarkerKind, MarkerShape> = {
  kill: { radius: 5.5, lines: [[0, -1, 0.95, 0.8, -0.95, 0.8]], filled: true }, // triangle
  death: { radius: 4.5, lines: [[-1, -1, 1, 1], [-1, 1, 1, -1]], filled: false }, // cross
  storm_death: { radius: 6, lines: [[0, -1, 0.8, 0, 0, 1, -0.8, 0]], filled: true }, // diamond
  // A small ring, not the small square first planned: in greyscale a square could not be told from a bot's square head.
  loot: { radius: 3.5, lines: [RING], filled: false },
};

/** The strokes that the map's canvas and the legend share, in CSS pixels. */
export const STROKES = {
  /** A journey's line in a single match. */
  line: 2,
  /** A bot's dashes and the gaps between them. */
  botDash: [6, 4],
  /** The dark outline around a marker or a head. */
  outline: 1.5,
  /** The strokes of a shape that is not filled: the cross and the ring. */
  open: 2.25,
} as const;

/** Half the size of a path's head, in CSS pixels: a circle for a human, a square for a bot. */
export const HEAD_RADIUS = 3.5;

/** To a hundredth of a pixel, the same way on both sides of zero, so a shape stays symmetric. */
const round = (value: number): number => (Math.sign(value) * Math.round(Math.abs(value) * 100)) / 100;

/** A shape as the `d` of an SVG path around 0, 0, at its size on screen. */
export function shapePath({ radius, lines, filled }: MarkerShape): string {
  return lines
    .map((line) => {
      let d = "";
      for (let index = 0; index < line.length; index += 2) d += `${index === 0 ? "M" : "L"}${round(line[index] * radius)} ${round(line[index + 1] * radius)}`;
      return filled ? `${d}Z` : d;
    })
    .join("");
}
