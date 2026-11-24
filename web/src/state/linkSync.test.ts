import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchBundle } from "../data/fetchBundle.ts";
import { fetchManifest } from "../data/fetchManifest.ts";
import { loadImage } from "../data/loadImage.ts";
import { decodeLink } from "../lib/link.ts";
import { journeysOf, manifest } from "../testing/committed.ts";
import { currentAddress, startLinkSync } from "./linkSync.ts";
import { playback, seek, startPlayback } from "./playback.ts";
import { selectMatchId } from "./shown.ts";
import { useAppStore } from "./store.ts";

vi.mock("../data/fetchManifest.ts", () => ({ fetchManifest: vi.fn() }));
vi.mock("../data/loadImage.ts", () => ({ loadImage: vi.fn() }));
vi.mock("../data/fetchBundle.ts", () => ({ fetchBundle: vi.fn() }));

// Stand-ins for the address bar, the history and the window: the test runs without a browser.
const address = { origin: "https://tool.example", pathname: "/", search: "", hash: "" };
/** Every write to the history, in order: "push" for a new entry, "replace" for the one it stands on, then the address. */
const written: string[] = [];
const listeners = new Map<string, () => void>();
const writes = (kind: string) => (_: unknown, __: string, url: string) => {
  written.push(`${kind} ${url}`);
  const [path] = url.split("#");
  address.search = path.includes("?") ? path.slice(path.indexOf("?")) : "";
};
/** What Back and Forward do: the address is another entry's, and the page is told. */
const land = (query: string) => {
  address.search = query;
  listeners.get("popstate")?.();
};
const state = () => useAppStore.getState();
const clock = () => playback.getState();
const started: (() => void)[] = [];
/** Start the sync. It is stopped after the test whatever happens in it, so that no test hears another. */
const sync = () => {
  const stop = startLinkSync();
  started.push(stop);
  return stop;
};
/** Start the clock's follower. As in the app, it has to be started before the sync. */
const followClock = () => {
  started.push(startPlayback());
};
/** Open the page at an address and wait until the journeys of its map are there. */
const loadFrom = async (query: string) => {
  address.search = query;
  await state().loadManifest(decodeLink(query));
  await vi.waitFor(() => {
    expect(Object.values(state().journeys)[0]?.status).toBe("ready");
  });
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchManifest).mockResolvedValue(manifest);
  vi.mocked(loadImage).mockResolvedValue({} as HTMLImageElement);
  vi.mocked(fetchBundle).mockImplementation((map) => Promise.resolve(journeysOf(map.id)));
  vi.spyOn(console, "error").mockImplementation(() => {});
  useAppStore.setState(useAppStore.getInitialState(), true);
  playback.setState(playback.getInitialState(), true);
  Object.assign(address, { search: "", hash: "" });
  written.length = 0;
  listeners.clear();
  vi.stubGlobal("location", address);
  vi.stubGlobal("window", {
    setTimeout: (run: () => void, after: number) => globalThis.setTimeout(run, after), // looked up when called, so that fake timers are used
    clearTimeout: (timer: number) => {
      globalThis.clearTimeout(timer);
    },
    addEventListener: (type: string, listener: () => void) => listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type),
  });
  vi.stubGlobal("document", { hidden: false, addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal("history", { state: null, pushState: writes("push"), replaceState: writes("replace") });
});

