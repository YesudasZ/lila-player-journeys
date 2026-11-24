/**
 * Playback: where a journey's head is at a time, and what else a moment of a match shows. Pure.
 *
 * `headAt` is rule 4 of docs/DATA_FORMAT.md (assumption A6). The pipeline has the reference
 * (pipeline/playback.py) and writes a fixture of journeys with the heads it computes; the tests
 * hold this function to every one of them.
 */
import type { DrawList, MarkerKind } from "./drawList.ts";

/** Where a journey's head is: a place, and the last row of the path that it has reached. */
export interface Head {
  x: number;
  y: number;
  row: number;
}

/**
 * The head of a journey at a time, in seconds since the start of its match; null before its first
 * row, when it is not on the map yet. `t`, `x` and `y` are the journey's rows in time order, and
 * the first `pathLength` of them are its path. Between two rows at most `step` seconds apart the
 * head moves in a straight line. Across a longer gap it stays at the earlier row and covers the
 * distance in the last `step` seconds. Of rows in the same second the last one counts. After the
 * last row of the path the head stays where it is.
 */
export function headAt(t: ArrayLike<number>, x: ArrayLike<number>, y: ArrayLike<number>, pathLength: number, time: number, step: number): Head | null {
  if (pathLength === 0 || time < t[0]) return null;
  let row = 0;
  while (row + 1 < pathLength && t[row + 1] <= time) row += 1;
  if (row === pathLength - 1) return { x: x[row], y: y[row], row };
  const leaves = Math.max(t[row], t[row + 1] - step); // across a longer gap it stands still until then
  if (time <= leaves) return { x: x[row], y: y[row], row };
  const share = (time - leaves) / (t[row + 1] - leaves);
  return { x: x[row] + (x[row + 1] - x[row]) * share, y: y[row] + (y[row + 1] - y[row]) * share, row };
}

/** The heads of a draw list's journeys at a time, in its order; null for a journey that is not on the map yet. */
export function headsAt(list: DrawList, time: number, step: number): (Head | null)[] {
  return list.journeys.map((drawn) => headAt(drawn.journey.t, drawn.x, drawn.y, drawn.pathLength, time, step));
}

/** How many of the events at these times, which are in rising order, have happened by a time. */
export function happened(times: ArrayLike<number>, time: number): number {
  let count = 0;
  while (count < times.length && times[count] <= time) count += 1;
  return count;
}

/**
 * What a draw list shows at a moment of playback: the time, where the head of every journey is
 * (null for one that is not on the map yet), and for every marker how many of its events have
 * happened (none: it is not there yet). A path is drawn as far as its head, and that far it can be
 * pointed at.
 */
export interface Moment {
  time: number;
  heads: (Head | null)[];
  counts: number[];
}

/**
 * The moment of a draw list that a clock shows; null when everything is shown: the whole match,
 * which is where the clock rests, or all matches, which have no clock and so no `end`.
 */
export function momentAt(list: DrawList, time: number, end: number | null, step: number): Moment | null {
  if (!list.single || end === null || time >= end) return null;
  return { time, heads: headsAt(list, time, step), counts: list.markers.map((marker) => happened(marker.times, time)) };
}

/** A mark on the time slider: something of a kind happened in this second of the match. */
export interface Tick {
  kind: MarkerKind;
  time: number;
}

/** The events of a draw list as marks for the time slider, in the order they are drawn: one for every kind and second in which something of that kind happened. */
export function ticksOf(list: DrawList): Tick[] {
  const seen = new Set<string>();
  const ticks: Tick[] = [];
  for (const { kind, times } of list.markers) {
    for (const time of times) {
      const key = `${kind} ${time}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ticks.push({ kind, time });
    }
  }
  return ticks;
}

/** The speeds of playback, as multiples of real time, and the one it starts with: a median match of 380 s then plays in 38 s. */
export const SPEEDS = [1, 2, 5, 10, 20, 60] as const;
export const FIRST_SPEED = 10;

/**
 * The longest stretch of real time, in milliseconds, that one frame may count for. A frame that
 * comes late, as the first one after the tab was hidden, then does not make the match jump ahead.
 */
export const LONGEST_FRAME = 100;

/** The time of the match one frame later: `elapsed` milliseconds of real time at a speed, and never past the end. */
export function advance(time: number, elapsed: number, speed: number, end: number): number {
  const counted = Math.min(Math.max(elapsed, 0), LONGEST_FRAME);
  return Math.min(time + (counted / 1000) * speed, end);
}

/** What a key does on the time slider: move the time by some seconds, jump to the start or the end, or play and pause. */
export type SliderKeyAction = { kind: "step"; seconds: number } | { kind: "start" } | { kind: "end" } | { kind: "toggle" };

interface Pressed {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  /** True for the repeats of a key that is held down. */
  repeat?: boolean;
}

/** Seconds that Page Up and Page Down move the time. */
const BIG_STEP = 60;

/**
 * The action of a key press on the time slider, or null when the key is not the slider's. The
 * arrows move one recorded step, `step` seconds, and one second with Shift held. A Space that is
 * held down plays or pauses once, while held arrows go on stepping. With Ctrl, Cmd or Alt held the
 * key belongs to the browser.
 */
export function sliderKeyAction({ key, shiftKey, ctrlKey, metaKey, altKey, repeat }: Pressed, step: number): SliderKeyAction | null {
  if (ctrlKey || metaKey || altKey) return null;
  const small = shiftKey ? 1 : step;
  switch (key) {
    case "ArrowRight":
    case "ArrowUp":
      return { kind: "step", seconds: small };
    case "ArrowLeft":
    case "ArrowDown":
      return { kind: "step", seconds: -small };
    case "PageUp":
      return { kind: "step", seconds: BIG_STEP };
    case "PageDown":
      return { kind: "step", seconds: -BIG_STEP };
    case "Home":
      return { kind: "start" };
    case "End":
      return { kind: "end" };
    case " ":
      return repeat ? null : { kind: "toggle" };
    default:
      return null;
  }
}

/** The time an action of the slider's keys leads to, kept inside the match; null for the action that plays and pauses. */
export function timeAfter(action: SliderKeyAction, time: number, end: number): number | null {
  if (action.kind === "toggle") return null;
  if (action.kind === "start") return 0;
  if (action.kind === "end") return end;
  return Math.min(Math.max(time + action.seconds, 0), end);
}

/** A time the slider was dragged to: a whole second, since events are recorded in whole seconds. */
export function draggedTime(value: number): number {
  return Math.round(value);
}

/** What the slider's keys do, in words, for its title and for assistive technology. The step is the one the keys use. */
export function sliderKeysHelp(step: number): string {
  return `Left and right arrow: ${step} seconds, with Shift 1 second. Page Up and Page Down: ${BIG_STEP} seconds. Home and End: start and end. Space: play or pause.`;
}
