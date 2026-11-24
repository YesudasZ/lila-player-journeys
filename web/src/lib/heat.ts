/**
 * Heat: how many rows of one kind fall into each cell of a grid over the map. Pure.
 *
 * A heat layer answers "where" for everything that is drawn at once: where players moved, killed,
 * died or looted. Its kinds stand for event groups of the manifest, so no event is known here by
 * name. A cell has a fixed size in world units, so it means the same on every map. Every row is
 * where the owner of its journey stood: a kill lies where the killer stood, a death where the
 * victim fell (docs/DATA_NOTES.md, "What the heat layers count").
 */
import type { DrawList } from "./drawList.ts";
import { countLabel, counted } from "./labels.ts";
import type { Manifest, MapEntry } from "./manifest.ts";
import { codeToUnit } from "./projection.ts";

type EventGroup = keyof Manifest["event_groups"];

/** The event groups of the manifest that each kind of heat counts. Deaths are those in combat and those in the storm. */
export const HEAT_GROUPS = {
  movement: ["movement"],
  kill: ["kill"],
  death: ["death", "storm_death"],
  loot: ["loot"],
} as const satisfies Record<string, readonly EventGroup[]>;
export type HeatKind = keyof typeof HEAT_GROUPS;
export const HEAT_KINDS = Object.keys(HEAT_GROUPS) as HeatKind[];

export const HEAT_LABELS: Record<HeatKind, string> = { movement: "Traffic", kill: "Kills", death: "Deaths", loot: "Loot" };
/** The design token that holds the colour of each kind. */
export const HEAT_TOKENS: Record<HeatKind, string> = { movement: "--color-accent-2", kill: "--color-kill", death: "--color-death", loot: "--color-loot" };
const NOUNS: Record<HeatKind, [string, string]> = {
  movement: ["movement sample", "movement samples"],
  kill: ["kill", "kills"],
  death: ["death", "deaths"],
  loot: ["loot event", "loot events"],
};
/** What a kind counts, and at whose position. */
const WHAT: Record<HeatKind, string> = {
  movement: "Each sample is counted where the player or bot was. They show movement, not time spent.",
  kill: "Kills of players and of bots are counted, each where the killer stood.",
  death: "Deaths in combat and in the storm are counted, each where the victim fell.",
  loot: "Each is counted where the player stood.",
};

/** The side of a cell, in world units. */
export const CELL_UNITS = 10;

/** How many cells a map has along each side. A map's u and v both run over its `scale` in world units, so the grid is square. */
export function cellsAcross(map: Pick<MapEntry, "scale">): number {
  return Math.max(1, Math.round(map.scale / CELL_UNITS));
}

/** The cell of a position given as stored codes: `row * cells + column`, with row 0 at the top of the map. v grows upward. */
export function cellOf(u: number, v: number, cells: number, steps: number): number {
  const column = Math.min(cells - 1, Math.floor(codeToUnit(u, steps) * cells));
  const row = Math.min(cells - 1, Math.floor((1 - codeToUnit(v, steps)) * cells));
  return row * cells + column;
}

export interface Heat {
  kind: HeatKind;
  /** Cells along each side. */
  cells: number;
  /** The rows counted in each cell. */
  counts: Uint32Array;
  /** The counts smoothed once: what is drawn. */
  smooth: Float32Array;
  /** All rows counted, and the largest count of a cell. */
  total: number;
  most: number;
  /** The largest smoothed value: the full strength of the colour. */
  top: number;
  /** How many matches the rows come from. */
  matches: number;
  /** Of the rows counted, those that are storm deaths. */
  storm: number;
  /** The rows counted of each event the kind stands for, by the event's name in the data. */
  events: { name: string; count: number }[];
}

/**
 * Spread every cell's value over its neighbours: half stays, a quarter goes each way, first along
 * the rows and then along the columns. At an edge the quarter that would leave stays in the cell,
 * so the total is kept.
 */
