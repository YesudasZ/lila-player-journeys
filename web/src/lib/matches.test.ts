import { describe, expect, it } from "vitest";

import { journeysOf, manifest, mapOf } from "../testing/committed.ts";
import { buildDrawList, eventKinds, shownLayers } from "./drawList.ts";
import { counted } from "./labels.ts";
import { matchSummary } from "./matches.ts";

const entryOf = (id: string) => {
  const match = manifest.matches.find((each) => each.id === id);
  if (!match) throw new Error(`no match ${id}`);
  return match;
};

describe("what the journeys panel says about a match", () => {
  it("gives its day, its recorded span, who took part and every marker", () => {
    expect(matchSummary(entryOf("fbbc5d02"), manifest.days)).toEqual({
      when: "12 Feb · 8:43 recorded",
      who: "2 humans · 14 bots",
      events: ["5 kills", "8 deaths", "0 storm deaths", "7 loot events"],
    });
  });

  it("names the day of the match's folder, also for a match that started the evening before (A10)", () => {
    expect(matchSummary(entryOf("e325a53a"), manifest.days).when).toBe("10 Feb · 12:24 recorded");
  });

  it("agrees with the legend of every match of a map, every layer shown", () => {
    const map = mapOf("GrandRift");
    const grid = { steps: manifest.encoding.uv_steps, image: { width: map.minimap.width, height: map.minimap.height } };
    const matches = manifest.matches.filter((match) => match.map === map.id);
    for (const match of matches) {
      const { counts } = buildDrawList(journeysOf(map.id), match.id, shownLayers({}, true), eventKinds(manifest.event_groups), grid);
      const summary = matchSummary(match, manifest.days);
      expect(summary.who).toBe(`${counted(counts.humans, "human", "humans")} · ${counted(counts.bots, "bot", "bots")}`);
      expect(summary.events).toEqual([
        counted(counts.kill, "kill", "kills"),
        counted(counts.death, "death", "deaths"),
        counted(counts.storm_death, "storm death", "storm deaths"),
        counted(counts.loot, "loot event", "loot events"),
      ]);
    }
    expect(matches).toHaveLength(59);
  });
});
