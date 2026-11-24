/**
 * What the "Data and keys" panel says, short and in plain words: where the data differs from its
 * README, what each heat layer counts, which keys do what, and that the tool is built for a desktop.
 * The numbers come from the manifest, the heat layers' sentences from their legend, and the help
 * for the keys from the code that takes them. Pure.
 */
import { CELL_UNITS, HEAT_KINDS, HEAT_LABELS, HEAT_MEANING } from "./heat.ts";
import { countLabel, counted, dayLabel } from "./labels.ts";
import type { Manifest } from "./manifest.ts";
import { MAP_HELP } from "./mapKeys.ts";
import { sliderKeysHelp } from "./playback.ts";

export interface AboutSection {
  heading: string;
  /** A sentence or two that hold for the whole section. */
  lead?: string;
  entries: { term: string; text: string }[];
}

export function aboutSections(manifest: Manifest): AboutSection[] {
  const { totals, maps, days, matches, sample_step_seconds: step } = manifest;
  const alone = matches.filter((match) => match.humans + match.bots === 1).length;
  const withBots = matches.filter((match) => match.bots > 0).length;
  const dates = days.map((day) => dayLabel(day.date));
  const filed = dates.length === 0 ? "" : `, filed under ${counted(dates.length, "day", "days")} from ${dates[0]} to ${dates[dates.length - 1]} (UTC)`;

  return [
    {
      heading: "The data, and where it differs from its README",
      lead:
        `Telemetry of ${counted(totals.matches, "match", "matches")} on ${counted(maps.length, "map", "maps")}${filed}: ` +
        `${counted(totals.humans, "journey", "journeys")} of humans and ${countLabel(totals.bots)} of bots. ` +
        `${countLabel(alone)} of the matches hold a single journey, and ${countLabel(withBots)} hold bots.`,
      entries: [
        {
          term: "Path",
          text: `A position is recorded about every ${step} seconds while a player or bot moves, and none while it stands still. A path joins the positions with straight lines.`,
        },
        { term: "Kills and deaths", text: "Each is recorded where the journey's own player or bot stood: a kill where the killer stood, a death where the victim fell." },
        {
          term: "No death recorded",
          text: "The data has no event for an extraction or for the end of a match. A journey without a death does not prove that the player got out.",
        },
        { term: "No account id", text: `${counted(totals.anonymous, "journey", "journeys")} of humans came without an account id. They are drawn like the others.` },
        { term: "Time", text: "The clock of a match runs from its first recorded row to its last: what was recorded, not the length of the match." },
      ],
    },
    {
      heading: "The map and the heat layers",
      lead:
        "x and z are the ground plane of the game's world, in world units; the third axis, y, is height, shown as elevation. " +
        `A heat layer counts the journeys that are drawn, in cells of ${CELL_UNITS} × ${CELL_UNITS} world units.`,
      entries: HEAT_KINDS.map((kind) => ({ term: HEAT_LABELS[kind], text: HEAT_MEANING[kind] })),
    },
    {
      heading: "Keys",
      entries: [
        { term: "Map", text: MAP_HELP },
        { term: "Time slider", text: sliderKeysHelp(step) },
        { term: "Lists", text: "Tab goes from one list to the next. Inside a list the up and down arrows move, and Enter chooses." },
        { term: "Back and Forward", text: "The browser's Back and Forward step through the views you chose." },
      ],
    },
    {
      heading: "Limits",
      entries: [
        {
          term: "Desktop only",
          text: "Built for a desktop browser with a keyboard and a mouse or trackpad. The map is not zoomed by pinching on a touch screen, nor on a trackpad in Safari.",
        },
      ],
    },
  ];
}
