import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { fetchBundle } from "../data/fetchBundle.ts";
import { fetchManifest } from "../data/fetchManifest.ts";
import { loadImage } from "../data/loadImage.ts";
import type { Manifest, MapEntry } from "../lib/manifest.ts";
import { DataError } from "../lib/reader.ts";
import { journeysOf, manifest, mapOf } from "../testing/committed.ts";
import { decodeLink, encodeLink } from "../lib/link.ts";
import { selectDrawList, selectLink, selectMatchId } from "./shown.ts";
import { useAppStore } from "./store.ts";

// The store is tested with the real manifest and without a network: the two loaders are stand-ins.
vi.mock("../data/fetchManifest.ts", () => ({ fetchManifest: vi.fn() }));
vi.mock("../data/loadImage.ts", () => ({ loadImage: vi.fn() }));
vi.mock("../data/fetchBundle.ts", () => ({ fetchBundle: vi.fn() }));

const fetched = vi.mocked(fetchManifest);
const loaded = vi.mocked(loadImage);
const bundled = vi.mocked(fetchBundle);
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
  bundled.mockImplementation((map) => Promise.resolve(journeysOf(map.id)));
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
    fetched.mockRejectedValueOnce(new DataError("manifest.maps is empty"));
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

describe("journeys", () => {
  const ready = async () => {
    fetched.mockResolvedValue(manifest);
    loaded.mockResolvedValue(IMAGE);
    await state().loadManifest();
    await vi.waitFor(() => {
      expect(state().journeys.AmbroseValley?.status).toBe("ready");
    });
  };

  it("are loaded for the first map with the manifest, and for another map when it is opened, once", async () => {
    await ready();
    expect(bundled.mock.calls).toEqual([[ambrose, manifest, false]]);

    state().selectMap("Lockdown");
    state().selectMap("AmbroseValley");
    state().selectMap("Lockdown");
    await vi.waitFor(() => {
      expect(state().journeys.Lockdown?.status).toBe("ready");
    });
    expect(bundled.mock.calls.map(([map]) => map.id)).toEqual(["AmbroseValley", "Lockdown"]);
    expect(state().journeys.GrandRift).toBeUndefined();
  });

  it("are not asked for before the manifest is there", async () => {
    await state().loadJourneys(rift);
    expect(bundled).not.toHaveBeenCalled();
    expect(state().journeys).toEqual({});
  });

  it("keep the kind of a failure and are asked for afresh on the next try", async () => {
    await ready();
    bundled.mockRejectedValueOnce(new DataError("bundle.map is not GrandRift"));
    await state().loadJourneys(rift);
    expect(state().journeys.GrandRift).toEqual({ status: "error", failure: "refused", retrying: false });

    await state().loadJourneys(rift);
    expect(bundled).toHaveBeenLastCalledWith(rift, manifest, true);
    expect(state().journeys.GrandRift?.status).toBe("ready");
  });
});

