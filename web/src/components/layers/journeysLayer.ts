/**
 * The journeys layer: paths, heads and markers of the draw list, and what is under the pointer.
 *
 * Paths are built once per draw list, in image pixels, and drawn under the transform of the view,
 * so panning and zooming rebuild nothing. Heads and markers are drawn at their size on screen.
 * What is drawn and what is picked comes from web/src/lib; this file only draws and listens.
 */
import type { DrawList, DrawnJourney, MarkerKind } from "../../lib/drawList.ts";
import type { Journey } from "../../lib/journeys.ts";
import { HEAD_RADIUS, MARKER_SHAPES, STROKES } from "../../lib/markerShapes.ts";
import { pickMarker, pickPath, type PickedRow } from "../../lib/pick.ts";
import type { Point, Size } from "../../lib/projection.ts";
import { imageToScreen, scaleOf, screenToImage } from "../../lib/view.ts";
import { selectDrawList } from "../../state/shown.ts";
import { useAppStore } from "../../state/store.ts";
import type { Frame, Layer } from "../mapSurface.ts";

const MARKER_REACH = 10; // CSS pixels within which a marker is under the pointer
const PATH_REACH = 6; // the same for a path
const DIMMED = 0.2; // the strength of everything else while one journey is focused
const OFF_SCREEN = 12; // CSS pixels beyond the viewport within which a marker is still drawn
/**
 * While all matches are open the lines are thin and half transparent, so that many paths over each
 * other read as density, and heads and markers are smaller, so that hundreds of them leave the paths visible.
 */
const LOOKS = { single: { width: STROKES.line, strength: 0.95, size: 1 }, all: { width: 1.25, strength: 0.5, size: 0.7 } };
/** The time of the last draw, for the browser's Performance panel and for the reading in PROGRESS.md. */
const DRAW_MEASURE = "journeys-draw";

/** What is under the pointer, for the tooltip. */
export interface Hover {
  /** Where it is in the map area, in CSS pixels, and how large that area is. */
  at: Point;
  viewport: Size;
  journey: Journey;
  row: number;
  /** The marker, with the last of the rows it stands for, or null when the pointer is on a path. */
  marker: { kind: MarkerKind; count: number; last: number } | null;
}

interface Parts {
  canvas: HTMLCanvasElement;
  /** A canvas of its own, above, for the ring around what is under the pointer: a moving pointer then redraws no journey. */
  ringCanvas: HTMLCanvasElement;
  /** Told when the thing under the pointer changes or moves on screen; null when there is none. */
  onHover: (hover: Hover | null) => void;
}

interface JourneysLayer {
  layer: Layer;
  ring: Layer;
  /** For the surface's `onPointer`, `onClick` and `onDoubleClick`. */
  point: (at: Point | null, frame: Frame) => void;
  click: (at: Point, frame: Frame) => void;
  unclick: () => void;
  /** Call `redraw` with one of the two layers whenever it has to be drawn again. Returns what stops the watching. */
  watch: (redraw: (layer: Layer) => void) => () => void;
}

/** One journey's path as a shape in image pixels; null when it has a single row, which its head shows. */
function pathOf({ x, y, pathLength }: DrawnJourney): Path2D | null {
  if (pathLength < 2) return null;
  const path = new Path2D();
  path.moveTo(x[0], y[0]);
  for (let row = 1; row < pathLength; row += 1) path.lineTo(x[row], y[row]);
  return path;
}