export function smoothed(counts: ArrayLike<number>, cells: number): Float32Array {
  const along = new Float32Array(cells * cells);
  const both = new Float32Array(cells * cells);
  for (let row = 0; row < cells; row += 1) {
    for (let column = 0; column < cells; column += 1) {
      const value = counts[row * cells + column];
      if (value === 0) continue;
      along[row * cells + column] += value / 2;
      along[row * cells + Math.max(column - 1, 0)] += value / 4;
      along[row * cells + Math.min(column + 1, cells - 1)] += value / 4;
    }
  }
  for (let row = 0; row < cells; row += 1) {
    for (let column = 0; column < cells; column += 1) {
      const value = along[row * cells + column];
      if (value === 0) continue;
      both[row * cells + column] += value / 2;
      both[Math.max(row - 1, 0) * cells + column] += value / 4;
      both[Math.min(row + 1, cells - 1) * cells + column] += value / 4;
    }
  }
  return both;
}

/**
 * The heat of the journeys that are drawn: every row whose event belongs to the kind, counted in
 * the cell where its owner stood. Hidden marker kinds do not matter here: the heat follows the
 * journeys, not their markers.
 */
export function buildHeat(list: DrawList, kind: HeatKind, manifest: Pick<Manifest, "event_groups" | "events">, cells: number, steps: number): Heat {
  const codes: number[] = HEAT_GROUPS[kind].flatMap((group) => manifest.event_groups[group]);
  const storm = new Set(manifest.event_groups.storm_death);
  const byCode = new Map(codes.map((code) => [code, 0]));
  const counts = new Uint32Array(cells * cells);
  const matches = new Set<string>();
  for (const { journey } of list.journeys) {
    for (let row = 0; row < journey.e.length; row += 1) {
      const counted = byCode.get(journey.e[row]);
      if (counted === undefined) continue;
      byCode.set(journey.e[row], counted + 1);
      counts[cellOf(journey.u[row], journey.v[row], cells, steps)] += 1;
      matches.add(journey.match);
    }
  }
  const smooth = smoothed(counts, cells);
  return {
    kind,
    cells,
    counts,
    smooth,
    total: codes.reduce((total, code) => total + (byCode.get(code) ?? 0), 0),
    most: counts.reduce((most, count) => Math.max(most, count), 0),
    top: smooth.reduce((top, value) => Math.max(top, value), 0),
    matches: matches.size,
    storm: codes.filter((code) => storm.has(code)).reduce((total, code) => total + (byCode.get(code) ?? 0), 0),
    events: codes.map((code) => ({ name: manifest.events[code], count: byCode.get(code) ?? 0 })),
  };
}

/** How strong the colour of a cell is, from 0 to 1, on a square-root scale: the busiest cell must not hide the rest. */
export function strength(value: number, top: number): number {
  return top === 0 ? 0 : Math.sqrt(Math.min(Math.max(value / top, 0), 1));
}

/** A colour written as `#rrggbb`, as the design tokens are, as three numbers. */
export function rgbOf(colour: string): [number, number, number] {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(colour.trim());
  if (!hex) throw new Error(`"${colour}" is not a colour of six hexadecimal digits`);
  return [parseInt(hex[1], 16), parseInt(hex[2], 16), parseInt(hex[3], 16)];
}

/**
 * What a heat layer shows, for its legend: the numbers, then what is counted and at whose position.
 * Deaths say how many of them are storm deaths. `scale` is the map's width in world units.
 */
export function heatSummary(heat: Pick<Heat, "kind" | "total" | "matches" | "most" | "cells" | "storm">, scale: number): string {
  const [one, many] = NOUNS[heat.kind];
  if (heat.total === 0) return `The journeys that are drawn have no ${many}.`;
  const side = Math.round(scale / heat.cells);
  const storm = heat.kind === "death" ? `, incl. ${counted(heat.storm, "storm death", "storm deaths")}` : "";
  return `${counted(heat.total, one, many)} of ${counted(heat.matches, "match", "matches")}${storm}; the fullest cell holds ${countLabel(heat.most)}. A cell is ${side} × ${side} units. ${WHAT[heat.kind]}`;
}

/** The rows counted of each event, by its name in the data: "Killed 3 · BotKilled 697 · KilledByStorm 39". */
export function heatEvents(heat: Pick<Heat, "events">): string {
  return heat.events.map(({ name, count }) => `${name} ${countLabel(count)}`).join(" · ");
}