describe("what is shown", () => {
  const ready = async () => {
    fetched.mockResolvedValue(manifest);
    loaded.mockResolvedValue(IMAGE);
    await state().loadManifest();
    await vi.waitFor(() => {
      expect(selectDrawList(state())).not.toBeNull();
    });
  };

  it("is nothing until the journeys of the open map are there", () => {
    expect(selectDrawList(state())).toBeNull();
    expect(selectMatchId(state())).toBeNull();
  });

  it("is all matches of the open map at first, without loot", async () => {
    await ready();
    const list = selectDrawList(state());
    expect([list?.single, list?.matches, list?.journeys.length]).toEqual([false, 566, 836]);
    expect(list?.markers.some((marker) => marker.kind === "loot")).toBe(false);
    expect(list?.counts.loot).toBe(9902);
  });

  it("is one draw list for one state: asking again builds nothing", async () => {
    await ready();
    expect(selectDrawList(state())).toBe(selectDrawList(state()));
    const before = selectDrawList(state());
    state().setView("AmbroseValley", { x: 10, y: 20, zoom: 2 }); // a view changes nothing that is drawn
    state().setFocus("fbbc5d02-anon");
    expect(selectDrawList(state())).toBe(before);
  });

  it("is one match with its loot when a match is opened, and all matches again with null", async () => {
    await ready();
    state().selectMatch("AmbroseValley", "fbbc5d02");
    expect(selectMatchId(state())).toBe("fbbc5d02");
    const list = selectDrawList(state());
    expect([list?.single, list?.journeys.length]).toEqual([true, 16]);
    const loot = list?.markers.filter((marker) => marker.kind === "loot") ?? [];
    expect(loot.reduce((rows, marker) => rows + marker.count, 0)).toBe(7);
    expect(loot).toHaveLength(6); // two of the 7 loot rows are at one spot, so they are one marker

    state().selectMatch("AmbroseValley", null);
    expect(state().matches).toEqual({});
    expect(selectDrawList(state())?.journeys).toHaveLength(836);
  });

  it("is the newly opened match when one match follows another, whatever the switches", async () => {
    await ready();
    state().setShown("loot", true); // so that nothing but the match changes between the two lists
    state().selectMatch("AmbroseValley", "fbbc5d02");
    expect(selectDrawList(state())?.journeys).toHaveLength(16);
    state().selectMatch("AmbroseValley", "a476eb57");
    const list = selectDrawList(state());
    expect(list?.journeys.map((drawn) => drawn.journey.match)).toEqual(["a476eb57"]);
    expect(list?.counts).toMatchObject({ humans: 1, bots: 0, kill: 10, loot: 58 });
  });

  it("drops the focus when the journeys of one kind are hidden, and keeps it when a marker kind is", async () => {
    await ready();
    state().setFocus("fbbc5d02-anon");
    state().setShown("kill", false);
    expect(state().focus).toBe("fbbc5d02-anon");
    state().setShown("bots", false);
    expect(state().focus).toBeNull();
    state().setFocus("fbbc5d02-anon");
    state().setShown("bots", true); // showing them again takes no focus away
    expect(state().focus).toBe("fbbc5d02-anon");
  });

  it("ignores a match the manifest does not have on that map", async () => {
    await ready();
    state().selectMatch("AmbroseValley", "no-such-match");
    state().selectMatch("Lockdown", "fbbc5d02"); // a match of Ambrose Valley
    expect(state().matches).toEqual({});
  });

  it("keeps the open match of each map while the tabs change", async () => {
    await ready();
    state().selectMatch("AmbroseValley", "fbbc5d02");
    state().selectMap("Lockdown");
    expect(selectMatchId(state())).toBeNull();
    state().selectMap("AmbroseValley");
    expect(selectMatchId(state())).toBe("fbbc5d02");
  });

  it("follows a switch set by hand in both views", async () => {
    await ready();
    state().setShown("loot", true);
    state().setShown("bots", false);
    const all = selectDrawList(state());
    expect(all?.markers.some((marker) => marker.kind === "loot")).toBe(true);
    expect(all?.journeys.every((drawn) => drawn.journey.actor === "human")).toBe(true);
    expect(all?.counts.bots).toBe(268);

    state().setShown("loot", false);
    state().selectMatch("AmbroseValley", "fbbc5d02");
    expect(selectDrawList(state())?.markers.some((marker) => marker.kind === "loot")).toBe(false);
  });

  it("drops the focus when another match or another map is opened", async () => {
    await ready();
    state().setFocus("fbbc5d02-anon");
    state().selectMatch("AmbroseValley", "fbbc5d02");
    expect(state().focus).toBeNull();
    state().setFocus("fbbc5d02-anon");
    state().selectMap("Lockdown");
    expect(state().focus).toBeNull();
  });
});