export function createJourneysLayer({ canvas, ringCanvas, onHover }: Parts): JourneysLayer {
  const style = getComputedStyle(canvas);
  const token = (name: string) => style.getPropertyValue(name).trim();
  const colours = {
    human: token("--color-human"),
    bot: token("--color-bot"),
    kill: token("--color-kill"),
    death: token("--color-death"),
    storm_death: token("--color-storm"),
    loot: token("--color-loot"),
    highlight: token("--color-highlight"),
    outline: token("--color-bg"),
    text: token("--color-text"),
  };
  const countFont = `10px ${token("--font-mono")}`;

  let shapes: { list: DrawList; paths: (Path2D | null)[] } | null = null;
  let hover: (PickedRow & { marker: number | null; list: DrawList }) | null = null;
  let told: string | null = null; // what the tooltip was last told, so that nothing is said twice
  let beforeClick: string | null = null; // the focus before the last click, to give back when that click was half of a double-click
  let redraw: (layer: Layer) => void = () => {};

  const listNow = () => selectDrawList(useAppStore.getState());

  const stamps = new Map<string, HTMLCanvasElement>();
  /**
   * A marker with its dark outline, drawn once at the resolution of the screen and then stamped
   * wherever it is needed. Thousands of markers cost little this way; drawn as shapes on every
   * frame, the loot markers of one map alone took longer than a frame.
   */
  function stampOf(kind: MarkerKind, size: number, ratio: number): HTMLCanvasElement {
    const key = `${kind} ${size} ${ratio}`;
    const known = stamps.get(key);
    if (known) return known;
    const { lines, filled } = MARKER_SHAPES[kind];
    const radius = MARKER_SHAPES[kind].radius * size;
    const stamp = document.createElement("canvas");
    stamp.width = Math.ceil((radius + STROKES.outline + STROKES.open) * 2 * ratio) + 2;
    stamp.height = stamp.width;
    const pen = stamp.getContext("2d");
    if (!pen) throw new Error("this browser cannot draw on a canvas");
    pen.setTransform(ratio, 0, 0, ratio, stamp.width / 2, stamp.height / 2);
    pen.lineJoin = "round";
    pen.lineCap = "round";
    pen.beginPath();
    for (const points of lines) {
      pen.moveTo(points[0] * radius, points[1] * radius);
      for (let at = 2; at < points.length; at += 2) pen.lineTo(points[at] * radius, points[at + 1] * radius);
      if (filled) pen.closePath();
    }
    pen.strokeStyle = colours.outline;
    pen.lineWidth = filled ? STROKES.outline * 2 : STROKES.open + STROKES.outline * 2;
    pen.stroke();
    if (filled) {
      pen.fillStyle = colours[kind];
      pen.fill();
    } else {
      pen.strokeStyle = colours[kind];
      pen.lineWidth = STROKES.open;
      pen.stroke();
    }
    stamps.set(key, stamp);
    return stamp;
  }

  function draw(context: CanvasRenderingContext2D, { view, stage, ratio }: Frame) {
    const list = listNow();
    if (!list) return;
    const started = performance.now();
    if (shapes?.list !== list) shapes = { list, paths: list.journeys.map(pathOf) };
    const { paths } = shapes;
    const { focus } = useAppStore.getState();
    const focused = focus === null ? -1 : list.journeys.findIndex((drawn) => drawn.journey.id === focus);
    const rest = focused === -1 ? 1 : DIMMED;
    const scale = scaleOf(view, stage);
    const corner = imageToScreen({ x: 0, y: 0 }, view, stage); // where the image's top left corner lies on screen
    const look = list.single ? LOOKS.single : LOOKS.all;
    const head = HEAD_RADIUS * look.size;

    // Paths: shapes in image pixels, under the transform of the view.
    context.setTransform(ratio * scale, 0, 0, ratio * scale, ratio * corner.x, ratio * corner.y);
    context.lineJoin = "round";
    context.lineCap = "round";
    const stroke = (index: number, width: number) => {
      const path = paths[index];
      if (!path) return;
      const bot = list.journeys[index].journey.actor === "bot";
      context.strokeStyle = bot ? colours.bot : colours.human;
      context.setLineDash(bot ? STROKES.botDash.map((length) => length / scale) : []);
      context.lineWidth = width / scale;
      context.stroke(path);
    };
    context.globalAlpha = look.strength * rest;
    for (const index of paths.keys()) stroke(index, look.width);
    if (focused !== -1 && paths[focused]) {
      context.globalAlpha = 0.9;
      context.setLineDash([]);
      context.strokeStyle = colours.highlight;
      context.lineWidth = (look.width + 5) / scale;
      context.stroke(paths[focused]);
      context.globalAlpha = 1;
      stroke(focused, look.width + 0.5);
    }
    context.setLineDash([]);

    // Heads and markers: at their size on screen, whatever the zoom.
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const inView = (x: number, y: number) => x > -OFF_SCREEN && y > -OFF_SCREEN && x < stage.viewport.width + OFF_SCREEN && y < stage.viewport.height + OFF_SCREEN;

    /** The heads of all journeys, or of one: a circle for a human, a square for a bot, at the end of the path. */
    const heads = (only: number | null) => {
      for (const actor of ["human", "bot"] as const) {
        context.beginPath();
        for (const [index, drawn] of list.journeys.entries()) {
          if (drawn.journey.actor !== actor || (only !== null && index !== only)) continue;
          const x = drawn.x[drawn.pathLength - 1] * scale + corner.x;
          const y = drawn.y[drawn.pathLength - 1] * scale + corner.y;
          if (!inView(x, y)) continue;
          if (actor === "human") {
            context.moveTo(x + head, y);
            context.arc(x, y, head, 0, Math.PI * 2);
          } else {
            context.rect(x - head, y - head, head * 2, head * 2);
          }
        }
        context.strokeStyle = colours.outline;
        context.lineWidth = STROKES.outline * 2;
        context.stroke();
        context.fillStyle = colours[actor];
        context.fill();
      }
    };

    /**
     * The markers of all journeys, or of one, in the order of the draw list: loot at the bottom, kills
     * on top. Each is a stamp set down on a whole device pixel, so it stays sharp. In a single match a
     * marker that stands for several rows carries their number.
     */
    const markers = (only: number | null) => {
      context.font = countFont;
      context.textBaseline = "middle";
      context.lineWidth = STROKES.outline * 2;
      context.strokeStyle = colours.outline;
      context.fillStyle = colours.text;
      for (const marker of list.markers) {
        if (only !== null && marker.journey !== only) continue;
        const drawn = list.journeys[marker.journey];
        const x = drawn.x[marker.row] * scale + corner.x;
        const y = drawn.y[marker.row] * scale + corner.y;
        if (!inView(x, y)) continue;
        const stamp = stampOf(marker.kind, look.size, ratio);
        const side = stamp.width / ratio;
        context.drawImage(stamp, Math.round((x - side / 2) * ratio) / ratio, Math.round((y - side / 2) * ratio) / ratio, side, side);
        if (!list.single || marker.count < 2) continue;
        const radius = MARKER_SHAPES[marker.kind].radius;
        context.strokeText(`${marker.count}`, x + radius + 3, y - radius);
        context.fillText(`${marker.count}`, x + radius + 3, y - radius);
      }
    };

    context.globalAlpha = rest;
    heads(null);
    markers(null);
    if (focused !== -1) {
      context.globalAlpha = 1;
      heads(focused);
      markers(focused);
    }
    context.globalAlpha = 1;

    performance.clearMeasures(DRAW_MEASURE);
    performance.measure(DRAW_MEASURE, { start: started, end: performance.now() });
  }

  /** The ring around what is under the pointer. */
  function drawRing(context: CanvasRenderingContext2D, { view, stage }: Frame) {
    if (!hover || hover.list !== listNow()) return;
    const { list } = hover;
    const drawn = list.journeys[hover.journey];
    const size = list.single ? LOOKS.single.size : LOOKS.all.size;
    const reach = (hover.marker === null ? HEAD_RADIUS : MARKER_SHAPES[list.markers[hover.marker].kind].radius) * size + 4;
    const at = imageToScreen({ x: drawn.x[hover.row], y: drawn.y[hover.row] }, view, stage);
    context.beginPath();
    context.arc(at.x, at.y, reach, 0, Math.PI * 2);
    context.strokeStyle = colours.outline;
    context.lineWidth = 4;
    context.stroke();
    context.strokeStyle = colours.highlight;
    context.lineWidth = 1.5;
    context.stroke();
  }

  const layer: Layer = { canvas, draw };
  const ring: Layer = { canvas: ringCanvas, draw: drawRing };

  /** What lies under a point of the map: a marker first, then a path. */
  function pick(at: Point, frame: Frame, list: DrawList): (PickedRow & { marker: number | null }) | null {
    const scale = scaleOf(frame.view, frame.stage);
    const onImage = screenToImage(at, frame.view, frame.stage);
    const marker = pickMarker(onImage, MARKER_REACH / scale, list);
    if (marker !== null) return { marker, journey: list.markers[marker].journey, row: list.markers[marker].row };
    const path = pickPath(onImage, PATH_REACH / scale, list);
    return path && { marker: null, ...path };
  }

  function tell(frame: Frame | null) {
    if (!hover || !frame) {
      if (told !== null) onHover(null);
      told = null;
      return;
    }
    const { list } = hover;
    const drawn = list.journeys[hover.journey];
    const at = imageToScreen({ x: drawn.x[hover.row], y: drawn.y[hover.row] }, frame.view, frame.stage);
    const saying = `${drawn.journey.id} ${hover.row} ${hover.marker ?? "path"} ${Math.round(at.x)} ${Math.round(at.y)}`;
    if (saying === told) return;
    told = saying;
    const marker = hover.marker === null ? null : list.markers[hover.marker];
    onHover({ at, viewport: frame.stage.viewport, journey: drawn.journey, row: hover.row, marker: marker && { kind: marker.kind, count: marker.count, last: marker.last } });
  }

  function point(at: Point | null, frame: Frame) {
    const list = listNow();
    const found = at && list ? pick(at, frame, list) : null;
    const next = found && list ? { ...found, list } : null;
    const same = next?.list === hover?.list && next?.journey === hover?.journey && next?.row === hover?.row && next?.marker === hover?.marker;
    hover = next;
    if (!same) redraw(ring); // only the ring moves; the journeys stay as they are
    tell(frame);
  }

  function click(at: Point, frame: Frame) {
    const list = listNow();
    const found = list && pick(at, frame, list);
    const { focus, setFocus } = useAppStore.getState();
    beforeClick = focus;
    setFocus(found ? list.journeys[found.journey].journey.id : null);
  }

  /** The last click was the first half of a double-click, which zooms: the focus goes back to what it was. */
  function unclick() {
    useAppStore.getState().setFocus(beforeClick);
  }

  function watch(notify: (layer: Layer) => void): () => void {
    redraw = notify;
    let before = { list: listNow(), focus: useAppStore.getState().focus };
    const stop = useAppStore.subscribe((state) => {
      const now = { list: selectDrawList(state), focus: state.focus };
      if (now.list === before.list && now.focus === before.focus) return;
      if (now.list !== before.list) {
        hover = null; // what was under the pointer belongs to a draw list that is gone
        tell(null);
        notify(ring);
      }
      before = now;
      notify(layer);
    });
    return () => {
      stop();
      redraw = () => {};
    };
  }

  return { layer, ring, point, click, unclick, watch };
}
