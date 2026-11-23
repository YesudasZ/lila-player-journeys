/** For tests only: the committed data as the app reads it. */
import committed from "../../public/data/manifest.json";
import ambroseValley from "../../public/data/maps/AmbroseValley.json?raw";
import grandRift from "../../public/data/maps/GrandRift.json?raw";
import lockdown from "../../public/data/maps/Lockdown.json?raw";
import { parseBundle, type Journey } from "../lib/journeys.ts";
import { parseManifest, type MapEntry } from "../lib/manifest.ts";

export const manifest = parseManifest(committed);

/** A map of the committed manifest by its id. */
export function mapOf(id: string): MapEntry {
  const map = manifest.maps.find((entry) => entry.id === id);
  if (!map) throw new Error(`the committed manifest has no map ${id}`);
  return map;
}

const BUNDLES = new Map([
  ["AmbroseValley", ambroseValley],
  ["GrandRift", grandRift],
  ["Lockdown", lockdown],
]);
const read = new Map<string, Journey[]>();

/** The journeys of a map of the committed data. Each bundle is read once. */
export function journeysOf(id: string): Journey[] {
  const known = read.get(id);
  if (known) return known;
  const text = BUNDLES.get(id);
  if (text === undefined) throw new Error(`the committed data has no bundle for ${id}`);
  const journeys = parseBundle(JSON.parse(text), mapOf(id), manifest);
  read.set(id, journeys);
  return journeys;
}
