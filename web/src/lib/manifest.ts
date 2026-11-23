/**
 * The manifest: what the app loads first. The fields are described in docs/DATA_FORMAT.md;
 * `parseManifest` refuses a file that does not have them, so that a wrong or outdated data file
 * shows as an error and never as a wrong map.
 */
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

const COUNTS = ["humans", "anonymous", "bots", "kills", "deaths", "storm_deaths", "loot", "bot_kills", "bot_deaths", "rows"] as const;
const EVENT_GROUPS = ["movement", "kill", "death", "storm_death", "loot"] as const;

class Reader {
  private readonly value: Record<string, unknown>;
  private readonly path: string;

  constructor(value: unknown, path: string) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${path} is missing or not an object`);
    this.value = value as Record<string, unknown>;
    this.path = path;
  }

  private fail(key: string, wanted: string): never {
    throw new Error(`${this.path}.${key} is missing or not ${wanted}`);
  }

  text(key: string): string {
    const found = this.value[key];
    return typeof found === "string" ? found : this.fail(key, "text");
  }

  number(key: string): number {
    const found = this.value[key];
    return typeof found === "number" && Number.isFinite(found) ? found : this.fail(key, "a number");
  }

  flag(key: string): boolean {
    const found = this.value[key];
    return typeof found === "boolean" ? found : this.fail(key, "true or false");
  }

  object(key: string): Reader {
    return new Reader(this.value[key], `${this.path}.${key}`);
  }

  list<T>(key: string, item: (value: unknown, path: string) => T): T[] {
    const found = this.value[key];
    if (!Array.isArray(found)) return this.fail(key, "a list");
    return found.map((value, index) => item(value, `${this.path}.${key}[${index}]`));
  }

  counts(): Counts {
    return Object.fromEntries(COUNTS.map((name) => [name, this.number(name)])) as unknown as Counts;
  }
}

const asText = (value: unknown, path: string): string => {
  if (typeof value !== "string") throw new Error(`${path} is not text`);
  return value;
};

const asCode = (value: unknown, path: string): number => {
  if (typeof value !== "number" || !Number.isInteger(value)) throw new Error(`${path} is not a whole number`);
  return value;
};

function asMap(value: unknown, path: string): MapEntry {
  const map = new Reader(value, path);
  const minimap = map.object("minimap");
  const artwork = minimap.object("artwork");
  return {
    id: map.text("id"),
    name: map.text("name"),
    scale: map.number("scale"),
    origin_x: map.number("origin_x"),
    origin_z: map.number("origin_z"),
    minimap: {
      file: minimap.text("file"),
      width: minimap.number("width"),
      height: minimap.number("height"),
      artwork: { left: artwork.number("left"), top: artwork.number("top"), right: artwork.number("right"), bottom: artwork.number("bottom") },
    },
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
    ...match.counts(),
  };
}

/** The manifest, checked field by field. Anything missing or of the wrong kind is an Error that names it. */
export function parseManifest(value: unknown): Manifest {
  const manifest = new Reader(value, "manifest");
  const encoding = manifest.object("encoding");
  const groups = manifest.object("event_groups");
  const totals = manifest.object("totals");
  const maps = manifest.list("maps", asMap);
  if (maps.length === 0) throw new Error("manifest.maps is empty");
  return {
    encoding: { uv_steps: encoding.number("uv_steps"), elevation_steps_per_unit: encoding.number("elevation_steps_per_unit") },
    sample_step_seconds: manifest.number("sample_step_seconds"),
    events: manifest.list("events", asText),
    event_groups: Object.fromEntries(EVENT_GROUPS.map((group) => [group, groups.list(group, asCode)])) as Manifest["event_groups"],
    fates: manifest.list("fates", asText),
    maps,
    days: manifest.list("days", asDay),
    totals: { matches: totals.number("matches"), ...totals.counts() },
    matches: manifest.list("matches", asMatch),
  };
}

/** The artwork of a map's minimap as a box in image pixels, the unit the view works in. */
export function artworkInPixels({ width, height, artwork }: Minimap): Box {
  return { left: artwork.left * width, top: artwork.top * height, right: artwork.right * width, bottom: artwork.bottom * height };
}
