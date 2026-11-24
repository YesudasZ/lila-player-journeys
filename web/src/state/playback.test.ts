import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchBundle } from "../data/fetchBundle.ts";
import { fetchManifest } from "../data/fetchManifest.ts";
import { loadImage } from "../data/loadImage.ts";
import { decodeLink } from "../lib/link.ts";
import { journeysOf, manifest } from "../testing/committed.ts";
import { linkTime, pause, play, playback, seek, setSpeed, startPlayback, togglePlay } from "./playback.ts";
import { useAppStore } from "./store.ts";

vi.mock("../data/fetchManifest.ts", () => ({ fetchManifest: vi.fn() }));
vi.mock("../data/loadImage.ts", () => ({ loadImage: vi.fn() }));
vi.mock("../data/fetchBundle.ts", () => ({ fetchBundle: vi.fn() }));

// Stand-ins for the browser's frames and its document: the test runs without a browser.
let now = 0;
let frames: ((time: number) => void)[] = [];
const listeners = new Map<string, () => void>();
const page = { hidden: false };
/** Let some milliseconds of real time pass, then run the frame that was asked for. */
const frame = (milliseconds: number) => {
  now += milliseconds;
  const due = frames;
  frames = [];
  for (const run of due) run(now);
};
const app = () => useAppStore.getState();
const clock = () => playback.getState();
const open = async (query = "") => {
  await app().loadManifest(decodeLink(query));
  await vi.waitFor(() => {
    expect(Object.values(app().journeys)[0]?.status).toBe("ready");
  });
};
let stop = () => {};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchManifest).mockResolvedValue(manifest);
  vi.mocked(loadImage).mockResolvedValue({} as HTMLImageElement);
  vi.mocked(fetchBundle).mockImplementation((map) => Promise.resolve(journeysOf(map.id)));
  vi.spyOn(console, "error").mockImplementation(() => {});
  useAppStore.setState(useAppStore.getInitialState(), true);
  playback.setState(playback.getInitialState(), true);
  now = 1000;
  frames = [];
  listeners.clear();
  page.hidden = false;
  vi.stubGlobal("requestAnimationFrame", (run: (time: number) => void) => frames.push(run));
  vi.stubGlobal("cancelAnimationFrame", () => {
    frames = [];
  });
  vi.stubGlobal("document", {
    get hidden() {
      return page.hidden;
    },
    addEventListener: (type: string, listener: () => void) => listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type),
  });
  stop = startPlayback();
});

