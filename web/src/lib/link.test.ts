import { describe, expect, it } from "vitest";

import { journeysOf, manifest } from "../testing/committed.ts";
import { buildDrawList, eventKinds, type Shown } from "./drawList.ts";
import { allowedMatches, emptyNote, matchCounts, onChosenDays } from "./filters.ts";
import { DEFAULT_LINK, checkedLink, decodeLink, encodeLink, type Link } from "./link.ts";
import { matchesOfMap } from "./matches.ts";

const FULL: Link = {
  map: "GrandRift",
  days: ["February_10", "February_12"],
  match: "0273e16e",
  t: 12.5,
  journey: "0273e16e-94d042cb",
  choices: { loot: true, bots: false, kill: false },
  fates: ["killed_by_storm", "no_death_recorded"],
  view: { x: 1024.5, y: 980.2, zoom: 2.5 },
};

describe("a view as a link", () => {
  it("is the bare address for the default view", () => {
    expect(encodeLink(DEFAULT_LINK)).toBe("");
    expect(decodeLink("")).toEqual(DEFAULT_LINK);
  });

  it("holds every part, in one order, and reads back as the same view", () => {
    const query = encodeLink(FULL);
    expect(query).toBe(
      "?map=GrandRift&days=February_10,February_12&match=0273e16e&t=12.5&journey=0273e16e-94d042cb&show=loot&hide=bots,kill&fate=killed_by_storm,no_death_recorded&view=1024.5,980.2,2.5",
    );
    expect(decodeLink(query)).toEqual(FULL);
    expect(encodeLink(decodeLink(query))).toBe(query);
  });

  it.each(["03359228", "5e373986"])("keeps the match id %s as text, although it looks like a number", (id) => {
    const link = decodeLink(encodeLink({ ...DEFAULT_LINK, match: id, journey: `${id}-anon` }));
    expect(link.match).toBe(id);
    expect(link.journey).toBe(`${id}-anon`);
    expect(checkedLink(link, manifest).match).toBe(id);
  });

  it("rounds the view: the point to a tenth of an image pixel, the zoom to a thousandth", () => {
    const query = encodeLink({ ...DEFAULT_LINK, view: { x: 1000.04, y: 999.96, zoom: 3.14159 } });
    expect(query).toBe("?view=1000,1000,3.142");
    expect(decodeLink(query).view).toEqual({ x: 1000, y: 1000, zoom: 3.142 });
  });

  it.each([
    ["two numbers", "?view=10,20"],
    ["four numbers", "?view=1,2,3,4"],
    ["a word", "?view=10,up,2"],
    ["an empty part", "?view=10,,2"],
    ["not a number at all", "?view=NaN,1,1"],
  ])("reads a view of %s as no view", (_, query) => {
    expect(decodeLink(query).view).toBeNull();
  });

  it("reads only the switches the tool has, and lets hide win over show", () => {
    expect(decodeLink("?show=loot,paths,kill&hide=kill").choices).toEqual({ loot: true, kill: false });
  });
});