afterEach(() => {
  for (const stop of started.splice(0)) stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the view in the address", () => {
  it("leaves the address the page was opened with alone until the manifest is there, also when it fails", async () => {
    address.search = "?map=Lockdown&fate=killed";
    vi.mocked(fetchManifest).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.useFakeTimers();
    const stop = sync();
    await state().loadManifest(decodeLink(address.search));
    vi.advanceTimersByTime(5000);
    expect(written).toEqual([]);
    expect(currentAddress()).toBe("https://tool.example/?map=Lockdown&fate=killed");
    stop();
  });

  it("gets a new entry for every step, at once", async () => {
    await loadFrom("?map=Lockdown");
    vi.useFakeTimers();
    const stop = sync();
    state().toggleDay("February_10");
    state().toggleDay("February_14");
    state().toggleFate("killed");
    expect(written).toEqual([
      "push /?map=Lockdown&days=February_10",
      "push /?map=Lockdown&days=February_10,February_14",
      "push /?map=Lockdown&days=February_10,February_14&fate=killed",
    ]);
    vi.advanceTimersByTime(5000);
    expect(written).toHaveLength(3);
    stop();
  });

  it("gets one for every kind of step: a match, a focus, a switch, a heat layer, the clearing of the filters, and a map", async () => {
    await loadFrom("?days=February_12");
    vi.useFakeTimers();
    const stop = sync();
    state().selectMatch("AmbroseValley", "fbbc5d02");
    state().setFocus("fbbc5d02-anon");
    state().setShown("kill", false);
    state().setHeat("death");
    state().clearFilters();
    state().selectMap("Lockdown");
    expect(written).toEqual([
      "push /?days=February_12&match=fbbc5d02",
      "push /?days=February_12&match=fbbc5d02&journey=fbbc5d02-anon",
      "push /?days=February_12&match=fbbc5d02&journey=fbbc5d02-anon&hide=kill",
      "push /?days=February_12&match=fbbc5d02&journey=fbbc5d02-anon&hide=kill&heat=death",
      "push /?match=fbbc5d02&journey=fbbc5d02-anon&hide=kill&heat=death",
      "push /?map=Lockdown&hide=kill&heat=death",
    ]);
    stop();
  });

  it("is rewritten in place while the map is moved, once, 300 ms after the last move", async () => {
    await loadFrom("");
    vi.useFakeTimers();
    const stop = sync();
    state().setView("AmbroseValley", { x: 1000, y: 900, zoom: 2 });
    vi.advanceTimersByTime(200);
    state().setView("AmbroseValley", { x: 1010, y: 900, zoom: 2 });
    vi.advanceTimersByTime(299);
    expect(written).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(written).toEqual(["replace /?view=1010,900,2"]);
    vi.advanceTimersByTime(5000);
    expect(written).toHaveLength(1);
    stop();
  });

  it("gives the entry that a step leaves its last view, then adds the new one", async () => {
    await loadFrom("");
    vi.useFakeTimers();
    const stop = sync();
    state().setView("AmbroseValley", { x: 1000, y: 900, zoom: 2 }); // not written yet when the step comes
    state().toggleDay("February_12");
    expect(written).toEqual(["replace /?view=1000,900,2", "push /?days=February_12&view=1000,900,2"]);
    vi.advanceTimersByTime(5000);
    expect(written).toHaveLength(2);
    stop();
  });

  it("is put into its canonical form in place, also by what the arrival of the journeys corrects", async () => {
    const stop = sync();
    await loadFrom("?fate=killed_by_storm&match=a476eb57"); // the fate rules the match out, which the journeys show
    await vi.waitFor(() => {
      expect(written).toEqual(["replace /?fate=killed_by_storm"]);
    });
    stop();
  });

  it("is not written when a step changes nothing in it, and keeps what follows a #", async () => {
    address.hash = "#notes";
    await loadFrom("?map=GrandRift");
    vi.useFakeTimers();
    const stop = sync();
    state().setView("GrandRift", null); // fitted as it was
    state().setFocus(null); // a click on the empty map
    vi.advanceTimersByTime(1000);
    expect(written).toEqual([]);
    state().toggleFate("killed");
    expect(written).toEqual(["push /?map=GrandRift&fate=killed#notes"]);
    stop();
  });

  it("gives the address of the view at once for the copy button, before the address bar has caught up", async () => {
    await loadFrom("");
    vi.useFakeTimers();
    const stop = sync();
    state().setView("AmbroseValley", { x: 1000, y: 900, zoom: 2 });
    expect(written).toEqual([]);
    expect(currentAddress()).toBe("https://tool.example/?view=1000,900,2");
    stop();
  });

  it("falls behind and harms nothing else when the browser refuses a write, and catches up with the next one", async () => {
    await loadFrom("");
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    const refuse = () => {
      throw new Error("SecurityError: too many calls to the history");
    };
    vi.stubGlobal("history", { state: null, pushState: refuse, replaceState: writes("replace") });
    vi.useFakeTimers();
    const stop = sync();
    expect(() => {
      state().toggleDay("February_12");
    }).not.toThrow();
    expect([state().days, written, warned.mock.calls.length]).toEqual([["February_12"], [], 1]);
    state().setView("AmbroseValley", { x: 1000, y: 900, zoom: 2 });
    vi.advanceTimersByTime(300);
    expect(written).toEqual(["replace /?days=February_12&view=1000,900,2"]);
    stop();
  });
});

