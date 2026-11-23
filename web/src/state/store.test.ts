import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { fetchManifest } from "../data/fetchManifest.ts";
import { loadImage } from "../data/loadImage.ts";
import { ManifestError, type Manifest, type MapEntry } from "../lib/manifest.ts";
import { manifest, mapOf } from "../testing/committed.ts";
import { useAppStore } from "./store.ts";

// The store is tested with the real manifest and without a network: the two loaders are stand-ins.
vi.mock("../data/fetchManifest.ts", () => ({ fetchManifest: vi.fn() }));
vi.mock("../data/loadImage.ts", () => ({ loadImage: vi.fn() }));

const fetched = vi.mocked(fetchManifest);
const loaded = vi.mocked(loadImage);
const [ambrose, rift, lockdown] = [mapOf("AmbroseValley"), mapOf("GrandRift"), mapOf("Lockdown")];
const IMAGE = {} as HTMLImageElement; // the store keeps an image and never looks inside it
const urlOf = (map: MapEntry) => `/data/${map.minimap.file}`;
const state = () => useAppStore.getState();
const everyImageIsThere = () => {
  expect(Object.values(state().minimaps).map((minimap) => minimap?.status)).toEqual(["ready", "ready", "ready"]);
};

/** A promise that the test settles when it chooses. */
function deferred<T>() {
  const handles: { resolve: (value: T) => void } = { resolve: () => {} };
  const promise = new Promise<T>((resolve) => {
    handles.resolve = resolve;
  });
  return { promise, resolve: handles.resolve };
}

let logged: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.resetAllMocks();
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
  useAppStore.setState(useAppStore.getInitialState(), true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loading", () => {
  it("opens the first map and loads its image before the other two", async () => {
    const first = deferred<HTMLImageElement>();
    fetched.mockResolvedValue(manifest);
    loaded.mockReturnValueOnce(first.promise).mockResolvedValue(IMAGE);

    const loading = state().loadManifest();
    await vi.waitFor(() => {
      expect(loaded).toHaveBeenCalledTimes(1);
    });
    expect(state().mapId).toBe("AmbroseValley");
    expect(state().minimaps).toEqual({ AmbroseValley: { status: "loading" } });

    first.resolve(IMAGE);
    await loading;
    await vi.waitFor(everyImageIsThere);
    expect(loaded.mock.calls).toEqual([
      [urlOf(ambrose), false],
      [urlOf(rift), false],
      [urlOf(lockdown), false],
    ]);
    expect(fetched).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("fetches the manifest once when asked twice", async () => {
    fetched.mockResolvedValue(manifest);
    loaded.mockResolvedValue(IMAGE);
    await Promise.all([state().loadManifest(), state().loadManifest()]);
    expect(fetched).toHaveBeenCalledTimes(1);
  });

  it("loads an image once when its map is chosen while the first image is still on its way", async () => {
    const first = deferred<HTMLImageElement>();
    fetched.mockResolvedValue(manifest);
    loaded.mockReturnValueOnce(first.promise).mockResolvedValue(IMAGE);

    const loading = state().loadManifest();
    await vi.waitFor(() => {
      expect(loaded).toHaveBeenCalledTimes(1);
    });
    state().selectMap("GrandRift");
    first.resolve(IMAGE);
    await loading;
    await vi.waitFor(everyImageIsThere);

    expect(state().mapId).toBe("GrandRift");
    expect(loaded.mock.calls.map(([url]) => url).sort()).toEqual([ambrose, rift, lockdown].map(urlOf).sort());
  });

  it("ignores a map id the manifest does not have", async () => {
    fetched.mockResolvedValue(manifest);
    loaded.mockResolvedValue(IMAGE);
    await state().loadManifest();
    state().selectMap("Nowhere");
    expect(state().mapId).toBe("AmbroseValley");
  });
});

describe("a load that fails", () => {
  it("keeps the kind of failure, logs the reason once, and asks the server afresh on the next try", async () => {
    const offline = new TypeError("Failed to fetch");
    fetched.mockRejectedValueOnce(offline);
    await state().loadManifest();
    expect(state().manifest).toEqual({ status: "error", failure: "unreachable", retrying: false });
    expect(logged).toHaveBeenCalledExactlyOnceWith(offline);

    const second = deferred<Manifest>();
    fetched.mockReturnValueOnce(second.promise);
    loaded.mockResolvedValue(IMAGE);
    const retry = state().loadManifest();
    expect(state().manifest).toEqual({ status: "error", failure: "unreachable", retrying: true });
    expect(fetched).toHaveBeenLastCalledWith(true);

    second.resolve(manifest);
    await retry;
    expect(state().manifest.status).toBe("ready");
  });

  it("tells a data file this version cannot read from a server that cannot be reached", async () => {
    fetched.mockRejectedValueOnce(new ManifestError("manifest.maps is empty"));
    await state().loadManifest();
    expect(state().manifest).toEqual({ status: "error", failure: "refused", retrying: false });
  });

  it("tries a failed image again when asked, once and afresh", async () => {
    loaded.mockRejectedValueOnce(new Error("not an image"));
    await state().loadMinimap(rift);
    expect(state().minimaps.GrandRift).toEqual({ status: "error", failure: "unreachable", retrying: false });

    const second = deferred<HTMLImageElement>();
    loaded.mockReturnValueOnce(second.promise);
    const retry = state().loadMinimap(rift);
    void state().loadMinimap(rift); // "Try again" pressed a second time while the first try is still on its way
    expect(state().minimaps.GrandRift).toEqual({ status: "error", failure: "unreachable", retrying: true });

    second.resolve(IMAGE);
    await retry;
    expect(state().minimaps.GrandRift).toEqual({ status: "ready", value: IMAGE });
    expect(loaded.mock.calls).toEqual([
      [urlOf(rift), false],
      [urlOf(rift), true],
    ]);
  });
});

describe("views", () => {
  const view = { x: 800, y: 900, zoom: 2 };

  it("keeps one view per map, and none for a fitted map", () => {
    state().setView("Lockdown", view);
    state().setView("GrandRift", { ...view, zoom: 3 });
    expect(state().views).toEqual({ Lockdown: view, GrandRift: { ...view, zoom: 3 } });
    state().setView("Lockdown", null);
    expect(state().views).toEqual({ GrandRift: { ...view, zoom: 3 } });
  });

  it("tells nobody about a view that did not change", () => {
    const told = vi.fn();
    const stop = useAppStore.subscribe(told);
    state().setView("Lockdown", null); // fitted already
    state().setView("Lockdown", view);
    state().setView("Lockdown", { ...view }); // the same numbers
    state().setView("Lockdown", null);
    state().setView("Lockdown", null);
    stop();
    expect(told).toHaveBeenCalledTimes(2);
  });
});
