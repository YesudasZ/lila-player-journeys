/** The match list of a map. Pure. */
import type { Manifest, MatchEntry } from "./manifest.ts";

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
