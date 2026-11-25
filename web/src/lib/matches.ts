/** The match list of a map, and what the journeys panel says about one match. Pure. */
import { clock, counted, dayLabel } from "./labels.ts";
import type { DayEntry, Manifest, MatchEntry } from "./manifest.ts";

/** The number of journeys of a match: one per human and one per bot. */
export const journeysIn = (match: MatchEntry): number => match.humans + match.bots;

/** The matches of a map, busiest first: most journeys, then most rows, then by id, so the order is the same every time. */
export function matchesOfMap(manifest: Manifest, mapId: string): MatchEntry[] {
  return manifest.matches
    .filter((match) => match.map === mapId)
    .sort((a, b) => journeysIn(b) - journeysIn(a) || b.rows - a.rows || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The matches whose id contains what was typed. Nothing typed keeps them all. */
export function findMatches(matches: readonly MatchEntry[], typed: string): MatchEntry[] {
  const wanted = typed.trim().toLowerCase();
  return wanted === "" ? [...matches] : matches.filter((match) => match.id.toLowerCase().includes(wanted));
}

/**
 * Why the match list is empty. The filters left no match of the map, so there was nothing to search;
 * or `left` matches are there and none has an id that contains what was typed.
 */
export function noMatchNote(mapName: string, left: number, typed: string): string {
  return left === 0 ? `No match on ${mapName} passes the filters.` : `No match id contains “${typed.trim()}”.`;
}

/** What the journeys panel says about the open match, in three short lines. */
export interface MatchSummary {
  /** "12 Feb · 8:43 recorded": the day of its folder (assumption A10) and the span of its rows. */
  when: string;
  /** "2 humans · 14 bots". */
  who: string;
  /** "5 kills · 8 deaths · 0 storm deaths · 7 loot events": every marker of the match, of humans and of bots. */
  events: string;
}

export function matchSummary(match: MatchEntry, days: readonly DayEntry[]): MatchSummary {
  const date = days.find((day) => day.id === match.day)?.date;
  return {
    when: `${date ? dayLabel(date) : match.day} · ${clock(match.span)} recorded`,
    who: `${counted(match.humans, "human", "humans")} · ${counted(match.bots, "bot", "bots")}`,
    events: [
      counted(match.kills + match.bot_kills, "kill", "kills"),
      counted(match.deaths + match.bot_deaths, "death", "deaths"),
      counted(match.storm_deaths, "storm death", "storm deaths"),
      counted(match.loot, "loot event", "loot events"),
    ].join(" · "),
  };
}
