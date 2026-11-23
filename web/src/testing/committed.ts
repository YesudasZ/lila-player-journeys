/** For tests only: the committed manifest as the app reads it. */
import committed from "../../public/data/manifest.json";
import { parseManifest, type MapEntry } from "../lib/manifest.ts";

export const manifest = parseManifest(committed);

/** A map of the committed manifest by its id. */
export function mapOf(id: string): MapEntry {
  const map = manifest.maps.find((entry) => entry.id === id);
  if (!map) throw new Error(`the committed manifest has no map ${id}`);
  return map;
}
