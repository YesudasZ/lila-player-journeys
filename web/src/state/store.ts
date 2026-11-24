import { create } from "zustand";

import { dataUrl } from "../data/dataUrl.ts";
import { failureOf, type Failure } from "../data/failure.ts";
import { fetchBundle } from "../data/fetchBundle.ts";
import { fetchManifest } from "../data/fetchManifest.ts";
import { loadImage } from "../data/loadImage.ts";
import type { LayerKey, Shown } from "../lib/drawList.ts";
import { matchesWithFates, onChosenDays } from "../lib/filters.ts";
import type { HeatKind } from "../lib/heat.ts";
import type { Journey } from "../lib/journeys.ts";
import { DEFAULT_LINK, checkedLink, type Link } from "../lib/link.ts";
import type { Manifest, MapEntry } from "../lib/manifest.ts";
import type { View } from "../lib/view.ts";
import { selectDrawList } from "./shown.ts";

/** A load that failed. Its kind decides what the screen advises; `retrying` is true while another try is under way. */
interface Failed {
  status: "error";
  failure: Failure;
  retrying: boolean;
}

/** Something that is fetched: on its way for the first time, there, or failed. */
export type Loadable<T> = { status: "loading" } | { status: "ready"; value: T } | Failed;

export interface AppState {
  manifest: Loadable<Manifest>;
  /** The id of the open map; null until the manifest has arrived. */
  mapId: string | null;
  /** The minimap image of every map that has been asked for, by map id. */
  minimaps: Partial<Record<string, Loadable<HTMLImageElement>>>;
  /** The journeys of every map that has been opened, by map id. */
  journeys: Partial<Record<string, Loadable<Journey[]>>>;
  /** Where each map is looked at, by map id. A map without an entry is fitted to the window. */
  views: Partial<Record<string, View>>;
  /** The open match of each map, by map id. A map without an entry shows all its matches. */
  matches: Partial<Record<string, string>>;
  /** The switches that were set by hand. The others follow the view: see `shownLayers`. */
  choices: Partial<Shown>;
  /** The id of the focused journey, if there is one. */
  focus: string | null;
  /** The chosen day folders, in the order of the manifest. None means all days. */
  days: string[];
  /** The chosen fates, in the order of the manifest. None means all. */
  fates: string[];
  /** The heat layer that is on; null when none is. */
  heat: HeatKind | null;
  /** The link the page was opened with, kept for a retry of the manifest. */
  asked: Link;

  /**
   * Fetch the manifest and open the view that a link asks for, as far as the data has it: the first
   * map and no filter when it asks for nothing. Load that map's minimap and journeys, then the other
   * minimaps. A later call without a link, a retry, keeps the link of the first call.
   */
  loadManifest: (link?: Link) => Promise<void>;
  /** Load a map's minimap unless it is loading or loaded already. Asking again after a failure tries again. */
  loadMinimap: (map: MapEntry) => Promise<void>;
  /** The same for a map's journeys. They are loaded when the map is first opened. */
  loadJourneys: (map: MapEntry) => Promise<void>;
  /** Open a map of the manifest. An id the manifest does not have is ignored. */
  selectMap: (mapId: string) => void;
  /** Open one match of a map, or all of them with null. A match the manifest does not have on that map is ignored. */
  selectMatch: (mapId: string, matchId: string | null) => void;
  /** Show or hide a kind of journey or marker. */
  setShown: (layer: LayerKey, shown: boolean) => void;
  /** Focus a journey by its id; null clears the focus. */
  setFocus: (journeyId: string | null) => void;
  /** Choose a day, or take it out again. A filter that rules the open match out closes it. */
  toggleDay: (dayId: string) => void;
  /** The same for a fate. */
  toggleFate: (fate: string) => void;
  /** Back to all days and all fates. */
  clearFilters: () => void;
  /** Set the view of a map; null goes back to fit. */
  setView: (mapId: string, view: View | null) => void;
  /** Switch a heat layer on, which switches any other off; null switches the heat off. */
  setHeat: (kind: HeatKind | null) => void;
}

/** The fetch of the manifest that is under way, so that asking twice loads once. */
let manifestOnItsWay: Promise<void> | null = null;

/** `chosen` with one entry toggled, in the order of `all`: the order of the data, so a link always reads the same. */
const toggled = (all: readonly string[], chosen: readonly string[], entry: string): string[] => all.filter((each) => (each === entry) !== chosen.includes(each));

/**
 * Filters always hold: the open match of a map stays open only while the chosen days and fates
 * leave something of it. Whether a fate leaves something can be told once the journeys are there.
 */
function matchesLeft(state: AppState, manifest: Manifest, days: readonly string[], fates: readonly string[]): AppState["matches"] {
  return Object.fromEntries(
    Object.entries(state.matches).filter(([mapId, matchId]) => {
      const match = manifest.matches.find((entry) => entry.id === matchId);
      if (!match || !onChosenDays(match, days)) return false;
      const journeys = state.journeys[mapId];
      return fates.length === 0 || journeys?.status !== "ready" || journeys.value.some((journey) => journey.match === matchId && fates.includes(journey.fate));
    }),
  );
}

/** The state of a load that just failed. The reason itself goes to the console, where a developer finds it. */
function failed(error: unknown): Failed {
  console.error(error);
  return { status: "error", failure: failureOf(error), retrying: false };
}

/** Load something once: not while it is on its way or there, and afresh after a failure. */
async function loadOnce<T>(known: Loadable<T> | undefined, put: (state: Loadable<T>) => void, load: (afterFailure: boolean) => Promise<T>): Promise<void> {
  if (known && (known.status !== "error" || known.retrying)) return;
  put(known ? { ...known, retrying: true } : { status: "loading" });
  try {
    put({ status: "ready", value: await load(known !== undefined) });
  } catch (error) {
    put(failed(error));
  }
}

