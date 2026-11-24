/**
 * What lies under the pointer. Pure. Everything is measured in image pixels: the caller turns the
 * pointer into an image point and divides its reach in screen pixels by the scale of the view, so
 * the reach means the same on screen at every zoom.
 */
import type { DrawList } from "./drawList.ts";
import type { Head } from "./playback.ts";
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

/** How far a point is from the stretch between two points, squared, and how far along that stretch its nearest point lies, from 0 to 1. */
function toStretch(at: Point, fromX: number, fromY: number, toX: number, toY: number): { squared: number; share: number } {
  const alongX = toX - fromX;
  const alongY = toY - fromY;
  const length = alongX * alongX + alongY * alongY;
  const share = length === 0 ? 0 : Math.min(Math.max(((at.x - fromX) * alongX + (at.y - fromY) * alongY) / length, 0), 1);
  const dx = fromX + share * alongX - at.x;
  const dy = fromY + share * alongY - at.y;
  return { squared: dx * dx + dy * dy, share };
}

/**
 * The nearest path within `reach` of a point, or null: its journey, and the row at the nearer end
 * of the nearest stretch of the path, since only a row has a time and a place of its own. At a
 * moment of playback `heads` says where every journey is: a path is there as far as its head, the
 * stretch the head is on included, which answers with the row the head has left. A journey whose
 * head is null is not on the map yet.
 */
export function pickPath(at: Point, reach: number, list: DrawList, heads?: readonly (Head | null)[]): PickedRow | null {
  let best: PickedRow | null = null;
  let nearest = reach * reach;
  for (const [index, { x, y, pathLength }] of list.journeys.entries()) {
    const head = heads?.[index];
    if (head === null) continue;
    const last = head ? head.row : pathLength - 1; // rows after it are not part of the line: kills recorded after a death, and what has not happened yet
    for (let row = 0; row < Math.max(last, 1); row += 1) {
      const next = Math.min(row + 1, last); // a path of one row is a point
      const { squared, share } = toStretch(at, x[row], y[row], x[next], y[next]);
      if (squared <= nearest) {
        best = { journey: index, row: share < 0.5 ? row : next };
        nearest = squared;
      }
    }
    if (!head) continue;
    const { squared } = toStretch(at, x[head.row], y[head.row], head.x, head.y);
    if (squared <= nearest) {
      best = { journey: index, row: head.row };
      nearest = squared;
    }
  }
  return best;
}
