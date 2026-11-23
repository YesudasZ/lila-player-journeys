import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchBundle } from "../data/fetchBundle.ts";
import { fetchManifest } from "../data/fetchManifest.ts";
import { loadImage } from "../data/loadImage.ts";
import { decodeLink } from "../lib/link.ts";
import { journeysOf, manifest } from "../testing/committed.ts";
import { currentAddress, startLinkSync } from "./linkSync.ts";
import { useAppStore } from "./store.ts";

vi.mock("../data/fetchManifest.ts", () => ({ fetchManifest: vi.fn() }));
vi.mock("../data/loadImage.ts", () => ({ loadImage: vi.fn() }));
vi.mock("../data/fetchBundle.ts", () => ({ fetchBundle: vi.fn() }));

// A stand-in for the address bar: the test runs without a browser.
const address = { origin: "https://tool.example", pathname: "/", search: "", hash: "" };
const written: string[] = [];
const state = () => useAppStore.getState();
const loadFrom = async (query: string) => {
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
  Object.assign(address, { search: "", hash: "" });
  written.length = 0;
  vi.stubGlobal("location", address);
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("history", {
    state: null,
    pushState: () => {
      throw new Error("the address has to be rewritten in place");
    },
    replaceState: (_: unknown, __: string, url: string) => {
      written.push(url);
      address.search = url.includes("?") ? url.slice(url.indexOf("?")) : "";
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the view in the address", () => {
  it("leaves the address the page was opened with alone until the manifest is there, also when it fails", async () => {
    address.search = "?map=Lockdown&fate=killed";
    vi.mocked(fetchManifest).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.useFakeTimers();
    const stop = startLinkSync();
    await state().loadManifest(decodeLink(address.search));
    vi.advanceTimersByTime(5000);
    expect(written).toEqual([]);
    expect(currentAddress()).toBe("https://tool.example/?map=Lockdown&fate=killed");
    stop();
  });

  it("is rewritten in place, once, 300 ms after the last of several changes", async () => {
    await loadFrom("?map=Lockdown");
    vi.useFakeTimers();
    const stop = startLinkSync();
    state().toggleDay("February_10");
    vi.advanceTimersByTime(200);
    state().toggleDay("February_14");
    vi.advanceTimersByTime(200);
    state().toggleFate("killed");
    vi.advanceTimersByTime(299);
    expect(written).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(written).toEqual(["/?map=Lockdown&days=February_10,February_14&fate=killed"]);
    vi.advanceTimersByTime(5000);
    expect(written).toHaveLength(1);
    stop();
  });

  it("is not rewritten when the view reads the same as the address, and keeps what follows a #", async () => {
    address.search = "?map=GrandRift";
    address.hash = "#notes";
    await loadFrom(address.search);
    vi.useFakeTimers();
    const stop = startLinkSync();
    state().setFocus(null); // a change of state that changes nothing in the link
    state().setView("GrandRift", null);
    vi.advanceTimersByTime(1000);
    expect(written).toEqual([]);
    state().toggleFate("killed");
    vi.advanceTimersByTime(300);
    expect(written).toEqual(["/?map=GrandRift&fate=killed#notes"]);
    stop();
  });

  it("gives the address of the view at once for the copy button, before the address bar has caught up", async () => {
    await loadFrom("");
    vi.useFakeTimers();
    const stop = startLinkSync();
    state().selectMatch("AmbroseValley", "fbbc5d02");
    expect(written).toEqual([]);
    expect(currentAddress()).toBe("https://tool.example/?match=fbbc5d02");
    stop();
  });

  it("writes nothing after it was stopped", async () => {
    await loadFrom("");
    vi.useFakeTimers();
    const stop = startLinkSync();
    state().toggleDay("February_11");
    stop();
    vi.advanceTimersByTime(1000);
    state().toggleDay("February_12");
    vi.advanceTimersByTime(1000);
    expect(written).toEqual([]);
  });
});
