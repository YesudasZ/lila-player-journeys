/**
 * Pan and zoom maths for the map. Pure functions; the components only call them.
 *
 * A view names the image point at the centre of the viewport and a zoom relative to "fit".
 * It does not depend on the size of the window, so a resize keeps the framing and the view
 * can be shared in a link. Everything that needs pixels takes the stage as well.
 */
import type { Point, Size } from "./projection.ts";

/** A rectangle in image pixels. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** What a view is looked at through: the viewport in CSS pixels and the artwork's box in image pixels. */
export interface Stage {
  viewport: Size;
  artwork: Box;
}

/** The image point at the centre of the viewport, and the zoom: 1 shows the whole artwork, 2 is twice as close. */
export interface View {
  x: number;
  y: number;
  zoom: number;
}

/** CSS pixels kept free on every side of the artwork when it is fitted. */
export const FIT_MARGIN = 24;
/** CSS pixels per image pixel at the closest zoom. Beyond this the minimap is only blur. */
export const CLOSEST_SCALE = 4;

const clamp = (value: number, low: number, high: number): number => Math.min(Math.max(value, low), high);

/** CSS pixels per image pixel at which the artwork fits the viewport with the margin free on every side. */
export function fitScale({ viewport, artwork }: Stage): number {
  const across = (viewport.width - 2 * FIT_MARGIN) / (artwork.right - artwork.left);
  const down = (viewport.height - 2 * FIT_MARGIN) / (artwork.bottom - artwork.top);
  return Math.max(Math.min(across, down), 1e-6); // a viewport smaller than its margins still gets a positive scale
}

/** The largest zoom allowed on this stage. */
export function closestZoom(stage: Stage): number {
  return Math.max(1, CLOSEST_SCALE / fitScale(stage));
}

/** The view that shows the whole artwork, centred. */
export function fitView(artwork: Box): View {
  return { x: (artwork.left + artwork.right) / 2, y: (artwork.top + artwork.bottom) / 2, zoom: 1 };
}

/** CSS pixels per image pixel of a view. */
export function scaleOf(view: View, stage: Stage): number {
  return fitScale(stage) * view.zoom;
}

/** Where an image point lies in the viewport, in CSS pixels from its top left corner. */
export function imageToScreen(point: Point, view: View, stage: Stage): Point {
  const scale = scaleOf(view, stage);
  return {
    x: (point.x - view.x) * scale + stage.viewport.width / 2,
    y: (point.y - view.y) * scale + stage.viewport.height / 2,
  };
}

/** The inverse of `imageToScreen`: the image point under a point of the viewport. */
export function screenToImage(point: Point, view: View, stage: Stage): Point {
  const scale = scaleOf(view, stage);
  return {
    x: (point.x - stage.viewport.width / 2) / scale + view.x,
    y: (point.y - stage.viewport.height / 2) / scale + view.y,
  };
}

/**
 * Along one axis: the centre may leave the middle of the artwork by as much of the artwork as the
 * zoom has pushed out of view. Nothing at zoom 1, a quarter of its length at zoom 2, almost half far in.
 */
function clampCentre(centre: number, low: number, high: number, zoom: number): number {
  const middle = (low + high) / 2;
  const reach = ((high - low) / 2) * (1 - 1 / zoom);
  return clamp(centre, middle - reach, middle + reach);
}

/**
 * The nearest view that is allowed: zoom between fit and the closest zoom, and the map never moved
 * so far that a side shows more empty space than the fitted map has there. The centre of the
 * viewport therefore stays inside the artwork, and a view at zoom 1 is always the fit view.
 * A view that is not made of numbers, from a damaged link for example, becomes the fit view.
 */
export function clampView(view: View, stage: Stage): View {
  const { artwork } = stage;
  if (![view.x, view.y, view.zoom].every(Number.isFinite)) return fitView(artwork);
  const zoom = clamp(view.zoom, 1, closestZoom(stage));
  return {
    x: clampCentre(view.x, artwork.left, artwork.right, zoom),
    y: clampCentre(view.y, artwork.top, artwork.bottom, zoom),
    zoom,
  };
}

/** Which ends of the zoom range a view has reached. */
export interface ZoomLimits {
  /** The map is fitted: it cannot be zoomed out further. */
  atFit: boolean;
  /** The map is at its closest zoom. */
  atClosest: boolean;
}

export function zoomLimits(view: View, stage: Stage): ZoomLimits {
  return { atFit: view.zoom <= 1, atClosest: view.zoom >= closestZoom(stage) };
}

/** Zoom by a factor so that the image point under `anchor` (a point of the viewport) stays under it where the limits allow. */
export function zoomAt(view: View, factor: number, anchor: Point, stage: Stage): View {
  const under = screenToImage(anchor, view, stage);
  const zoom = clamp(view.zoom * factor, 1, closestZoom(stage));
  const scale = fitScale(stage) * zoom;
  return clampView(
    {
      x: under.x - (anchor.x - stage.viewport.width / 2) / scale,
      y: under.y - (anchor.y - stage.viewport.height / 2) / scale,
      zoom,
    },
    stage,
  );
}

/** Move the map by a number of CSS pixels: a drag to the right is a positive `dx`. */
export function panBy(view: View, dx: number, dy: number, stage: Stage): View {
  const scale = scaleOf(view, stage);
  return clampView({ x: view.x - dx / scale, y: view.y - dy / scale, zoom: view.zoom }, stage);
}

/** The whole image as a rectangle of the viewport, for drawing it. */
export function imageRect(view: View, stage: Stage, image: Size): { x: number; y: number; width: number; height: number } {
  const scale = scaleOf(view, stage);
  const corner = imageToScreen({ x: 0, y: 0 }, view, stage);
  return { x: corner.x, y: corner.y, width: image.width * scale, height: image.height * scale };
}

const PIXELS_PER_LINE = 16;
const PIXELS_PER_PAGE = 400;
const WHEEL_RATE = 0.0015;
const PINCH_RATE = 0.01;

/**
 * The zoom factor of one wheel event. Scrolling up zooms in. A trackpad pinch arrives as a wheel
 * event with the ctrl key set and small deltas, so it gets a higher rate. One event never zooms
 * by more than a factor of two.
 */
export function wheelZoomFactor(deltaY: number, deltaMode: number, pinch: boolean): number {
  const pixels = deltaMode === 1 ? deltaY * PIXELS_PER_LINE : deltaMode === 2 ? deltaY * PIXELS_PER_PAGE : deltaY;
  return clamp(Math.exp(-pixels * (pinch ? PINCH_RATE : WHEEL_RATE)), 0.5, 2);
}
