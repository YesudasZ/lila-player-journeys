/**
 * The events of one journey as lines of text, for those who do not point at the map: what the
 * tooltips of its markers say, in the order of time. Pure.
 */
import type { DrawList, MarkerKind } from "./drawList.ts";
import type { Journey } from "./journeys.ts";
import { clock, markerTitle } from "./labels.ts";
import type { Manifest } from "./manifest.ts";
import { codeToElevation, codeToUnit, uvToWorld, type WorldFrame } from "./projection.ts";
import { wholeUnits } from "./readout.ts";

/** A time into the match, or the stretch from the first to the last of several events: "1:58", "1:53 to 1:54". */
export function timeSpan(from: number, until: number): string {
  return until > from ? `${clock(from)} to ${clock(until)}` : clock(from);
}

/** Where a row of a journey was recorded, in whole world units: "x −111 z −41 · elevation 105". */
export function placeOf(journey: Journey, row: number, map: WorldFrame, encoding: Manifest["encoding"]): string {
  const world = uvToWorld(codeToUnit(journey.u[row], encoding.uv_steps), codeToUnit(journey.v[row], encoding.uv_steps), map);
  return `x ${wholeUnits(world.x)} z ${wholeUnits(world.z)} · elevation ${wholeUnits(codeToElevation(journey.y[row], encoding.elevation_steps_per_unit))}`;
}

export interface EventLine {
  kind: MarkerKind;
  /** The row of the journey at which the marker is drawn. No two lines of a journey share it. */
  row: number;
  /** "1:58", or "1:53 to 1:54" for a marker that stands for several events. */
  when: string;
  /** "Kill", "Loot × 2", "Death: killed by bot". */
  what: string;
  /** "x −111 z −41 · elevation 105". */
  where: string;
}

/**
 * A line for every marker that is drawn for a journey, in the order of time. A marker stands for
 * the events of one kind that the journey has at one spot, so a line may stand for several events.
 * A journey that is not drawn, or has no marker, has no lines.
 */
export function eventLines(list: DrawList, journeyId: string, map: WorldFrame, encoding: Manifest["encoding"]): EventLine[] {
  const index = list.journeys.findIndex((drawn) => drawn.journey.id === journeyId);
  if (index === -1) return [];
  const { journey } = list.journeys[index];
  return list.markers
    .filter((marker) => marker.journey === index)
    .sort((one, other) => one.row - other.row) // the draw list has them by kind; a journey's rows are in the order of time
    .map(({ kind, row, times, count }) => ({
      kind,
      row,
      when: timeSpan(times[0], times[count - 1]),
      what: markerTitle(kind, count, journey.fate),
      where: placeOf(journey, row, map, encoding),
    }));
}
