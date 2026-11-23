import { create } from "zustand";

import { dataUrl } from "../data/dataUrl.ts";
import { failureOf, type Failure } from "../data/failure.ts";
import { fetchManifest } from "../data/fetchManifest.ts";
import { loadImage } from "../data/loadImage.ts";
import type { Manifest, MapEntry } from "../lib/manifest.ts";
import type { View } from "../lib/view.ts";

/** A load that failed. Its kind decides what the screen advises; `retrying` is true while another try is under way. */
interface Failed {
  status: "error";
  failure: Failure;
  retrying: boolean;
}

/** Something that is fetched: on its way for the first time, there, or failed. */
type Loadable<T> = { status: "loading" } | { status: "ready"; value: T } | Failed;

interface AppState {
  manifest: Loadable<Manifest>;
  /** The id of the open map; null until the manifest has arrived. */
  mapId: string | null;
  /** The minimap image of every map that has been asked for, by map id. */
  minimaps: Partial<Record<string, Loadable<HTMLImageElement>>>;
  /** Where each map is looked at, by map id. A map without an entry is fitted to the window. */
  views: Partial<Record<string, View>>;

  /** Fetch the manifest, open its first map and load the minimaps: the open one first, then the others. */
  loadManifest: () => Promise<void>;
  /** Load a map's minimap unless it is loading or loaded already. Asking again after a failure tries again. */
  loadMinimap: (map: MapEntry) => Promise<void>;
  /** Open a map of the manifest. An id the manifest does not have is ignored. */
  selectMap: (mapId: string) => void;
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

export const useAppStore = create<AppState>()((set, get) => ({
  manifest: { status: "loading" },
  mapId: null,
  minimaps: {},
  views: {},

  loadManifest: () => {
    manifestOnItsWay ??= (async () => {
      const before = get().manifest;
      const again = before.status === "error";
      set({ manifest: again ? { ...before, retrying: true } : { status: "loading" } });
      try {
        const manifest = await fetchManifest(again);
        const [first, ...others] = manifest.maps;
        set({ manifest: { status: "ready", value: manifest }, mapId: first.id });
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

  loadMinimap: async (map) => {
    const known = get().minimaps[map.id];
    if (known && (known.status !== "error" || known.retrying)) return; // on its way, there, or being tried again
    const put = (minimap: Loadable<HTMLImageElement>) => {
      set((state) => ({ minimaps: { ...state.minimaps, [map.id]: minimap } }));
    };
    put(known ? { ...known, retrying: true } : { status: "loading" });
    try {
      put({ status: "ready", value: await loadImage(dataUrl(map.minimap.file), known !== undefined) });
    } catch (error) {
      put(failed(error));
    }
  },

  selectMap: (mapId) => {
    const { manifest, loadMinimap } = get();
    const map = manifest.status === "ready" ? manifest.value.maps.find((entry) => entry.id === mapId) : undefined;
    if (!map) return;
    set({ mapId });
    void loadMinimap(map);
  },

  setView: (mapId, view) => {
    set((state) => {
      const known = state.views[mapId];
      const unchanged = view ? known?.x === view.x && known.y === view.y && known.zoom === view.zoom : !known;
      if (unchanged) return state; // nobody is told about a view that did not change
      const others = Object.fromEntries(Object.entries(state.views).filter(([id]) => id !== mapId));
      return { views: view ? { ...others, [mapId]: view } : others };
    });
  },
}));