describe("a link from outside, checked against the data", () => {
  const checked = (query: string) => checkedLink(decodeLink(query), manifest);

  it("keeps a link that fits the data as it is", () => {
    const day = manifest.matches.find((match) => match.id === FULL.match)?.day ?? "";
    const fits = { ...FULL, days: [day] }; // the match has to be on one of the chosen days
    expect(checked(encodeLink(fits))).toEqual(fits);
  });

  it("names the first map by leaving it out", () => {
    expect(checked("?map=AmbroseValley&match=fbbc5d02")).toEqual({ ...DEFAULT_LINK, match: "fbbc5d02" });
  });

  it.each([
    ["an unknown map", "?map=Nowhere&fate=killed", { ...DEFAULT_LINK, fates: ["killed"] }],
    ["an unknown day and an unknown fate", "?days=February_30,February_11&fate=vanished,killed", { ...DEFAULT_LINK, days: ["February_11"], fates: ["killed"] }],
    ["an unknown match", "?match=zzzzzzzz&days=February_10", { ...DEFAULT_LINK, days: ["February_10"] }],
    ["a match of another map", "?map=Lockdown&match=fbbc5d02", { ...DEFAULT_LINK, map: "Lockdown" }],
    ["a match outside the chosen days", "?match=fbbc5d02&days=February_10", { ...DEFAULT_LINK, days: ["February_10"] }],
    ["a broken view", "?map=Lockdown&view=1,2", { ...DEFAULT_LINK, map: "Lockdown" }],
    ["a view that is not closer than fit", "?map=Lockdown&view=1024,1024,0", { ...DEFAULT_LINK, map: "Lockdown" }],
    ["a view at fit, which is the view without one", "?map=Lockdown&view=1024,1024,1", { ...DEFAULT_LINK, map: "Lockdown" }],
    ["a view beside the image", "?view=-5,10,3", DEFAULT_LINK],
    ["a view absurdly close", "?view=1000,900,9999", DEFAULT_LINK],
  ])("drops %s and keeps the rest", (_, query, expected) => {
    expect(checked(query)).toEqual(expected);
  });

  it("keeps a match that is on one of the chosen days, and puts days and fates in the order of the data", () => {
    expect(checked("?match=fbbc5d02&days=February_14,February_12&fate=no_death_recorded,killed_by_bot")).toEqual({
      ...DEFAULT_LINK,
      match: "fbbc5d02",
      days: ["February_12", "February_14"],
      fates: ["killed_by_bot", "no_death_recorded"],
    });
  });
});

describe("the day filter", () => {
  const days = manifest.days.map((day) => day.id);
  const total = (counts: Map<string, number>) => [...counts.values()].reduce((sum, count) => sum + count, 0);

  it("lists 284, 201, 162, 112 and 37 matches for each day alone", () => {
    expect(days.map((day) => total(matchCounts(manifest, [day])))).toEqual([284, 201, 162, 112, 37]);
  });

  it("lists 566, 59 and 171 matches on the three maps when no day is chosen, and all 796 when all are", () => {
    expect([...matchCounts(manifest, [])]).toEqual([["AmbroseValley", 566], ["GrandRift", 59], ["Lockdown", 171]]);
    expect(total(matchCounts(manifest, days))).toBe(796);
  });

  it("gives the tabs their numbers day by day", () => {
    const perDay = (map: string) => days.map((day) => matchCounts(manifest, [day]).get(map));
    expect(perDay("AmbroseValley")).toEqual([199, 138, 127, 78, 24]);
    expect(perDay("GrandRift")).toEqual([24, 13, 9, 5, 8]);
    expect(perDay("Lockdown")).toEqual([61, 50, 26, 29, 5]);
    expect(matchCounts(manifest, ["February_10", "February_14"]).get("AmbroseValley")).toBe(223);
  });

  it("goes by the folder a match was filed under, not by the date of its start", () => {
    const late = manifest.matches.find((match) => match.id === "e325a53a");
    expect(late?.day).toBe("February_10");
    expect(new Date((late?.start ?? 0) * 1000).toISOString().slice(0, 16)).toBe("2026-02-09T23:58"); // it started the evening before
    expect(late && onChosenDays(late, ["February_10"])).toBe(true);
    expect(allowedMatches(manifest, "AmbroseValley", ["February_10"])?.has("e325a53a")).toBe(true);
  });

  it("leaves every match of a map when no day is chosen, and only those of the chosen days otherwise", () => {
    expect(allowedMatches(manifest, "GrandRift", [])).toBeNull();
    const some = allowedMatches(manifest, "GrandRift", ["February_13", "February_14"]);
    expect(some?.size).toBe(13);
    expect(matchesOfMap(manifest, "GrandRift").filter((match) => some?.has(match.id)).every((match) => match.day === "February_13" || match.day === "February_14")).toBe(true);
  });
});