describe("the time of playback in the address", () => {
  it("is written when it comes to rest, in place, and never while the match plays", async () => {
    followClock();
    await loadFrom("?match=fbbc5d02");
    vi.useFakeTimers();
    const stop = sync();
    seek(120.46);
    vi.advanceTimersByTime(300);
    expect(written).toEqual(["replace /?match=fbbc5d02&t=120.5"]);

    playback.setState({ playing: true, time: 200 }); // as while it plays
    state().setView("AmbroseValley", { x: 1000, y: 900, zoom: 2 });
    playback.setState({ time: 250 });
    vi.advanceTimersByTime(5000);
    expect(written).toHaveLength(1);
    expect(currentAddress()).toBe("https://tool.example/?match=fbbc5d02&t=250&view=1000,900,2"); // the copy button gives the moment

    playback.setState({ playing: false, time: 300 }); // the pause
    vi.advanceTimersByTime(299);
    expect(written).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(written).toEqual(["replace /?match=fbbc5d02&t=120.5", "replace /?match=fbbc5d02&t=300&view=1000,900,2"]);

    seek(523); // the end, where the whole match is shown
    vi.advanceTimersByTime(300);
    expect(written.at(-1)).toBe("replace /?match=fbbc5d02&view=1000,900,2");
    expect(written.every((entry) => entry.startsWith("replace "))).toBe(true); // a pause or a seek never adds an entry
    stop();
  });

  it("goes with a step that is taken while the match plays: the entry that is left holds that moment, and so does the new one", async () => {
    followClock();
    await loadFrom("?match=fbbc5d02");
    vi.useFakeTimers();
    const stop = sync();
    playback.setState({ playing: true, time: 200.04 }); // as while it plays
    state().setShown("kill", false);
    expect(written).toEqual(["replace /?match=fbbc5d02&t=200", "push /?match=fbbc5d02&t=200&hide=kill"]);
    playback.setState({ time: 250 });
    vi.advanceTimersByTime(5000);
    expect(written).toHaveLength(2); // the passing of time is still not written
    stop();
  });

  it("stays with the entry that a step leaves, also when that step opens another match and so sets the clock anew", async () => {
    followClock();
    await loadFrom("?match=fbbc5d02");
    vi.useFakeTimers();
    const stop = sync();
    seek(120.46); // not written yet when the step comes
    state().selectMatch("AmbroseValley", "a476eb57");
    expect([clock().end, clock().time]).toEqual([780, 780]);
    expect(written).toEqual(["replace /?match=fbbc5d02&t=120.5", "push /?match=a476eb57"]);
    state().setShown("kill", false); // a step right after: the new match is shown whole, and the entry it leaves says so
    expect(written.slice(2)).toEqual(["push /?match=a476eb57&hide=kill"]);
    seek(60);
    state().selectMatch("AmbroseValley", null); // "All matches", which has no clock
    expect(written.slice(3)).toEqual(["replace /?match=a476eb57&t=60&hide=kill", "push /?hide=kill"]);
    vi.advanceTimersByTime(5000);
    expect(written).toHaveLength(5);
    stop();
  });
});

describe("Back and Forward", () => {
  it("open the view of the entry they land on, and add none", async () => {
    await loadFrom("");
    vi.useFakeTimers();
    const stop = sync();
    state().selectMap("Lockdown");
    state().toggleFate("killed");
    state().setHeat("movement");
    const steps = state().steps;
    land("?map=Lockdown&fate=killed");
    expect([state().mapId, state().fates, state().heat]).toEqual(["Lockdown", ["killed"], null]);
    land("?map=Lockdown");
    expect([state().mapId, state().fates]).toEqual(["Lockdown", []]);
    land("");
    expect(state().mapId).toBe("AmbroseValley");
    land("?map=Lockdown&fate=killed&heat=movement");
    expect([state().mapId, state().fates, state().heat, state().steps]).toEqual(["Lockdown", ["killed"], "movement", steps]);
    vi.advanceTimersByTime(5000);
    expect(written).toEqual(["push /?map=Lockdown", "push /?map=Lockdown&fate=killed", "push /?map=Lockdown&fate=killed&heat=movement"]);
    stop();
  });

  it("open the entry at its time of playback, paused, also when its match is open already", async () => {
    followClock();
    await loadFrom("?match=fbbc5d02");
    vi.useFakeTimers();
    const stop = sync();
    seek(120.46);
    state().selectMatch("AmbroseValley", "a476eb57");
    land("?match=fbbc5d02&t=120.5"); // Back
    expect([selectMatchId(state()), clock().end, clock().time, clock().playing]).toEqual(["fbbc5d02", 523, 120.5, false]);

    state().setFocus("fbbc5d02-anon");
    playback.setState({ playing: true, time: 300 }); // it plays on in the new entry
    land("?match=fbbc5d02&t=120.5"); // Back, to before the focus: the same match
    expect([state().focus, clock().time, clock().playing]).toEqual([null, 120.5, false]);

    land("?match=a476eb57"); // an entry without a time shows its match whole
    expect([clock().end, clock().time]).toEqual([780, 780]);
    vi.advanceTimersByTime(5000);
    expect(written).toEqual(["replace /?match=fbbc5d02&t=120.5", "push /?match=a476eb57", "push /?match=fbbc5d02&t=120.5&journey=fbbc5d02-anon"]);
    stop();
  });

  it("drop a move of the map that was not written yet: it belonged to the entry that was left", async () => {
    await loadFrom("");
    vi.useFakeTimers();
    const stop = sync();
    state().selectMap("Lockdown");
    state().setView("Lockdown", { x: 4000, y: 4000, zoom: 3 });
    land("");
    vi.advanceTimersByTime(5000);
    expect(written).toEqual(["push /?map=Lockdown"]);
    stop();
  });

  it("are not heard, and nothing is written, after the sync was stopped", async () => {
    await loadFrom("");
    vi.useFakeTimers();
    const stop = sync();
    state().setView("AmbroseValley", { x: 1000, y: 900, zoom: 2 });
    stop();
    vi.advanceTimersByTime(1000);
    state().toggleDay("February_12");
    expect(written).toEqual([]);
    expect(listeners.size).toBe(0);
  });
});
