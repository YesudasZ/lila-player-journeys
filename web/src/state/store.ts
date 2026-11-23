import { create } from "zustand";

import { dataUrl } from "../data/dataUrl.ts";
import { fetchManifest } from "../data/fetchManifest.ts";
import { loadImage } from "../data/loadImage.ts";
import type { Manifest, MapEntry } from "../lib/manifest.ts";
import type { View } from "../lib/view.ts";

/** Something that is fetched: on its way, there, or failed. */
export type Loaded<T> = { status: "loading" } | { status: "ready"; value: T } | { status: "error" };

interface AppState {
  manifest: Loaded<Manifest>;
  /** The id of the open map; null until the manifest has arrived. */
  mapId: string | null;
  /** The minimap image of every map that has been asked for, by map id. */
  minimaps: Partial<Record<string, Loaded<HTMLImageElement>>>;
  /** Where each map is looked at, by map id. A map without an entry is fitted to the window. */
  views: Partial<Record<string, View>>;

  /** Fetch the manifest, open its first map and load the minimaps: the open one first, then the others. */
  loadManifest: () => Promise<void>;
  /** Load a map's minimap unless it is loading or loaded already. Asking again after a failure tries again. */
  loadMinimap: (map: MapEntry) => Promise<void>;
  selectMap: (mapId: string) => void;
  /** Set the view of a map; null goes back to fit. */
  setView: (mapId: string, view: View | null) => void;
}

/** The fetch of the manifest that is under way, so that asking twice loads once. */
let manifestOnItsWay: Promise<void> | null = null;

export const useAppStore = create<AppState>()((set, get) => ({
  manifest: { status: "loading" },
  mapId: null,
  minimaps: {},
  views: {},

  loadManifest: () => {
    manifestOnItsWay ??= (async () => {
      set({ manifest: { status: "loading" } });
      try {
        const manifest = await fetchManifest();
        const [first, ...others] = manifest.maps;
        set({ manifest: { status: "ready", value: manifest }, mapId: first.id });
        await get().loadMinimap(first);
        for (const map of others) void get().loadMinimap(map);
      } catch {
        set({ manifest: { status: "error" } });
      } finally {
        manifestOnItsWay = null;
      }
    })();
    return manifestOnItsWay;
  },

  loadMinimap: async (map) => {
    const known = get().minimaps[map.id];
    if (known && known.status !== "error") return;
    const put = (minimap: Loaded<HTMLImageElement>) => {
      set((state) => ({ minimaps: { ...state.minimaps, [map.id]: minimap } }));
    };
    put({ status: "loading" });
    try {
      put({ status: "ready", value: await loadImage(dataUrl(map.minimap.file), known?.status === "error") });
    } catch {
      put({ status: "error" });
    }
  },

  selectMap: (mapId) => {
    const { manifest, loadMinimap } = get();
    set({ mapId });
    const map = manifest.status === "ready" ? manifest.value.maps.find((entry) => entry.id === mapId) : undefined;
    if (map) void loadMinimap(map);
  },

  setView: (mapId, view) => {
    set((state) => {
      const others = Object.fromEntries(Object.entries(state.views).filter(([id]) => id !== mapId));
      return { views: view ? { ...others, [mapId]: view } : others };
    });
  },
}));
