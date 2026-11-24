import { describe, expect, it } from "vitest";

import { journeysOf, manifest, mapOf } from "../testing/committed.ts";
import fixture from "./__fixtures__/playback.json";
import { buildDrawList, eventKinds, shownLayers } from "./drawList.ts";
import { LONGEST_FRAME, SPEEDS, advance, draggedTime, happened, headAt, headsAt, momentAt, sliderKeyAction, sliderKeysHelp, ticksOf, timeAfter } from "./playback.ts";

const step = fixture.sample_step_seconds;

describe("where a journey's head is at a time", () => {
  it("is tested on the six cases of the pipeline's fixture, of which only the journey with one row is made up", () => {
    expect(fixture.cases.map((entry) => entry.case)).toEqual([
      "a 5 s step",
      "a long gap",
      "a death long after the last sample",
      "two rows in the same second",
      "not on the map at 0:00",
      "a journey with one row",
    ]);
    expect(fixture.cases.filter((entry) => entry.made_up).map((entry) => entry.case)).toEqual(["a journey with one row"]);
    expect(step).toBe(manifest.sample_step_seconds);
  });

  it.each(fixture.cases)("$case: every head of the fixture, exactly ($id)", (entry) => {
    expect(entry.heads.length).toBeGreaterThanOrEqual(4);
    for (const { at, head } of entry.heads) {
      const found = headAt(entry.t, entry.u, entry.v, entry.path_length, at, step);
      // The same arithmetic in the same order gives the same number, so nothing is rounded here.
      expect(found && [found.x, found.y], `at ${at} s`).toEqual(head);
    }
  });

  it("says which row of the path the head has reached", () => {
    const [t, x, y] = [[0, 5, 5, 30], [0, 10, 20, 40], [0, 0, 0, 0]];
    expect(headAt(t, x, y, 4, 2.5, 5)).toEqual({ x: 5, y: 0, row: 0 });
    expect(headAt(t, x, y, 4, 5, 5)).toEqual({ x: 20, y: 0, row: 2 }); // of two rows in one second the later
    expect(headAt(t, x, y, 4, 20, 5)).toEqual({ x: 20, y: 0, row: 2 }); // standing still in a long gap
    expect(headAt(t, x, y, 4, 27.5, 5)).toEqual({ x: 30, y: 0, row: 2 }); // half-way through its last step
    expect(headAt(t, x, y, 4, 99, 5)).toEqual({ x: 40, y: 0, row: 3 });
    expect(headAt(t, x, y, 3, 99, 5)).toEqual({ x: 20, y: 0, row: 2 }); // a row after the path does not move it
    expect(headAt(t, x, y, 4, -1, 5)).toBeNull();
    expect(headAt([], [], [], 0, 3, 5)).toBeNull();
  });
});

describe("the heads of a match at a time", () => {
  const map = mapOf("AmbroseValley");
  const grid = { steps: manifest.encoding.uv_steps, image: { width: map.minimap.width, height: map.minimap.height } };
  const list = buildDrawList(journeysOf("AmbroseValley"), "fbbc5d02", shownLayers({}, true), eventKinds(manifest.event_groups), grid);

  it("are at the ends of the paths once the match is over, and nowhere before a journey's first row", () => {
    const end = manifest.matches.find((match) => match.id === "fbbc5d02")?.span ?? 0;
    const heads = headsAt(list, end, step);
    expect([end, heads.length]).toEqual([523, 16]);
    for (const [index, head] of heads.entries()) {
      const { x, y, pathLength } = list.journeys[index];
      expect(head).toEqual({ x: x[pathLength - 1], y: y[pathLength - 1], row: pathLength - 1 });
    }
    expect(headsAt(list, -1, step)).toEqual(heads.map(() => null));
    const startsLater = list.journeys.map((drawn) => drawn.journey.t[0] > 0);
    expect(startsLater).toContain(true); // bots that join after 5 s
    expect(headsAt(list, 0, step).map((head) => head === null)).toEqual(startsLater);
  });

  it("have the head of a journey on its death marker from the second of the death, and no such marker before", () => {
    const deaths = list.markers.filter((marker) => marker.kind === "death" || marker.kind === "storm_death");
    expect(deaths.length).toBeGreaterThan(5);
    for (const marker of deaths) {
      const drawn = list.journeys[marker.journey];
      const [died] = marker.times;
      expect(marker.row).toBe(drawn.pathLength - 1); // the death row ends the path
      expect(headsAt(list, died, step)[marker.journey]).toEqual({ x: drawn.x[marker.row], y: drawn.y[marker.row], row: marker.row });
      expect([happened(marker.times, died - 0.1), happened(marker.times, died)]).toEqual([0, 1]);
    }
  });
});

