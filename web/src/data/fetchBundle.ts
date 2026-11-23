import { parseBundle, type Journey } from "../lib/journeys.ts";
import type { Manifest, MapEntry } from "../lib/manifest.ts";
import { dataUrl } from "./dataUrl.ts";

/**
 * Load and check the journeys of a map. Rejects when they cannot be fetched, and with a DataError
 * when the file does not fit the manifest that is already loaded. `afterFailure` is for a second
 * try: the server is asked afresh, as for the manifest.
 */
export async function fetchBundle(map: MapEntry, manifest: Manifest, afterFailure = false): Promise<Journey[]> {
  const response = await fetch(dataUrl(map.journeys_file), { cache: afterFailure ? "reload" : "default" });
  if (!response.ok) throw new Error(`${map.journeys_file} could not be loaded: HTTP ${response.status}`);
  return parseBundle(await response.json(), map, manifest);
}
