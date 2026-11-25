/**
 * What is shown, worked out from the state: the open map, its open match, the switches, and the
 * draw list they give. The draw list is built once per change of what it depends on, so the map,
 * the legend and the list of journeys all read the same one.
 */
import { LAYER_KEYS, buildDrawList, eventKinds, shownLayers, type DrawList } from "../lib/drawList.ts";
import { allowedMatches } from "../lib/filters.ts";
import { buildHeat, cellsAcross, type Heat, type HeatKind } from "../lib/heat.ts";
import { roundedView, type Link } from "../lib/link.ts";
import type { MapEntry } from "../lib/manifest.ts";
import type { AppState } from "./store.ts";

/** The open map's entry in the manifest, once the manifest is there. */
export function selectMapEntry(state: AppState): MapEntry | null {
  if (state.manifest.status !== "ready") return null;
  return state.manifest.value.maps.find((entry) => entry.id === state.mapId) ?? null;
}

/** The id of the open match of the open map; null when all its matches are shown. */
export function selectMatchId(state: AppState): string | null {
  return state.mapId === null ? null : (state.matches[state.mapId] ?? null);
}

/** Whether the journeys panel is on the page: a match is open and the panel is wanted. It decides the page's columns, the panel and its reopen button. */
export function selectJourneysPanelShown(state: AppState): boolean {
  return selectMatchId(state) !== null && state.journeysPanel;
}

let last: { from: readonly unknown[]; list: DrawList } | null = null;

/** The draw list of the open map as the state stands; null until that map's journeys have arrived. */
export function selectDrawList(state: AppState): DrawList | null {
  const map = selectMapEntry(state);
  if (state.manifest.status !== "ready" || !map) return null;
  const journeys = state.journeys[map.id];
  if (journeys?.status !== "ready") return null;
  const manifest = state.manifest.value;
  const match = selectMatchId(state);
  const shown = shownLayers(state.choices, match !== null);

  const from = [journeys.value, manifest, map, match, state.days, state.fates, ...LAYER_KEYS.map((layer) => shown[layer])];
  if (last?.from.length === from.length && last.from.every((part, index) => part === from[index])) return last.list;
  const grid = { steps: manifest.encoding.uv_steps, image: { width: map.minimap.width, height: map.minimap.height } };
  const only = { matches: allowedMatches(manifest, map.id, state.days), fates: state.fates.length > 0 ? new Set(state.fates) : null };
  const list = buildDrawList(journeys.value, match, shown, eventKinds(manifest.event_groups), grid, only);
  last = { from, list };
  return list;
}

let lastHeat: { list: DrawList; kind: HeatKind; heat: Heat } | null = null;

/**
 * The heat layer that is on, counted from the journeys that are drawn; null when none is on or the
 * journeys have not arrived. It is counted once per draw list and kind, so the map and the legend
 * read the same grid.
 */
export function selectHeat(state: AppState): Heat | null {
  const list = selectDrawList(state);
  const map = selectMapEntry(state);
  if (!list || !map || state.heat === null || state.manifest.status !== "ready") return null;
  if (lastHeat?.list === list && lastHeat.kind === state.heat) return lastHeat.heat;
  const manifest = state.manifest.value;
  const heat = buildHeat(list, state.heat, manifest, cellsAcross(map), manifest.encoding.uv_steps);
  lastHeat = { list, kind: state.heat, heat };
  return heat;
}

/**
 * The view as a link, as the state stands; null until the manifest is there. What `checkedLink`
 * gives back for it is the same link. `time` is where playback stands, which the clock knows and
 * this state does not: null at the end of the match, and while no match is open.
 */
export function selectLink(state: AppState, time: number | null = null): Link | null {
  const map = selectMapEntry(state);
  if (state.manifest.status !== "ready" || !map) return null;
  const view = state.views[map.id];
  return {
    map: map === state.manifest.value.maps[0] ? null : map.id,
    days: state.days,
    match: selectMatchId(state),
    t: time,
    journey: state.focus,
    choices: state.choices,
    fates: state.fates,
    heat: state.heat,
    view: view ? roundedView(view) : null,
  };
}
