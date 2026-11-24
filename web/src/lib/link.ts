/**
 * A view as a link. The address holds everything that says what is shown: the map, the days, the
 * open match and the time its playback stands at, the focused journey, the switches set by hand, the fates and the open map's view.
 * Every part is left out at its default, so the bare address is the default view. Pure.
 */
import { LAYER_KEYS, type LayerKey, type Shown } from "./drawList.ts";
import { HEAT_KINDS, type HeatKind } from "./heat.ts";
import type { Manifest } from "./manifest.ts";
import type { View } from "./view.ts";

export interface Link {
  /** The id of the open map; null is the first map of the manifest. */
  map: string | null;
  /** The chosen day folders; none means all days. */
  days: string[];
  /** The open match; null shows all matches. */
  match: string | null;
  /** Seconds into the open match at which playback stands; null is its end, where the whole match is shown. */
  t: number | null;
  /**
   * The id of the focused journey, if there is one, as the data names it (docs/DATA_FORMAT.md):
   * `<match>-<player>` for a human with an account, both parts being the first eight characters of
   * the ids; `<match>-anon` for a human whose account id was not recorded, of whom a match has at
   * most one; `<match>-bot<number>` for a bot.
   */
  journey: string | null;
  /** The switches set by hand. */
  choices: Partial<Shown>;
  /** The chosen fates; none means all. */
  fates: string[];
  /** The heat layer that is on; null when none is. */
  heat: HeatKind | null;
  /** The open map's view; null is the fitted map. */
  view: View | null;
}

export const DEFAULT_LINK: Link = { map: null, days: [], match: null, t: null, journey: null, choices: {}, fates: [], heat: null, view: null };

const tenth = (value: number): number => Math.round(value * 10) / 10;
const thousandth = (value: number): number => Math.round(value * 1000) / 1000;
const isLayer = (text: string): text is LayerKey => (LAYER_KEYS as readonly string[]).includes(text);
const isHeat = (text: string | null): text is HeatKind => (HEAT_KINDS as readonly (string | null)[]).includes(text);
/** A view from a link is kept when it can be one: closer than fit, not absurdly close, and centred on the image. */
const MOST_ZOOM = 64;
const possible = (view: View, image: { width: number; height: number }): boolean =>
  view.zoom > 1 && view.zoom <= MOST_ZOOM && view.x >= 0 && view.x <= image.width && view.y >= 0 && view.y <= image.height;

const listOf = (value: string | null): string[] => (value === null || value === "" ? [] : value.split(","));

/** A time as a link holds it: to a tenth of a second. */
export function roundedTime(time: number): number {
  return tenth(time);
}

/** A view as a link holds it: the point to a tenth of an image pixel, the zoom to a thousandth. */
export function roundedView(view: View): View {
  return { x: tenth(view.x), y: tenth(view.y), zoom: thousandth(view.zoom) };
}

/**
 * The query of an address for a link: "" for the default view, else "?map=…&…", always in the same
 * order. Ids are written as they are, a comma separates the entries of a list.
 */
export function encodeLink(link: Link): string {
  const parts: [string, string][] = [];
  if (link.map !== null) parts.push(["map", link.map]);
  if (link.days.length > 0) parts.push(["days", link.days.join(",")]);
  if (link.match !== null) parts.push(["match", link.match]);
  if (link.t !== null) parts.push(["t", `${roundedTime(link.t)}`]);
  if (link.journey !== null) parts.push(["journey", link.journey]);
  const shown = LAYER_KEYS.filter((layer) => link.choices[layer] === true);
  const hidden = LAYER_KEYS.filter((layer) => link.choices[layer] === false);
  if (shown.length > 0) parts.push(["show", shown.join(",")]);
  if (hidden.length > 0) parts.push(["hide", hidden.join(",")]);
  if (link.fates.length > 0) parts.push(["fate", link.fates.join(",")]);
  if (link.heat !== null) parts.push(["heat", link.heat]);
  if (link.view) {
    const { x, y, zoom } = roundedView(link.view);
    parts.push(["view", `${x},${y},${zoom}`]);
  }
  if (parts.length === 0) return "";
  return `?${parts.map(([key, value]) => `${key}=${encodeURIComponent(value).replaceAll("%2C", ",")}`).join("&")}`;
}

/**
 * What the query of an address says, read as text. Ids stay text, also when they look like a
 * number. Nothing is checked against the data here: `checkedLink` does that.
 */
export function decodeLink(query: string): Link {
  const params = new URLSearchParams(query);
  const choices: Partial<Shown> = {};
  for (const layer of listOf(params.get("show"))) if (isLayer(layer)) choices[layer] = true;
  for (const layer of listOf(params.get("hide"))) if (isLayer(layer)) choices[layer] = false;
  const parts = listOf(params.get("view"));
  const numbers = parts.map(Number);
  const view = parts.length === 3 && parts.every((part) => part.trim() !== "") && numbers.every(Number.isFinite) ? { x: numbers[0], y: numbers[1], zoom: numbers[2] } : null;
  const typed = params.get("t");
  const heat = params.get("heat");
  const time = typed !== null && typed.trim() !== "" && Number.isFinite(Number(typed)) ? Number(typed) : null;
  return {
    map: params.get("map"),
    days: listOf(params.get("days")),
    match: params.get("match"),
    t: time,
    journey: params.get("journey"),
    choices,
    fates: listOf(params.get("fate")),
    heat: isHeat(heat) ? heat : null,
    view,
  };
}

/**
 * A link with everything dropped that the data does not have: an unknown map, day or fate, and a
 * match that is not on that map or not on the chosen days, a view that no window could show. Days and fates come back in the order
 * of the manifest and the first map as null, so that what is applied is what is written back.
 * The focused journey cannot be checked before the journeys of the map have arrived.
 */
export function checkedLink(link: Link, manifest: Manifest): Link {
  const [first] = manifest.maps;
  const map = manifest.maps.find((entry) => entry.id === link.map) ?? first;
  const days = manifest.days.map((day) => day.id).filter((id) => link.days.includes(id));
  const fates = manifest.fates.filter((fate) => link.fates.includes(fate));
  const match = manifest.matches.find((entry) => entry.id === link.match && entry.map === map.id && (days.length === 0 || days.includes(entry.day)));
  const time = link.t === null ? null : roundedTime(link.t);
  return {
    map: map === first ? null : map.id,
    days,
    match: match?.id ?? null,
    t: match && time !== null && time >= 0 && time < match.span ? time : null, // a time belongs to its match, and its end is said by leaving it out
    journey: link.journey,
    choices: link.choices,
    fates,
    heat: link.heat,
    view: link.view && possible(link.view, map.minimap) ? roundedView(link.view) : null,
  };
}