afterEach(() => {
  stop();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the clock of playback", () => {
  it("ends where the recorded span of the open match ends: 523 s, 780 s and 878 s for the three named matches", async () => {
    await open();
    expect(clock()).toEqual({ end: null, time: 0, playing: false, speed: 10 });
    for (const [id, span] of [
      ["fbbc5d02", 523],
      ["a476eb57", 780],
      ["5a081fe4", 878],
    ] as const) {
      app().selectMatch("AmbroseValley", id);
      expect([clock().end, clock().time, clock().playing]).toEqual([span, span, false]); // a match opens whole
      expect(manifest.matches.find((match) => match.id === id)?.span).toBe(span);
    }
    app().selectMatch("AmbroseValley", null);
    expect([clock().end, clock().time]).toEqual([null, 0]);
  });

  it("starts from 0:00 when Play is pressed at the end, and moves by the real time that passes times the speed", async () => {
    await open("?match=fbbc5d02");
    play();
    expect([clock().time, clock().playing]).toEqual([0, true]);
    frame(16); // the first frame only sets the time to count from
    expect(clock().time).toBe(0);
    frame(50);
    expect(clock().time).toBeCloseTo(0.5, 10); // 50 ms at 10x
    setSpeed(60);
    frame(100);
    expect(clock().time).toBeCloseTo(6.5, 10);
  });

  it("runs one clock, however often Play is asked for", async () => {
    await open("?match=fbbc5d02");
    play();
    play();
    expect(frames.length).toBe(1);
    frame(16);
    frame(100);
    expect(clock().time).toBeCloseTo(1, 10); // 100 ms at 10x, counted once
  });

  it("counts at most 100 ms for a frame that comes late", async () => {
    await open("?match=fbbc5d02");
    play();
    frame(16);
    frame(30_000); // half a minute without a frame
    expect(clock().time).toBeCloseTo(1, 10); // 100 ms at 10x, not 300 s
    expect(clock().playing).toBe(true);
  });

  it("rounds the time to a tenth of a second when it pauses, and goes on from there", async () => {
    await open("?match=fbbc5d02");
    play();
    frame(16);
    frame(33);
    expect(clock().time).toBeCloseTo(0.33, 10);
    pause();
    expect([clock().time, clock().playing, frames.length]).toEqual([0.3, false, 0]);
    frame(1000);
    expect(clock().time).toBe(0.3);
    togglePlay();
    frame(16);
    frame(100);
    expect(clock().playing).toBe(true);
    expect(clock().time).toBeCloseTo(1.3, 10);
    togglePlay();
    expect(clock().playing).toBe(false);
  });

  it("stops at the end of the match, where the whole match is shown again", async () => {
    await open("?match=fbbc5d02");
    seek(522.9);
    play();
    expect(clock().time).toBe(522.9); // not at the end, so it plays on from here
    frame(16);
    frame(100);
    expect([clock().time, clock().playing, frames.length]).toEqual([523, false, 0]);
  });

  it("pauses when the tab is hidden, so that coming back never finds the match ahead", async () => {
    await open("?match=fbbc5d02");
    play();
    frame(16);
    frame(50);
    listeners.get("visibilitychange")?.(); // something else changed while the tab is still shown: nothing to stop for
    expect(clock().playing).toBe(true);
    page.hidden = true;
    listeners.get("visibilitychange")?.();
    expect([clock().playing, clock().time, frames.length]).toEqual([false, 0.5, 0]);
    page.hidden = false;
    listeners.get("visibilitychange")?.();
    expect(clock().playing).toBe(false); // it waits for Play
  });

  it("goes to a time inside the match, to a tenth of a second, and plays on from there", async () => {
    await open("?match=fbbc5d02");
    seek(120.46);
    expect(clock().time).toBe(120.5);
    seek(-5);
    expect(clock().time).toBe(0);
    seek(9999);
    expect(clock().time).toBe(523);
    seek(45.04);
    expect(clock().time).toBe(45);
    play();
    seek(200);
    frame(16);
    frame(100);
    expect(clock().playing).toBe(true);
    expect(clock().time).toBeCloseTo(201, 10);
  });

  it("has nothing to play or to seek while all matches are shown", async () => {
    await open();
    play();
    seek(50);
    togglePlay();
    expect([clock(), frames.length]).toEqual([{ end: null, time: 0, playing: false, speed: 10 }, 0]);
  });

  it("starts a newly opened match whole and paused, also after a match that was playing, and keeps its time through other changes", async () => {
    await open("?match=fbbc5d02");
    play();
    frame(16);
    frame(50);
    app().selectMatch("AmbroseValley", "a476eb57");
    expect([clock().end, clock().time, clock().playing, frames.length]).toEqual([780, 780, false, 0]);
    seek(100);
    app().setShown("kill", false);
    app().setFocus("a476eb57-bf5be0f1");
    app().setView("AmbroseValley", { x: 1000, y: 900, zoom: 2 });
    expect(clock().time).toBe(100);
  });

  it("takes the time of the link the page was opened with, once", async () => {
    await open("?match=fbbc5d02&t=120.46");
    expect([clock().end, clock().time, clock().playing]).toEqual([523, 120.5, false]);
    app().selectMatch("AmbroseValley", "a476eb57");
    app().selectMatch("AmbroseValley", "fbbc5d02");
    expect(clock().time).toBe(523); // opened by hand, it is whole
  });

  it("opens the match of a link whole when the link's time is not one of that match", async () => {
    await open("?match=fbbc5d02&t=9999");
    expect([clock().end, clock().time]).toEqual([523, 523]);
  });

  it("says the time for a link: none at the end, and none while all matches are shown", async () => {
    await open("?match=fbbc5d02");
    expect(linkTime(clock())).toBeNull();
    seek(120.46);
    expect(linkTime(clock())).toBe(120.5);
    play();
    frame(16);
    frame(33);
    expect(linkTime(clock())).toBe(120.8); // 120.83 while it plays
    app().selectMatch("AmbroseValley", null);
    expect(linkTime(clock())).toBeNull();
  });

  it("stops for good when something pauses it from inside a frame", async () => {
    await open("?match=fbbc5d02");
    const unsubscribe = playback.subscribe((state) => {
      if (state.playing && state.time >= 0.5) pause();
    });
    play();
    frame(16);
    frame(50);
    expect([clock().playing, clock().time, frames.length]).toEqual([false, 0.5, 0]);
    frame(100);
    expect(clock().time).toBe(0.5);
    unsubscribe();
  });

  it("takes the open match and the time of the link also when it is started late", async () => {
    stop();
    await open("?match=fbbc5d02&t=120.46");
    expect(clock().end).toBeNull(); // nothing follows the app yet
    stop = startPlayback();
    expect([clock().end, clock().time, clock().playing]).toEqual([523, 120.5, false]);
  });

  it("stands still and hears nothing after it was stopped", async () => {
    await open("?match=fbbc5d02");
    play();
    stop();
    expect([clock().playing, frames.length, listeners.size]).toEqual([false, 0, 0]);
    app().selectMatch("AmbroseValley", "a476eb57");
    expect(clock().end).toBe(523);
  });
});
