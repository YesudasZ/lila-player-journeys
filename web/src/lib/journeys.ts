/**
 * A map's journeys: what `maps/<Map>.json` holds (docs/DATA_FORMAT.md). `parseBundle` refuses a
 * file that is not what the app was built for, as `parseManifest` does, and keeps the rows as
 * typed arrays.
 */
import type { Manifest, MapEntry } from "./manifest.ts";
import { DataError, Reader } from "./reader.ts";

export type Actor = "human" | "bot";

/** One player or bot in one match. */
export interface Journey {
  /** Unique in the dataset, and the same on every build. */
  id: string;
  /** The id of its match entry in the manifest. */
  match: string;
  /** A human's public id, a bot's number, or null for a human without an account id. It never says human or bot. */
  player: string | null;
  actor: Actor;
  /** A human journey without an account id. */
  anonymous: boolean;
  /** One of the manifest's `fates`. */
  fate: string;
  /** One entry per row, in time order: seconds since the start of the match. */
  t: Uint16Array;
  /** Position codes, 0 to `encoding.uv_steps`. u grows to the right, v grows upward. */
  u: Uint16Array;
  v: Uint16Array;
  /** Elevation code, `encoding.elevation_steps_per_unit` steps per world unit. */
  y: Int32Array;
  /** Event code: a position in the manifest's `events`. */
  e: Uint8Array;
}

const SIXTEEN_BITS = 65_535; // times and position codes are kept in 16 bits
const EIGHT_BITS = 255; // event codes in 8
const THIRTY_TWO_BITS = 2_147_483_647; // elevation codes in 32, signed

/**
 * The journeys of one map, checked row by row against the manifest that came with them: the map,
 * the match, the fate and every event code have to be ones the manifest knows, the columns of a
 * journey have to be equally long, and time must not run backwards.
 */
export function parseBundle(value: unknown, map: MapEntry, manifest: Manifest): Journey[] {
  const bundle = new Reader(value, "bundle");
  if (bundle.text("map") !== map.id) throw new DataError(`bundle.map is not ${map.id}`);
  const matches = new Set(manifest.matches.filter((match) => match.map === map.id).map((match) => match.id));
  const fates = new Set(manifest.fates);
  const mostSteps = Math.min(manifest.encoding.uv_steps, SIXTEEN_BITS);
  const lastCode = Math.min(manifest.events.length - 1, EIGHT_BITS);

  return bundle.list("journeys", (entry, path) => {
    const journey = new Reader(entry, path);
    const actor = journey.text("actor");
    if (actor !== "human" && actor !== "bot") throw new DataError(`${path}.actor is neither human nor bot`);
    const match = journey.text("match");
    if (!matches.has(match)) throw new DataError(`${path}.match is not a match of ${map.id} in the manifest`);
    const fate = journey.text("fate");
    if (!fates.has(fate)) throw new DataError(`${path}.fate is not one of the manifest's fates`);

    const t = journey.wholeNumbers("t", 0, SIXTEEN_BITS);
    if (t.length === 0) throw new DataError(`${path}.t is empty`);
    const columns = {
      u: journey.wholeNumbers("u", 0, mostSteps),
      v: journey.wholeNumbers("v", 0, mostSteps),
      y: journey.wholeNumbers("y", -THIRTY_TWO_BITS, THIRTY_TWO_BITS),
      e: journey.wholeNumbers("e", 0, lastCode),
    };
    for (const [name, column] of Object.entries(columns)) {
      if (column.length !== t.length) throw new DataError(`${path}.${name} has ${column.length} entries where t has ${t.length}`);
    }
    for (let row = 1; row < t.length; row += 1) {
      if (t[row] < t[row - 1]) throw new DataError(`${path}.t goes back in time at row ${row}`);
    }

    return {
      id: journey.text("id"),
      match,
      player: journey.textOrNull("player"),
      actor,
      anonymous: journey.flag("anonymous"),
      fate,
      t: Uint16Array.from(t),
      u: Uint16Array.from(columns.u),
      v: Uint16Array.from(columns.v),
      y: Int32Array.from(columns.y),
      e: Uint8Array.from(columns.e),
    };
  });
}
