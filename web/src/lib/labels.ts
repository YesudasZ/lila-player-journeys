/** Journeys, fates, times and counts as the words and numbers a person reads. Pure. */
import type { LayerKey, MarkerKind } from "./drawList.ts";
import type { Journey } from "./journeys.ts";

/** The legend's name of each thing that is drawn. */
export const LAYER_LABELS: Record<LayerKey, string> = { humans: "Humans", bots: "Bots", kill: "Kills", death: "Deaths", storm_death: "Storm deaths", loot: "Loot" };

const EVENT_NAMES: Record<MarkerKind, string> = { kill: "Kill", death: "Death", storm_death: "Storm death", loot: "Loot" };

/**
 * What a marker stands for: "Kill", "Loot × 3", "Death: killed by bot". A death in combat says how,
 * from the fate of its journey.
 */
export function markerTitle(kind: MarkerKind, count: number, fate: string): string {
  const name = kind === "death" ? `${EVENT_NAMES.death}: ${fateLabel(fate)}` : EVENT_NAMES[kind];
  return count > 1 ? `${name} × ${count}` : name;
}

/** Who a journey belongs to. A bot's number is not an identity: other matches reuse it. */
export function whoLabel({ actor, player }: Pick<Journey, "actor" | "player">): string {
  if (actor === "bot") return player === null ? "bot" : `bot ${player}`;
  return player === null ? "human (no account id)" : `human ${player}`;
}

/** A fate in words, made from its own text: "killed_by_bot" reads "killed by bot". The app keeps no second list of fates. */
export function fateLabel(fate: string): string {
  return fate.replaceAll("_", " ");
}

/** Seconds into a match as minutes and seconds: 155 reads "2:35". */
export function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** A day of the data as "12 Feb", from its ISO date. The data's days are UTC days. */
export function dayLabel(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** A count with thousands separated: 9902 reads "9,902". */
export function countLabel(count: number): string {
  return count.toLocaleString("en-US");
}

/** A count with its noun: "1 match", "566 matches". */
export function counted(count: number, one: string, many: string): string {
  return `${countLabel(count)} ${count === 1 ? one : many}`;
}