describe("filters", () => {
  const ready = async (query = "") => {
    fetched.mockResolvedValue(manifest);
    loaded.mockResolvedValue(IMAGE);
    await state().loadManifest(decodeLink(query));
    await vi.waitFor(() => {
      expect(selectDrawList(state())).not.toBeNull();
    });
  };

  it("narrow what is drawn to the chosen days, kept in the order of the data", async () => {
    await ready();
    state().toggleDay("February_14");
    state().toggleDay("February_10");
    expect(state().days).toEqual(["February_10", "February_14"]);
    expect(selectDrawList(state())?.matches).toBe(223);
    state().toggleDay("February_10");
    expect(state().days).toEqual(["February_14"]);
    expect(selectDrawList(state())?.matches).toBe(24);
  });

  it("close an open match that the chosen days rule out, and keep one they leave", async () => {
    await ready();
    state().selectMatch("AmbroseValley", "fbbc5d02"); // a match of 12 February
    state().toggleDay("February_12");
    expect(selectMatchId(state())).toBe("fbbc5d02");
    state().toggleDay("February_12");
    state().toggleDay("February_10");
    expect(selectMatchId(state())).toBeNull();
    state().selectMatch("AmbroseValley", "fbbc5d02"); // not offered while only 10 February is chosen
    expect(selectMatchId(state())).toBeNull();
  });

  it("close an open match that has no journey of the chosen fates", async () => {
    await ready();
    state().selectMatch("AmbroseValley", "a476eb57"); // one human, no death recorded
    state().toggleFate("no_death_recorded");
    expect(selectMatchId(state())).toBe("a476eb57");
    state().toggleFate("killed_by_storm");
    state().toggleFate("no_death_recorded");
    expect(state().fates).toEqual(["killed_by_storm"]);
    expect(selectMatchId(state())).toBeNull();
    expect(selectDrawList(state())?.counts).toMatchObject({ humans: 17, bots: 0 });
  });

  it("drop the focus when a filter changes, and go back to everything on clear", async () => {
    await ready();
    state().setFocus("fbbc5d02-anon");
    state().toggleFate("killed");
    expect(state().focus).toBeNull();
    state().toggleDay("February_13");
    state().clearFilters();
    expect([state().days, state().fates]).toEqual([[], []]);
    expect(selectDrawList(state())?.journeys).toHaveLength(836);
  });
});

describe("a link", () => {
  const open = async (query: string) => {
    fetched.mockResolvedValue(manifest);
    loaded.mockResolvedValue(IMAGE);
    await state().loadManifest(decodeLink(query));
    await vi.waitFor(() => {
      expect(Object.values(state().journeys)[0]?.status).toBe("ready");
    });
    return encodeLink(selectLink(state()) ?? decodeLink(""));
  };

  it("is nothing for the view the tool starts with, also after a move back to fit", async () => {
    expect(selectLink(state())).toBeNull(); // nothing is written before the manifest is there
    expect(await open("")).toBe("");
    state().setView("AmbroseValley", { x: 1000, y: 900, zoom: 2 });
    expect(encodeLink(selectLink(state()) ?? decodeLink(""))).toBe("?view=1000,900,2");
    state().setView("AmbroseValley", null);
    expect(encodeLink(selectLink(state()) ?? decodeLink(""))).toBe("");
  });

  it("opens the map, days, match, focus, switches, fates and view it names, and is written back as it came", async () => {
    const query = "?map=GrandRift&days=February_10,February_11,February_12,February_13,February_14&match=0273e16e&journey=0273e16e-94d042cb&show=loot&hide=bots&fate=no_death_recorded&view=1024.5,980.2,2.5";
    expect(await open(query)).toBe(query);
    expect(state().mapId).toBe("GrandRift");
    expect(bundled.mock.calls.map(([map]) => map.id)).toEqual(["GrandRift"]);
    expect(state().views).toEqual({ GrandRift: { x: 1024.5, y: 980.2, zoom: 2.5 } });
    const list = selectDrawList(state());
    expect([list?.single, list?.journeys.map((drawn) => drawn.journey.id)]).toEqual([true, ["0273e16e-94d042cb"]]);
  });

  it("keeps what the data has of a link and drops the rest", async () => {
    expect(await open("?map=Lockdown&match=fbbc5d02&days=February_30,February_11&journey=nobody&hide=paths,loot&view=7")).toBe("?map=Lockdown&days=February_11&hide=loot");
    expect(state().focus).toBeNull(); // no journey of Lockdown has that id
  });

  it("keeps the link the page was opened with when the manifest has to be fetched a second time", async () => {
    fetched.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await state().loadManifest(decodeLink("?map=Lockdown&fate=killed"));
    expect(state().manifest.status).toBe("error");
    fetched.mockResolvedValue(manifest);
    loaded.mockResolvedValue(IMAGE);
    await state().loadManifest();
    expect([state().mapId, state().fates]).toEqual(["Lockdown", ["killed"]]);
  });
});
