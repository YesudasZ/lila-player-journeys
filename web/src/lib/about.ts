/**
 * What the "Data and keys" panel says, in plain words: what the data is and what it cannot say,
 * what each heat layer counts, the keys, and the limits of the tool. The numbers come from the
 * manifest, and the help for the keys from the code that takes them. Pure.
 */
import { CELL_UNITS, HEAT_KINDS, HEAT_LABELS, HEAT_MEANING } from "./heat.ts";
import { countLabel, counted, dayLabel } from "./labels.ts";
import type { Manifest } from "./manifest.ts";
import { MAP_HELP } from "./mapKeys.ts";
import { sliderKeysHelp } from "./playback.ts";

export interface AboutSection {
  heading: string;
  /** A sentence or two that hold for every entry of the section. */
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
      heading: "The data",
      entries: [
        {
          term: "What it holds",
          text:
            `Telemetry of ${counted(totals.matches, "match", "matches")} on ${counted(maps.length, "map", "maps")}${filed}. ` +
            `A journey is what one player or bot did in one match: ${counted(totals.humans, "journey", "journeys")} of humans and ${countLabel(totals.bots)} of bots.`,
        },
        {
          term: "One match",
          text:
            `${countLabel(alone)} of the ${countLabel(totals.matches)} matches hold a single journey, and ${countLabel(withBots)} hold bots. ` +
            "The view of all matches of a map says the most; playback shows the most in a match with bots.",
        },
        {
          term: "Path",
          text:
            `A position is recorded about every ${step} seconds while a player or bot moves, and none while it stands still. ` +
            "A path joins the positions with straight lines, so it can cut a corner.",
        },
        {
          term: "Kills and deaths",
          text:
            "Every event is recorded from the side of one journey, at the place where its player or bot stood. " +
            "A kill marker is where the killer stood, a death marker where the victim fell.",
        },
        {
          term: "No death recorded",
          text: "The journey has no death. The data has no event for an extraction or for the end of a match, so this does not prove that the player got out.",
        },
        {
          term: "No account id",
          text: `${counted(totals.anonymous, "journey", "journeys")} of humans came without an account id. They are drawn like the others; across matches one cannot be told from another.`,
        },
        { term: "Time", text: "The clock of a match runs from its first recorded row to its last. That is what was recorded, not the length of the match." },
        { term: "Days", text: "A match belongs to the day of the folder it was filed under. The folders are UTC days." },
        {
          term: "x, z and elevation",
          text:
            "x and z are the ground plane of the game's world, in world units. The third axis, y, is height, shown as elevation. " +
            "A position on the minimap is right to about 1 to 2% of the map's width.",
        },
      ],
    },
    {
      heading: "Heat layers",
      lead:
        `A heat layer counts the journeys that are drawn, in cells of ${CELL_UNITS} × ${CELL_UNITS} world units. ` +
        "So it follows the filters, the open match and the switches for humans and bots. The stronger the colour, the more was counted.",
      entries: HEAT_KINDS.map((kind) => ({ term: HEAT_LABELS[kind], text: HEAT_MEANING[kind] })),
    },
    {
      heading: "Keys and the address",
      entries: [
        { term: "Map", text: `${MAP_HELP} The keys act while the map or one of its buttons has the focus.` },
        { term: "Time slider", text: sliderKeysHelp(step) },
        { term: "Lists", text: "Tab goes from one list to the next. Inside a list the up and down arrows move, Home and End jump to its ends, and Enter chooses." },
        {
          term: "Back and Forward",
          text:
            "The browser's Back and Forward step through what you chose: maps, matches, filters, switches, heat layers and the focused journey. " +
            "Moving the map and the time of playback belong to the view they were made in.",
        },
        { term: "Copy link", text: "The address always says the view, and “Copy link” copies it. Whoever opens it sees the same view." },
      ],
    },
    {
      heading: "Limits",
      entries: [
        { term: "Desktop", text: "The tool is built for a desktop browser with a keyboard and a mouse or trackpad." },
        {
          term: "Pinch",
          text: "The map is not zoomed by pinching on a touch screen, nor on a trackpad in Safari. The scroll wheel, the zoom buttons and the plus and minus keys zoom everywhere.",
        },
      ],
    },
  ];
}
