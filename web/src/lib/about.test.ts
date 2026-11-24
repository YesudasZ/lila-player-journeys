import { describe, expect, it } from "vitest";

import { manifest } from "../testing/committed.ts";
import { aboutSections } from "./about.ts";
import { HEAT_KINDS, HEAT_LABELS, HEAT_MEANING, heatSummary } from "./heat.ts";
import { MAP_HELP } from "./mapKeys.ts";
import { sliderKeysHelp } from "./playback.ts";

const textOf = (sections: ReturnType<typeof aboutSections>, heading: string, term: string) =>
  sections.find((section) => section.heading === heading)?.entries.find((entry) => entry.term === term)?.text;

describe("what the panel about the data and the keys says", () => {
  const sections = aboutSections(manifest);

  it("has the numbers of the data from the manifest", () => {
    expect(textOf(sections, "The data", "What it holds")).toBe(
      "Telemetry of 796 matches on 3 maps, filed under 5 days from 10 Feb to 14 Feb (UTC). " +
        "A journey is what one player or bot did in one match: 798 journeys of humans and 444 of bots.",
    );
    expect(textOf(sections, "The data", "One match")).toMatch(/^743 of the 796 matches hold a single journey, and 52 hold bots\. /);
    expect(textOf(sections, "The data", "Path")).toMatch(/^A position is recorded about every 5 seconds while /);
    expect(textOf(sections, "The data", "No account id")).toMatch(/^17 journeys of humans came without an account id\. /);
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
    expect(textOf(other, "The data", "What it holds")).toBe(
      "Telemetry of 3 matches on 1 map. A journey is what one player or bot did in one match: 2 journeys of humans and 4 of bots.",
    );
    expect(textOf(other, "The data", "One match")).toMatch(/^2 of the 3 matches hold a single journey, and 2 hold bots\. /);
    expect(textOf(other, "The data", "No account id")).toMatch(/^1 journey of humans /);
    expect(textOf(other, "The data", "Path")).toMatch(/^A position is recorded about every 2 seconds while /);
    expect(textOf(other, "Keys and the address", "Time slider")).toBe(sliderKeysHelp(2));
  });

  it("says of each heat layer what its legend says, in the order of the buttons", () => {
    const heat = sections.find((section) => section.heading === "Heat layers");
    expect(heat?.entries).toEqual(HEAT_KINDS.map((kind) => ({ term: HEAT_LABELS[kind], text: HEAT_MEANING[kind] })));
    expect(heat?.lead).toMatch(/in cells of 10 × 10 world units\. /);
    for (const kind of HEAT_KINDS) {
      expect(heatSummary({ kind, total: 5, matches: 1, most: 2, cells: 90, storm: 0 }, 900).endsWith(HEAT_MEANING[kind])).toBe(true);
    }
  });

  it("gives the keys in the words of the code that takes them", () => {
    expect(textOf(sections, "Keys and the address", "Time slider")).toBe(sliderKeysHelp(manifest.sample_step_seconds));
    expect(textOf(sections, "Keys and the address", "Map")).toBe(`${MAP_HELP} The keys act while the map or one of its buttons has the focus.`);
  });

  it("has four sections, no empty text, and no term twice in a section", () => {
    expect(sections.map((section) => [section.heading, section.entries.length])).toEqual([
      ["The data", 9],
      ["Heat layers", 4],
      ["Keys and the address", 5],
      ["Limits", 2],
    ]);
    for (const section of sections) {
      expect(new Set(section.entries.map((entry) => entry.term)).size).toBe(section.entries.length);
      expect(section.entries.every((entry) => entry.term.trim() !== "" && entry.text.trim().endsWith("."))).toBe(true);
    }
  });
});
