/**
 * The manifest: what the app loads first. The fields are described in docs/DATA_FORMAT.md;
 * `parseManifest` refuses a file that does not have them, so that a wrong or outdated data file
 * shows as an error and never as a wrong map.
 */
import { DataError, Reader, asCode, asText } from "./reader.ts";
import type { Box } from "./view.ts";

/** The artwork inside a minimap image, as fractions of the image measured from its left and top edges. */
export interface ArtworkBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Minimap {
  /** Path of the WebP file, relative to the data folder. */
  file: string;
  /** Size of that file in pixels. */
  width: number;
  height: number;
  /** The rest of the image is black surround. */
  artwork: ArtworkBox;
}

export interface MapEntry {
  /** The map id used in the data, for example "AmbroseValley". */
  id: string;
  /** The map's name for people, for example "Ambrose Valley". */
  name: string;
  /** World units spanned by the full image, in both directions. */
  scale: number;
  /** World x at the left edge of the image. */
  origin_x: number;
  /** World z at the bottom edge of the image. */
  origin_z: number;
  minimap: Minimap;
  /** Path of the map's journeys, relative to the data folder. */
  journeys_file: string;
  matches: number;
  journeys: number;
}

export interface DayEntry {
  /** The day folder, for example "February_10". */
  id: string;
  /** Its date as ISO text. */
  date: string;
  /** True for the day on which collection was still running. */
  partial: boolean;
  matches: number;
}

/** What is counted for a match, and summed in the totals. Every marker is counted exactly once. */
export interface Counts {
  /** Journeys of humans, the anonymous ones included. */
  humans: number;
  /** Of those, the journeys without an account id. */
  anonymous: number;
  /** Journeys of bots. */
  bots: number;
  /** Kill markers of humans. */
  kills: number;
  /** Deaths of humans in combat. Storm deaths are not included. */
  deaths: number;
  storm_deaths: number;
  loot: number;
  /** Kill markers of bots. */
  bot_kills: number;
  /** Deaths of bots. */
  bot_deaths: number;
  /** All rows. */
  rows: number;
}

export interface MatchEntry extends Counts {
  /** The first 8 characters of the match id. Always text, even when it looks like a number. */
  id: string;
  /** The id of its map. */
  map: string;
  /** The id of its day folder. Filters use this, never the date of `start`. */
  day: string;
  /** Unix seconds, UTC, of the first recorded row. */
  start: number;
  /** Seconds from `start` to the last recorded row. Not the length of the match. */
  span: number;
}

export interface Manifest {
  encoding: {
    /** A stored u or v is a whole number from 0 to this. */
    uv_steps: number;
    /** A stored elevation counts this many steps per world unit. */
    elevation_steps_per_unit: number;
  };
  /** A moving player's position is recorded this often, in seconds. */
  sample_step_seconds: number;
  /** Event names. An event's position in this list is its code in the journeys. */
  events: string[];
  /** The event codes behind each thing the app draws. */
  event_groups: Record<"movement" | "kill" | "death" | "storm_death" | "loot", number[]>;
  /** Every value a journey's `fate` can take. */
  fates: string[];
  maps: MapEntry[];
  days: DayEntry[];
  totals: Counts & { matches: number };
  matches: MatchEntry[];
}

function countsOf(entry: Reader): Counts {
  return {
    humans: entry.number("humans"),
    anonymous: entry.number("anonymous"),
    bots: entry.number("bots"),
    kills: entry.number("kills"),
    deaths: entry.number("deaths"),
    storm_deaths: entry.number("storm_deaths"),
    loot: entry.number("loot"),
    bot_kills: entry.number("bot_kills"),
    bot_deaths: entry.number("bot_deaths"),
    rows: entry.number("rows"),
  };
}

function asMap(value: unknown, path: string): MapEntry {
  const map = new Reader(value, path);
  const minimap = map.object("minimap");
  const artwork = minimap.object("artwork");
  const box = { left: artwork.number("left"), top: artwork.number("top"), right: artwork.number("right"), bottom: artwork.number("bottom") };
  const inside = 0 <= box.left && box.left < box.right && box.right <= 1 && 0 <= box.top && box.top < box.bottom && box.bottom <= 1;
  if (!inside) throw new DataError(`${path}.minimap.artwork is not a box inside the image`);
  return {
    id: map.text("id"),
    name: map.text("name"),
    scale: map.positive("scale"),
    origin_x: map.number("origin_x"),
    origin_z: map.number("origin_z"),
    minimap: { file: minimap.text("file"), width: minimap.positive("width"), height: minimap.positive("height"), artwork: box },
    journeys_file: map.text("journeys_file"),
    matches: map.number("matches"),
    journeys: map.number("journeys"),
  };
}

function asDay(value: unknown, path: string): DayEntry {
  const day = new Reader(value, path);
  return { id: day.text("id"), date: day.text("date"), partial: day.flag("partial"), matches: day.number("matches") };
}

function asMatch(value: unknown, path: string): MatchEntry {
  const match = new Reader(value, path);
  return {
    id: match.text("id"),
    map: match.text("map"),
    day: match.text("day"),
    start: match.number("start"),
    span: match.number("span"),
    ...countsOf(match),
  };
}

/**
 * The manifest, checked field by field. Anything missing or of the wrong kind is a DataError that
 * names it; so is a value that would draw a wrong map: a size or scale of zero, an artwork box that
 * is not inside its image, two maps with one id, an event code that stands for no event.
 */
export function parseManifest(value: unknown): Manifest {
  const manifest = new Reader(value, "manifest");
  const encoding = manifest.object("encoding");
  const groups = manifest.object("event_groups");
  const totals = manifest.object("totals");
  const maps = manifest.list("maps", asMap);
  if (maps.length === 0) throw new DataError("manifest.maps is empty");
  if (new Set(maps.map((map) => map.id)).size < maps.length) throw new DataError("manifest.maps has two maps with one id");
  const events = manifest.list("events", asText);
  const group = (name: string): number[] => {
    const codes = groups.list(name, asCode);
    if (codes.some((code) => code < 0 || code >= events.length)) throw new DataError(`manifest.event_groups.${name} has a code that stands for no event`);
    return codes;
  };
  return {
    encoding: { uv_steps: encoding.number("uv_steps"), elevation_steps_per_unit: encoding.number("elevation_steps_per_unit") },
    sample_step_seconds: manifest.number("sample_step_seconds"),
    events,
    event_groups: { movement: group("movement"), kill: group("kill"), death: group("death"), storm_death: group("storm_death"), loot: group("loot") },
    fates: manifest.list("fates", asText),
    maps,
    days: manifest.list("days", asDay),
    totals: { matches: totals.number("matches"), ...countsOf(totals) },
    matches: manifest.list("matches", asMatch),
  };
}

/** The artwork of a map's minimap as a box in image pixels, the unit the view works in. */
export function artworkInPixels({ width, height, artwork }: Minimap): Box {
  return { left: artwork.left * width, top: artwork.top * height, right: artwork.right * width, bottom: artwork.bottom * height };
}
