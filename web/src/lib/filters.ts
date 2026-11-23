/** The day filter and what the filters leave. Pure. */
import type { Manifest, MatchEntry } from "./manifest.ts";

/**
 * True when a match passes the day filter. No day chosen lets every match pass. A match belongs to
 * its `day`, the folder it was filed under, never to the date of its `start`.
 */
export const onChosenDays = (match: MatchEntry, days: readonly string[]): boolean => days.length === 0 || days.includes(match.day);

/** How many matches the day filter leaves on each map, by map id: the numbers on the map tabs. */
export function matchCounts(manifest: Manifest, days: readonly string[]): Map<string, number> {
  const counts = new Map(manifest.maps.map((map) => [map.id, 0]));
  for (const match of manifest.matches) if (onChosenDays(match, days)) counts.set(match.map, (counts.get(match.map) ?? 0) + 1);
  return counts;
}

/** The ids of the matches of a map that the day filter leaves; null when no day is chosen, which leaves them all. */
export function allowedMatches(manifest: Manifest, mapId: string, days: readonly string[]): ReadonlySet<string> | null {
  if (days.length === 0) return null;
  return new Set(manifest.matches.filter((match) => match.map === mapId && days.includes(match.day)).map((match) => match.id));
}

/** A list in words: "a", "a or b", "a, b or c". */
function orList(items: readonly string[]): string {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} or ${items.at(-1) ?? ""}`;
}

/**
 * Why the map shows no journey, in plain words, from the names of the chosen days and fates:
 * "No journey on Lockdown has the fate “killed by player”."
 */
export function emptyNote(mapName: string, days: readonly string[], fates: readonly string[]): string {
  const when = days.length > 0 ? ` on ${orList(days)}` : "";
  const what = fates.length > 0 ? ` has the fate ${orList(fates.map((fate) => `“${fate}”`))}` : " is left";
  return `No journey on ${mapName}${when}${what}.`;
}
