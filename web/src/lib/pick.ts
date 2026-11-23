/**
 * What lies under the pointer. Pure. Everything is measured in image pixels: the caller turns the
 * pointer into an image point and divides its reach in screen pixels by the scale of the view, so
 * the reach means the same on screen at every zoom.
 */
import type { DrawList } from "./drawList.ts";
import type { Point } from "./projection.ts";

/**
 * The index of the nearest marker within `reach` of a point, or null. Of two equally near, the later
 * one in the draw list wins: it is drawn on top. At a moment of playback only a marker whose first
 * event has happened by `until` is there to be found.
 */
export function pickMarker(at: Point, reach: number, list: DrawList, until = Infinity): number | null {
  let best: number | null = null;
  let nearest = reach * reach;
  for (const [index, marker] of list.markers.entries()) {
    if (marker.times[0] > until) continue;
    const drawn = list.journeys[marker.journey];
    const dx = drawn.x[marker.row] - at.x;
    const dy = drawn.y[marker.row] - at.y;
    const squared = dx * dx + dy * dy;
    if (squared <= nearest) {
      best = index;
      nearest = squared;
    }
  }
  return best;
}

export interface PickedRow {
  /** The index of the journey in the draw list's `journeys`. */
  journey: number;
  row: number;
}

/**
 * The nearest path within `reach` of a point, or null: its journey, and the row at the nearer end
 * of the nearest stretch of the path, since only a row has a time and a place of its own. At a
 * moment of playback `rows` says for every journey how many rows of its path are drawn: none for a
 * journey that is not on the map yet.
 */
export function pickPath(at: Point, reach: number, list: DrawList, rows?: readonly number[]): PickedRow | null {
  let best: PickedRow | null = null;
  let nearest = reach * reach;
  for (const [index, { x, y, pathLength }] of list.journeys.entries()) {
    const drawn = rows ? Math.min(rows[index], pathLength) : pathLength;
    if (drawn === 0) continue;
    const last = drawn - 1; // rows after it are not part of the line: kills recorded after a death, and what has not happened yet
    for (let row = 0; row < Math.max(last, 1); row += 1) {
      const next = Math.min(row + 1, last); // a path of one row is a point
      const alongX = x[next] - x[row];
      const alongY = y[next] - y[row];
      const length = alongX * alongX + alongY * alongY;
      const share = length === 0 ? 0 : Math.min(Math.max(((at.x - x[row]) * alongX + (at.y - y[row]) * alongY) / length, 0), 1);
      const dx = x[row] + share * alongX - at.x;
      const dy = y[row] + share * alongY - at.y;
      const squared = dx * dx + dy * dy;
      if (squared <= nearest) {
        best = { journey: index, row: share < 0.5 ? row : next };
        nearest = squared;
      }
    }
  }
  return best;
}
