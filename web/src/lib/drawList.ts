/**
 * The draw list: everything the map and the legend need for what is shown. Pure.
 *
 * A journey's path is its rows up to and including its death row (docs/DATA_FORMAT.md, rule 3).
 * Every row that is not a movement row is a marker, at the place where its owner stood; the events
 * of one kind that one journey has at one spot are one marker with a count. Which event codes are
 * kills, deaths and so on comes from the manifest's `event_groups`; no event is known here by name.
 */
import type { Journey } from "./journeys.ts";
import type { Manifest } from "./manifest.ts";
import { codeToUnit, uvToPixel, type Size } from "./projection.ts";

/** The kinds of marker: the groups of the manifest's `event_groups` that are not movement. */
export const MARKER_KINDS = ["kill", "death", "storm_death", "loot"] as const satisfies readonly (keyof Manifest["event_groups"])[];
export type MarkerKind = (typeof MARKER_KINDS)[number];

/** Everything that can be shown or hidden: the two kinds of journey and the four kinds of marker. */
export const LAYER_KEYS = ["humans", "bots", ...MARKER_KINDS] as const;
export type LayerKey = (typeof LAYER_KEYS)[number];
export type Shown = Record<LayerKey, boolean>;

/** The order the kinds are drawn in, from the bottom: the many loot markers must not cover a death or a kill. */
const DRAWN: Record<MarkerKind, number> = { loot: 0, storm_death: 1, death: 2, kill: 3 };

/** What the event codes mean for drawing, read from the manifest once. */
export interface EventKinds {
  /** The kind of marker a code stands for. Movement codes have none. */
  kindOf: ReadonlyMap<number, MarkerKind>;
  /** The codes that end a path: a death in combat or in the storm. */
  ends: ReadonlySet<number>;
}

export function eventKinds(groups: Manifest["event_groups"]): EventKinds {
  const kindOf = new Map<number, MarkerKind>();
  for (const kind of MARKER_KINDS) for (const code of groups[kind]) kindOf.set(code, kind);
  return { kindOf, ends: new Set([...groups.death, ...groups.storm_death]) };
}

/** How stored u and v codes become image pixels: the manifest's `encoding.uv_steps` and the size of the minimap. */
export interface Grid {
  steps: number;
  image: Size;
}

/** The number of rows in a journey's path: all of them up to and including the death row. */
export function pathLength(journey: Journey, kinds: EventKinds): number {
  const death = journey.e.findIndex((code) => kinds.ends.has(code));
  return death === -1 ? journey.e.length : death + 1;
}

export interface DrawnJourney {
  journey: Journey;
  /** The first this many rows are the path. Its head is at the last of them. */
  pathLength: number;
  /** Every row's position in image pixels. A marker after the death row needs its row too. */
  x: Float32Array;
  y: Float32Array;
}

export interface Marker {
  kind: MarkerKind;
  /** The index of its journey in the draw list's `journeys`. */
  journey: number;
  /** The first of the rows it stands for, and the last. */
  row: number;
  last: number;
  /** How many rows it stands for: the events of its kind that its journey has at this spot. */
  count: number;
}

export interface DrawList {
  /** The journeys that are drawn. */
  journeys: DrawnJourney[];
  /** The markers in the order they are drawn: loot at the bottom, then storm deaths, deaths, and kills on top; within a kind by journey and row. */
  markers: Marker[];
  /**
   * The legend's numbers. Journeys are counted for the open match whatever the switches say. Marker
   * rows are counted for the journeys that are drawn, also when their own kind is hidden, so that a
   * hidden kind still says how much it would show.
   */
  counts: Record<LayerKey, number>;
  /** How many matches the open selection holds. */
  matches: number;
  /** True when one match is open. */
  single: boolean;
}

function positions(journey: Journey, { steps, image }: Grid): Pick<DrawnJourney, "x" | "y"> {
  const x = new Float32Array(journey.u.length);
  const y = new Float32Array(journey.u.length);
  for (let row = 0; row < journey.u.length; row += 1) {
    const pixel = uvToPixel(codeToUnit(journey.u[row], steps), codeToUnit(journey.v[row], steps), image);
    x[row] = pixel.x;
    y[row] = pixel.y;
  }
  return { x, y };
}

/** The draw list for one match (`match` is its id) or for all matches of the map (`match` is null). */
export function buildDrawList(all: readonly Journey[], match: string | null, shown: Shown, kinds: EventKinds, grid: Grid): DrawList {
  const counts: Record<LayerKey, number> = { humans: 0, bots: 0, kill: 0, death: 0, storm_death: 0, loot: 0 };
  const journeys: DrawnJourney[] = [];
  const markers: Marker[] = [];
  const matches = new Set<string>();

  for (const journey of all) {
    if (match !== null && journey.match !== match) continue;
    matches.add(journey.match);
    const actor = journey.actor === "human" ? "humans" : "bots";
    counts[actor] += 1;
    if (!shown[actor]) continue;

    const index = journeys.length;
    journeys.push({ journey, pathLength: pathLength(journey, kinds), ...positions(journey, grid) });
    const seen = new Map<string, Marker>();
    for (let row = 0; row < journey.e.length; row += 1) {
      const kind = kinds.kindOf.get(journey.e[row]);
      if (!kind) continue;
      counts[kind] += 1;
      if (!shown[kind]) continue;
      const same = `${kind} ${journey.u[row]} ${journey.v[row]}`;
      const known = seen.get(same);
      if (known) {
        known.count += 1;
        known.last = row;
      } else {
        const marker: Marker = { kind, journey: index, row, last: row, count: 1 };
        seen.set(same, marker);
        markers.push(marker);
      }
    }
  }
  markers.sort((a, b) => DRAWN[a.kind] - DRAWN[b.kind]); // a stable sort: journeys and rows keep their order within a kind
  return { journeys, markers, counts, matches: matches.size, single: match !== null };
}

/** The switches as they stand: a choice made by hand, or else everything shown except loot in the all-matches view. */
export function shownLayers(choices: Partial<Shown>, single: boolean): Shown {
  return {
    humans: choices.humans ?? true,
    bots: choices.bots ?? true,
    kill: choices.kill ?? true,
    death: choices.death ?? true,
    storm_death: choices.storm_death ?? true,
    loot: choices.loot ?? single, // 9,902 loot rows on one map hide everything else
  };
}