describe("what the filters leave on the map", () => {
  const KINDS = eventKinds(manifest.event_groups);
  const ALL: Shown = { humans: true, bots: true, kill: true, death: true, storm_death: true, loot: true };
  const grid = (id: string) => {
    const map = manifest.maps.find((entry) => entry.id === id);
    return { steps: manifest.encoding.uv_steps, image: { width: map?.minimap.width ?? 1, height: map?.minimap.height ?? 1 } };
  };
  const listOf = (id: string, days: string[], fates: string[]) =>
    buildDrawList(journeysOf(id), null, ALL, KINDS, grid(id), { matches: allowedMatches(manifest, id, days), fates: fates.length > 0 ? new Set(fates) : null });

  it("is everything without a filter", () => {
    expect([listOf("Lockdown", [], []).matches, listOf("Lockdown", [], []).journeys.length]).toEqual([171, 295]);
  });

  it("is the journeys of the chosen days with their markers", () => {
    const list = listOf("AmbroseValley", ["February_14"], []);
    expect(list.matches).toBe(24);
    const days = new Map(manifest.matches.map((match) => [match.id, match.day]));
    expect(list.journeys.every((drawn) => days.get(drawn.journey.match) === "February_14")).toBe(true);
    expect(list.markers.every((marker) => days.get(list.journeys[marker.journey].journey.match) === "February_14")).toBe(true);
  });

  it("is the journeys of the chosen fates, humans and bots alike", () => {
    const list = listOf("AmbroseValley", [], ["killed_by_storm", "killed"]);
    expect(list.counts).toMatchObject({ humans: 17, bots: 188, storm_death: 17 });
    expect(new Set(list.journeys.map((drawn) => drawn.journey.fate))).toEqual(new Set(["killed_by_storm", "killed"]));
  });

  it("is nothing where the data has nothing: no journey on Lockdown was killed by a player", () => {
    const list = listOf("Lockdown", [], ["killed_by_player"]);
    expect([list.journeys.length, list.markers.length, list.matches, list.counts.humans + list.counts.bots]).toEqual([0, 0, 0, 0]);
  });

  it("says in words why nothing is shown", () => {
    expect(emptyNote("Lockdown", [], ["killed by player"])).toBe("No journey on Lockdown has the fate “killed by player”.");
    expect(emptyNote("Grand Rift", ["14 Feb"], ["killed by storm", "killed"])).toBe("No journey on Grand Rift on 14 Feb has the fate “killed by storm” or “killed”.");
    expect(emptyNote("Lockdown", ["10 Feb", "11 Feb", "12 Feb"], [])).toBe("No journey on Lockdown on 10 Feb, 11 Feb or 12 Feb is left.");
  });
});

describe("the time of playback in a link", () => {
  const checked = (query: string) => checkedLink(decodeLink(query), manifest);
  const opened = { ...DEFAULT_LINK, match: "fbbc5d02" }; // a match whose recorded span is 523 s

  it("is written after its match, to a tenth of a second, and left out at the end", () => {
    expect(encodeLink({ ...opened, t: 120.46 })).toBe("?match=fbbc5d02&t=120.5");
    expect(encodeLink({ ...opened, t: 0, journey: "fbbc5d02-anon" })).toBe("?match=fbbc5d02&t=0&journey=fbbc5d02-anon");
    expect(encodeLink(opened)).toBe("?match=fbbc5d02");
  });

  it.each([
    ["a number", "?t=12.5", 12.5],
    ["zero", "?t=0", 0],
    ["a word", "?t=soon", null],
    ["nothing", "?t=", null],
    ["a blank", "?t=%20", null],
    ["a number without end", "?t=1e999", null],
  ])("reads %s", (_, query, time) => {
    expect(decodeLink(query).t).toBe(time);
  });

  it("is kept with its match while it lies inside the match's span", () => {
    expect(checked("?match=fbbc5d02&t=120.46")).toEqual({ ...opened, t: 120.5 });
    expect(checked("?match=fbbc5d02&t=0")).toEqual({ ...opened, t: 0 });
    expect(checked("?match=fbbc5d02&t=522.9")).toEqual({ ...opened, t: 522.9 });
  });

  it.each([
    ["without a match", "?t=5", DEFAULT_LINK],
    ["at the end of the match", "?match=fbbc5d02&t=523", opened],
    ["rounded up to the end", "?match=fbbc5d02&t=522.96", opened],
    ["past the end", "?match=fbbc5d02&t=9999", opened],
    ["before the start", "?match=fbbc5d02&t=-1", opened],
    ["with a match that is dropped", "?map=Lockdown&match=fbbc5d02&t=5", { ...DEFAULT_LINK, map: "Lockdown" }],
  ])("is dropped %s", (_, query, expected) => {
    expect(checked(query)).toEqual(expected);
  });
});
