/**
 * What is shown, worked out from the state: the open map, its open match, the switches, and the
 * draw list they give. The draw list is built once per change of what it depends on, so the map,
 * the legend and the list of journeys all read the same one.
 */
import { LAYER_KEYS, buildDrawList, eventKinds, shownLayers, type DrawList } from "../lib/drawList.ts";
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

  const from = [journeys.value, manifest, map, match, ...LAYER_KEYS.map((layer) => shown[layer])];
  if (last?.from.length === from.length && last.from.every((part, index) => part === from[index])) return last.list;
  const list = buildDrawList(journeys.value, match, shown, eventKinds(manifest.event_groups), {
    steps: manifest.encoding.uv_steps,
    image: { width: map.minimap.width, height: map.minimap.height },
  });
  last = { from, list };
  return list;
}