describe("the marks on the time slider", () => {
  const map = mapOf("AmbroseValley");
  const grid = { steps: manifest.encoding.uv_steps, image: { width: map.minimap.width, height: map.minimap.height } };
  const listOf = (hidden: object) => buildDrawList(journeysOf("AmbroseValley"), "fbbc5d02", { ...shownLayers({}, true), ...hidden }, eventKinds(manifest.event_groups), grid);

  it("are one for every kind and second in which something happened, inside the match, in the order of drawing", () => {
    const list = listOf({});
    const ticks = ticksOf(list);
    expect(new Set(ticks.map((tick) => `${tick.kind} ${tick.time}`)).size).toBe(ticks.length);
    expect(ticks.every((tick) => tick.time >= 0 && tick.time <= 523)).toBe(true);
    for (const marker of list.markers) for (const time of marker.times) expect(ticks).toContainEqual({ kind: marker.kind, time });
    expect([...new Set(ticks.map((tick) => tick.kind))]).toEqual(["loot", "death", "kill"]); // this match has no storm death
    expect(ticks.length).toBeLessThanOrEqual(list.counts.kill + list.counts.death + list.counts.loot);
  });

  it("follow the switches: a hidden kind has no marks", () => {
    expect(ticksOf(listOf({ loot: false, kill: false })).every((tick) => tick.kind === "death")).toBe(true);
    expect(ticksOf(listOf({ loot: false, kill: false, death: false }))).toEqual([]);
  });
});

describe("the clock's step", () => {
  it("moves the time on by the real time that passed, times the speed", () => {
    expect(advance(10, 16, 1, 500)).toBeCloseTo(10.016, 10);
    expect(advance(10, 50, 20, 500)).toBeCloseTo(11, 10);
    expect(advance(10, 100, 60, 500)).toBeCloseTo(16, 10);
  });

  it("counts at most 100 ms of real time for a frame, so a late frame does not jump ahead, and never goes back", () => {
    expect(LONGEST_FRAME).toBe(100);
    expect(advance(10, 5000, 10, 500)).toBeCloseTo(11, 10); // five seconds away from the tab count as a tenth of one
    expect(advance(10, 101, 10, 500)).toBeCloseTo(11, 10);
    expect(advance(10, 99, 10, 500)).toBeCloseTo(10.99, 10);
    expect(advance(10, -40, 10, 500)).toBe(10);
  });

  it("stops at the end", () => {
    expect(advance(499.5, 100, 60, 500)).toBe(500);
    expect(advance(500, 16, 1, 500)).toBe(500);
  });

  it("offers speeds from 1x to 60x", () => {
    expect([...SPEEDS]).toEqual([1, 2, 5, 10, 20, 60]);
  });
});

describe("what has happened by a time", () => {
  it("counts the events at or before it", () => {
    const times = [10, 10, 25];
    expect([9.9, 10, 24.9, 25, 900].map((time) => happened(times, time))).toEqual([0, 2, 2, 3, 3]);
    expect(happened([], 5)).toBe(0);
  });
});

describe("the keys of the time slider", () => {
  const press = (key: string, held: Partial<Record<"shiftKey" | "ctrlKey" | "metaKey" | "altKey" | "repeat", boolean>> = {}) =>
    sliderKeyAction({ key, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...held }, 5);

  it("move one recorded step with the arrows, one second with Shift, and a minute with Page Up and Page Down", () => {
    expect(["ArrowRight", "ArrowUp", "ArrowLeft", "ArrowDown"].map((key) => press(key))).toEqual([
      { kind: "step", seconds: 5 },
      { kind: "step", seconds: 5 },
      { kind: "step", seconds: -5 },
      { kind: "step", seconds: -5 },
    ]);
    expect([press("ArrowRight", { shiftKey: true }), press("ArrowLeft", { shiftKey: true })]).toEqual([
      { kind: "step", seconds: 1 },
      { kind: "step", seconds: -1 },
    ]);
    expect([press("PageUp"), press("PageDown"), press("PageUp", { shiftKey: true })]).toEqual([
      { kind: "step", seconds: 60 },
      { kind: "step", seconds: -60 },
      { kind: "step", seconds: 60 },
    ]);
  });

  it("jump to the start and the end, and play or pause with Space", () => {
    expect([press("Home"), press("End"), press(" ")]).toEqual([{ kind: "start" }, { kind: "end" }, { kind: "toggle" }]);
  });

  it("leave every other key, and keys held with Ctrl, Cmd or Alt, to the browser", () => {
    expect([press("a"), press("Tab"), press("Enter")]).toEqual([null, null, null]);
    expect([press("ArrowRight", { ctrlKey: true }), press(" ", { metaKey: true }), press("Home", { altKey: true })]).toEqual([null, null, null]);
  });
});

