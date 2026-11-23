/** Journeys, fates, times and counts as the words and numbers a person reads. Pure. */
import type { Journey } from "./journeys.ts";

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
