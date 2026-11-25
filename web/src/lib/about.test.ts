import { describe, expect, it } from "vitest";

import { manifest } from "../testing/committed.ts";
import { aboutSections } from "./about.ts";
import { HEAT_KINDS, HEAT_LABELS, HEAT_MEANING, heatSummary } from "./heat.ts";
import { MAP_HELP } from "./mapKeys.ts";
import { sliderKeysHelp } from "./playback.ts";

type Sections = ReturnType<typeof aboutSections>;
const DATA = "The data, and where it differs from its README";
const sectionOf = (sections: Sections, heading: string) => sections.find((section) => section.heading === heading);
const textOf = (sections: Sections, heading: string, term: string) => sectionOf(sections, heading)?.entries.find((entry) => entry.term === term)?.text;

describe("what the panel about the data and the keys says", () => {
  const sections = aboutSections(manifest);

  it("has the numbers of the data from the manifest", () => {
    expect(sectionOf(sections, DATA)?.lead).toBe(
      "Telemetry of 796 matches on 3 maps, filed under 5 days from 10 Feb to 14 Feb (UTC): 798 journeys of humans and 444 of bots. " +
        "743 of the matches hold a single journey, and 52 hold bots.",
    );
    expect(textOf(sections, DATA, "Path")).toMatch(/^A position is recorded about every 5 seconds while /);
    expect(textOf(sections, DATA, "No account id")).toBe("17 journeys of humans came without an account id. They are drawn like the others.");
  });

  it("follows the manifest it is given", () => {
    const [match] = manifest.matches;
    const matches = [
      { ...match, humans: 1, bots: 0 },
      { ...match, humans: 1, bots: 3 },
      { ...match, humans: 0, bots: 1 },
    ];
    const small = { ...manifest, days: [], maps: manifest.maps.slice(0, 1), matches, sample_step_seconds: 2 };
    const other = aboutSections({ ...small, totals: { ...manifest.totals, matches: 3, humans: 2, bots: 4, anonymous: 1 } });
    expect(sectionOf(other, DATA)?.lead).toBe(
      "Telemetry of 3 matches on 1 map: 2 journeys of humans and 4 of bots. 2 of the matches hold a single journey, and 2 hold bots.",
    );
    expect(textOf(other, DATA, "No account id")).toMatch(/^1 journey of humans /);
    expect(textOf(other, DATA, "Path")).toMatch(/^A position is recorded about every 2 seconds while /);
    expect(textOf(other, "Keys", "Time slider")).toBe(sliderKeysHelp(2));
  });

  it("says of each heat layer what its legend says, in the order of the buttons, and names the ground plane", () => {
    const heat = sectionOf(sections, "The map and the heat layers");
    expect(heat?.entries).toEqual(HEAT_KINDS.map((kind) => ({ term: HEAT_LABELS[kind], text: HEAT_MEANING[kind] })));
    expect(heat?.lead).toMatch(
      /^x and z are the ground plane .* y, is height, shown as elevation\. .* in cells of 10 × 10 world units\. The ⓘ beside the heat buttons gives .* by event name\.$/,
    );
    for (const kind of HEAT_KINDS) {
      expect(heatSummary({ kind, total: 5, matches: 1, most: 2, cells: 90, storm: 0 }, 900).endsWith(HEAT_MEANING[kind])).toBe(true);
    }
  });

  it("gives the keys in the words of the code that takes them", () => {
    expect(textOf(sections, "Keys", "Time slider")).toBe(sliderKeysHelp(manifest.sample_step_seconds));
    expect(textOf(sections, "Keys", "Map")).toBe(MAP_HELP);
  });

  it("is short: four sections and fourteen entries, none empty, no term twice in a section", () => {
    expect(sections.map((section) => [section.heading, section.entries.length])).toEqual([
      [DATA, 5],
      ["The map and the heat layers", 4],
      ["Keys", 4],
      ["Limits", 1],
    ]);
    for (const section of sections) {
      expect(new Set(section.entries.map((entry) => entry.term)).size).toBe(section.entries.length);
      expect(section.entries.every((entry) => entry.term.trim() !== "" && entry.text.trim().endsWith("."))).toBe(true);
    }
  });
});
