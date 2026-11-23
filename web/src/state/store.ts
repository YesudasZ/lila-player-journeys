import { create } from "zustand";

import { dataUrl } from "../data/dataUrl.ts";
import { failureOf, type Failure } from "../data/failure.ts";
import { fetchBundle } from "../data/fetchBundle.ts";
import { fetchManifest } from "../data/fetchManifest.ts";
import { loadImage } from "../data/loadImage.ts";
import type { LayerKey, Shown } from "../lib/drawList.ts";
import type { Journey } from "../lib/journeys.ts";
import type { Manifest, MapEntry } from "../lib/manifest.ts";
import type { View } from "../lib/view.ts";

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

  /** Fetch the manifest, open its first map, and load that map's minimap and journeys and then the other minimaps. */
  loadManifest: () => Promise<void>;
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
  /** Set the view of a map; null goes back to fit. */
  setView: (mapId: string, view: View | null) => void;
}

/** The fetch of the manifest that is under way, so that asking twice loads once. */
let manifestOnItsWay: Promise<void> | null = null;

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

  loadManifest: () => {
    manifestOnItsWay ??= (async () => {
      const before = get().manifest;
      const again = before.status === "error";
      set({ manifest: again ? { ...before, retrying: true } : { status: "loading" } });
      try {
        const manifest = await fetchManifest(again);
        const [first, ...others] = manifest.maps;
        set({ manifest: { status: "ready", value: manifest }, mapId: first.id });
        void get().loadJourneys(first); // alongside its minimap: neither download waits for the other
        await get().loadMinimap(first);
        for (const map of others) void get().loadMinimap(map);
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
    const known = manifest.status === "ready" && manifest.value.matches.some((match) => match.id === matchId && match.map === mapId);
    if (matchId !== null && !known) return;
    set((state) => ({ matches: matchId === null ? without(state.matches, mapId) : { ...state.matches, [mapId]: matchId }, focus: null }));
  },

  setShown: (layer, shown) => {
    const hidesJourneys = !shown && (layer === "humans" || layer === "bots"); // a journey that is no longer drawn cannot stay focused
    set((state) => ({ choices: { ...state.choices, [layer]: shown }, focus: hidesJourneys ? null : state.focus }));
  },

  setFocus: (journeyId) => {
    set({ focus: journeyId });
  },

  setView: (mapId, view) => {
    set((state) => {
      const known = state.views[mapId];
      const unchanged = view ? known?.x === view.x && known.y === view.y && known.zoom === view.zoom : !known;
      if (unchanged) return state; // nobody is told about a view that did not change
      return { views: view ? { ...without(state.views, mapId), [mapId]: view } : without(state.views, mapId) };
    });
  },
}));