describe("what the slider's keys do to the time", () => {
  it("move it by their step, inside the match, or to either end", () => {
    expect(timeAfter({ kind: "step", seconds: 5 }, 118, 523)).toBe(123);
    expect(timeAfter({ kind: "step", seconds: -60 }, 20, 523)).toBe(0);
    expect(timeAfter({ kind: "step", seconds: 60 }, 500, 523)).toBe(523);
    expect(timeAfter({ kind: "start" }, 300, 523)).toBe(0);
    expect(timeAfter({ kind: "end" }, 300, 523)).toBe(523);
  });

  it("leave it alone for the key that plays and pauses", () => {
    expect(timeAfter({ kind: "toggle" }, 300, 523)).toBeNull();
  });

  it("toggle once for a Space that is held down, while held arrows go on stepping", () => {
    const held = { key: " ", shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, repeat: true };
    expect(sliderKeyAction(held, 5)).toBeNull();
    expect(sliderKeyAction({ ...held, key: "ArrowRight" }, 5)).toEqual({ kind: "step", seconds: 5 });
  });

  it("are said in words with the step of the data, not with a number of their own", () => {
    expect(sliderKeysHelp(5)).toBe("Left and right arrow: 5 seconds, with Shift 1 second. Page Up and Page Down: 60 seconds. Home and End: start and end. Space: play or pause.");
    expect(sliderKeysHelp(2)).toContain("Left and right arrow: 2 seconds,");
  });

  it("put a dragged time on a whole second", () => {
    expect([77.6, 77.4, 0.2, 523].map(draggedTime)).toEqual([78, 77, 0, 523]);
  });
});

describe("what a moment of a match shows", () => {
  const map = mapOf("AmbroseValley");
  const grid = { steps: manifest.encoding.uv_steps, image: { width: map.minimap.width, height: map.minimap.height } };
  const listOf = (match: string | null) => buildDrawList(journeysOf("AmbroseValley"), match, shownLayers({}, match !== null), eventKinds(manifest.event_groups), grid);
  const list = listOf("fbbc5d02");

  it("is everything, with no moment to draw, at the end of the match, past it, and for all matches", () => {
    expect(momentAt(list, 523, 523, step)).toBeNull();
    expect(momentAt(list, 600, 523, step)).toBeNull();
    expect(momentAt(list, 100, null, step)).toBeNull();
    expect(momentAt(listOf(null), 100, 523, step)).toBeNull();
  });

  it("has the heads of that time and, for every marker, the events that have happened by then", () => {
    for (const time of [0, 117.9, 118, 522.9]) {
      const moment = momentAt(list, time, 523, step);
      expect(moment?.time).toBe(time);
      expect(moment?.heads).toEqual(headsAt(list, time, step));
      expect(moment?.counts).toEqual(list.markers.map((marker) => marker.times.filter((second) => second <= time).length));
    }
    const early = momentAt(list, 118, 523, step)?.counts ?? [];
    expect([early.includes(0), early.some((count) => count > 0)]).toEqual([true, true]); // some markers are there, some still to come
    expect(momentAt(list, 0, 523, step)?.counts.every((count) => count === 0)).toBe(true);
  });

  it("keeps a head on its death row when a row follows it: a kill recorded after the death", () => {
    const later = listOf("de7378ae");
    const index = later.journeys.findIndex((drawn) => drawn.journey.id === "de7378ae-6539f536");
    const { journey, pathLength, x, y } = later.journeys[index];
    expect([journey.t.length, pathLength, journey.t[41], journey.t[42]]).toEqual([43, 42, 230, 235]);
    expect([x[42], y[42]]).not.toEqual([x[41], y[41]]); // the later row lies somewhere else
    for (const time of [230, 235, 300]) expect(headsAt(later, time, step)[index]).toEqual({ x: x[41], y: y[41], row: 41 });
  });
});