const without = <T>(record: Partial<Record<string, T>>, key: string): Partial<Record<string, T>> =>
  Object.fromEntries(Object.entries(record).filter(([id]) => id !== key));

export const useAppStore = create<AppState>()((set, get) => ({
  manifest: { status: "loading" },
  mapId: null,
  minimaps: {},
  journeys: {},
  views: {},
  matches: {},
  choices: {},
  focus: null,
  days: [],
  fates: [],
  heat: null,
  asked: DEFAULT_LINK,

  loadManifest: (link) => {
    if (link) set({ asked: link });
    manifestOnItsWay ??= (async () => {
      const before = get().manifest;
      const again = before.status === "error";
      set({ manifest: again ? { ...before, retrying: true } : { status: "loading" } });
      try {
        const manifest = await fetchManifest(again);
        const view = checkedLink(get().asked, manifest);
        const open = manifest.maps.find((map) => map.id === view.map) ?? manifest.maps[0];
        set({
          manifest: { status: "ready", value: manifest },
          mapId: open.id,
          days: view.days,
          fates: view.fates,
          heat: view.heat,
          matches: view.match === null ? {} : { [open.id]: view.match },
          focus: view.journey,
          choices: view.choices,
          views: view.view ? { [open.id]: view.view } : {},
        });
        void get().loadJourneys(open); // alongside its minimap: neither download waits for the other
        await get().loadMinimap(open);
        for (const map of manifest.maps) if (map !== open) void get().loadMinimap(map);
      } catch (error) {
        set({ manifest: failed(error) });
      } finally {
        manifestOnItsWay = null;
      }
    })();
    return manifestOnItsWay;
  },

  loadMinimap: (map) =>
    loadOnce(
      get().minimaps[map.id],
      (minimap) => {
        set((state) => ({ minimaps: { ...state.minimaps, [map.id]: minimap } }));
      },
      (afterFailure) => loadImage(dataUrl(map.minimap.file), afterFailure),
    ),

  loadJourneys: async (map) => {
    const { manifest, journeys } = get();
    if (manifest.status !== "ready") return;
    await loadOnce(
      journeys[map.id],
      (loaded) => {
        set((state) => ({ journeys: { ...state.journeys, [map.id]: loaded } }));
      },
      (afterFailure) => fetchBundle(map, manifest.value, afterFailure),
    );
    // Only now can a focus that came with a link be checked, and a fate filter against the open match.
    const state = get();
    const loaded = state.journeys[map.id];
    if (loaded?.status !== "ready" || state.mapId !== map.id) return;
    set({ matches: matchesLeft(state, manifest.value, state.days, state.fates) });
    const drawn = selectDrawList(get())?.journeys.some((each) => each.journey.id === state.focus) ?? false;
    if (!drawn) set({ focus: null }); // a focus that came with a link stays only when its journey is drawn
  },

  selectMap: (mapId) => {
    const { manifest, loadMinimap, loadJourneys } = get();
    const map = manifest.status === "ready" ? manifest.value.maps.find((entry) => entry.id === mapId) : undefined;
    if (!map) return;
    set({ mapId, focus: null });
    void loadMinimap(map);
    void loadJourneys(map);
  },

  selectMatch: (mapId, matchId) => {
    const { manifest } = get();
    const { days, fates, journeys } = get();
    const known = manifest.status === "ready" && manifest.value.matches.some((match) => match.id === matchId && match.map === mapId && onChosenDays(match, days));
    const loaded = journeys[mapId];
    const left = matchId === null || loaded?.status !== "ready" || (matchesWithFates(loaded.value, fates)?.has(matchId) ?? true); // the chosen fates have to leave something of it
    if (matchId !== null && (!known || !left)) return;
    set((state) => ({ matches: matchId === null ? without(state.matches, mapId) : { ...state.matches, [mapId]: matchId }, focus: null }));
  },

  setShown: (layer, shown) => {
    const hidesJourneys = !shown && (layer === "humans" || layer === "bots"); // a journey that is no longer drawn cannot stay focused
    // Only loot follows the view. For the others "shown" is what they are anyway, so that choice is forgotten and stays out of a link.
    const forgotten = shown && layer !== "loot";
    set((state) => ({
      choices: forgotten ? Object.fromEntries(Object.entries(state.choices).filter(([each]) => each !== layer)) : { ...state.choices, [layer]: shown },
      focus: hidesJourneys ? null : state.focus,
    }));
  },

  setFocus: (journeyId) => {
    set({ focus: journeyId });
  },

  toggleDay: (dayId) => {
    const { manifest } = get();
    if (manifest.status !== "ready") return;
    set((state) => {
      const days = toggled(manifest.value.days.map((day) => day.id), state.days, dayId);
      return { days, matches: matchesLeft(state, manifest.value, days, state.fates), focus: null }; // what was focused may be gone
    });
  },

  toggleFate: (fate) => {
    const { manifest } = get();
    if (manifest.status !== "ready") return;
    set((state) => {
      const fates = toggled(manifest.value.fates, state.fates, fate);
      return { fates, matches: matchesLeft(state, manifest.value, state.days, fates), focus: null };
    });
  },

  clearFilters: () => {
    set({ days: [], fates: [] });
  },

  setView: (mapId, view) => {
    set((state) => {
      const known = state.views[mapId];
      const unchanged = view ? known?.x === view.x && known.y === view.y && known.zoom === view.zoom : !known;
      if (unchanged) return state; // nobody is told about a view that did not change
      return { views: view ? { ...without(state.views, mapId), [mapId]: view } : without(state.views, mapId) };
    });
  },

  setHeat: (kind) => {
    set({ heat: kind });
  },
}));
