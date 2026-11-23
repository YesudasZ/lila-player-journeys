/**
 * The map surface: a stack of canvases that share one view, and everything that moves it.
 *
 * This is plain DOM code on purpose. Panning and zooming happen many times a second, so they must
 * not go through a React render: the surface draws on the canvases, writes the read-out straight
 * into the page, and keeps the view in the store, where other parts of the app can read it.
 * What it computes lives in web/src/lib, where it is tested; here are only the events and the drawing.
 */
import { mapKeyAction } from "../lib/mapKeys.ts";
import { artworkInPixels, type MapEntry } from "../lib/manifest.ts";
import type { Point, Size } from "../lib/projection.ts";
import { unitsPerPixel, wholeUnits, worldUnder } from "../lib/readout.ts";
import { scaleBar, scaleBarLabel } from "../lib/scaleBar.ts";
import { clampView, fitView, panBy, wheelZoomFactor, zoomAt, zoomLimits, type Stage, type View, type ZoomLimits } from "../lib/view.ts";
import { useAppStore } from "../state/store.ts";

const DRAG_STARTS_AFTER = 3; // CSS pixels; a smaller movement is still a click
const DOUBLE_CLICK_ZOOM = 2;
const SCALE_BAR_MAX = 120; // CSS pixels
const NO_VALUE = "—";

/** What a layer is drawn for: the view, what it is looked at through, and the size of the minimap it lies on. */
export interface Frame {
  view: View;
  stage: Stage;
  /** The size of the minimap, in its own pixels. */
  image: Size;
  /** Device pixels per CSS pixel of the canvases. */
  ratio: number;
}

/** One canvas of the stack and what draws on it. */
export interface Layer {
  canvas: HTMLCanvasElement;
  /** Draw the layer. The canvas is cleared and scaled to CSS pixels before each call. */
  draw: (context: CanvasRenderingContext2D, frame: Frame) => void;
}

/** The elements of the read-out that the surface writes into. */
interface ReadoutParts {
  x: HTMLElement;
  z: HTMLElement;
  bar: HTMLElement;
  label: HTMLElement;
}

export interface MapSurface {
  /** Zoom by a factor about the centre of the viewport. */
  zoomBy: (factor: number) => void;
  /** Show the whole artwork again. */
  fit: () => void;
  /** Draw a layer again on the next frame: what it shows has changed. */
  invalidate: (layer: Layer) => void;
  /** Stop listening and drawing. */
  destroy: () => void;
}

interface Parts {
  /** The element around the map and its buttons. A key pressed anywhere inside it acts on the map. */
  area: HTMLElement;
  /** The focusable element that receives pointer and wheel events and gives the viewport its size. */
  surface: HTMLElement;
  map: MapEntry;
  /** The canvases, from the bottom of the stack to the top. */
  layers: readonly Layer[];
  readout: ReadoutParts;
  onLimits: (limits: ZoomLimits) => void;
  /** The pointer is at this point of the map, or nowhere on it (null): it left, or the map is being dragged. Also told when the map moved under a resting pointer. */
  onPointer?: (at: Point | null, frame: Frame) => void;
  /** A press and release without a drag. */
  onClick?: (at: Point, frame: Frame) => void;
  /** Esc was pressed inside the map area. */
  onEscape?: () => void;
}

/** Call `changed` whenever the device pixel ratio changes, for browsers whose ResizeObserver does not say so. */
function onPixelRatioChange(changed: () => void): () => void {
  let stop = () => {};
  const watch = () => {
    const query = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const listener = () => {
      changed();
      watch();
    };
    query.addEventListener("change", listener, { once: true });
    stop = () => {
      query.removeEventListener("change", listener);
    };
  };
  watch();
  return () => {
    stop();
  };
}

export function mountMapSurface({ area, surface, map, layers, readout, onLimits, onPointer, onClick, onEscape }: Parts): MapSurface {
  const contexts = new Map(
    layers.map((layer) => {
      const context = layer.canvas.getContext("2d");
      if (!context) throw new Error("this browser cannot draw on a canvas");
      return [layer, context];
    }),
  );
  const artwork = artworkInPixels(map.minimap);
  const imageSize: Size = { width: map.minimap.width, height: map.minimap.height };

  let viewport: Size = { width: surface.clientWidth, height: surface.clientHeight };
  let ratio = window.devicePixelRatio;
  let pending = 0; // the animation frame that has been asked for, 0 when there is none
  let rendering = false;
  let moved = true; // the view or the size changed since the last frame
  let pointed = false; // the pointer moved, came or left since the last frame
  const stale = new Set<Layer>(layers); // the layers that do not show the current state yet
  let pointer: Point | null = null; // where the pointer is over the surface, in CSS pixels
  let drag: { id: number; last: Point; moved: boolean } | null = null;
  let limits: ZoomLimits | null = null;

  const stage = (): Stage => ({ viewport, artwork });
  /** The view in the store, brought inside the limits of the stage as it is now. */
  const view = (): View => clampView(useAppStore.getState().views[map.id] ?? fitView(artwork), stage());
  const frameOf = (current: View): Frame => ({ view: current, stage: stage(), image: imageSize, ratio });
  const show = (next: View) => {
    useAppStore.getState().setView(map.id, next.zoom === 1 ? null : next); // a fitted map has no view of its own
  };

  function reportLimits(next: ZoomLimits) {
    if (limits?.atFit === next.atFit && limits.atClosest === next.atClosest) return;
    limits = next;
    onLimits(next);
  }

  function writePosition(current: View) {
    const world = pointer && worldUnder(pointer, current, stage(), imageSize, map);
    readout.x.textContent = world ? wholeUnits(world.x) : NO_VALUE;
    readout.z.textContent = world ? wholeUnits(world.z) : NO_VALUE;
  }

  /**
   * One frame. A layer is drawn only when the view or the size changed or it was invalidated; a
   * pointer that only moves changes two numbers, and whatever the layers make of it.
   */
  function render() {
    pending = 0;
    rendering = true;
    const current = view();
    const frame = frameOf(current);
    if (moved) for (const layer of layers) stale.add(layer);
    if (moved || pointed) onPointer?.(drag?.moved ? null : pointer, frame); // may invalidate a layer, which is then drawn below
    for (const layer of layers) {
      const context = contexts.get(layer);
      if (!context || !stale.has(layer)) continue;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";
      context.clearRect(0, 0, viewport.width, viewport.height);
      layer.draw(context, frame);
    }
    stale.clear();
    if (moved) {
      const bar = scaleBar(unitsPerPixel(current, frame.stage, imageSize, map), SCALE_BAR_MAX);
      readout.bar.style.width = `${bar.pixels}px`;
      readout.label.textContent = scaleBarLabel(bar.units);
      reportLimits(zoomLimits(current, frame.stage));
    }
    writePosition(current);
    moved = false;
    pointed = false;
    rendering = false;
  }

  function schedule() {
    if (!rendering) pending ||= requestAnimationFrame(render);
  }

  function invalidate(layer: Layer) {
    stale.add(layer);
    schedule();
  }

  /** The canvases get one pixel per device pixel, so the map is sharp on any screen. */
  function resize(css: Size, device: Size) {
    viewport = css;
    ratio = device.width / Math.max(css.width, 1);
    for (const { canvas } of layers) {
      canvas.width = device.width;
      canvas.height = device.height;
    }
    moved = true;
    cancelAnimationFrame(pending);
    render(); // now, not on the next frame: resizing a canvas clears it
  }

  const observer = new ResizeObserver((entries) => {
    const entry = entries.at(-1);
    if (!entry) return;
    const css = entry.contentBoxSize[0];
    const device = (entry.devicePixelContentBoxSize as readonly ResizeObserverSize[] | undefined)?.[0];
    const pixels = window.devicePixelRatio;
    resize(
      { width: css.inlineSize, height: css.blockSize },
      device ? { width: device.inlineSize, height: device.blockSize } : { width: Math.round(css.inlineSize * pixels), height: Math.round(css.blockSize * pixels) },
    );
  });
  let stopWatchingRatio = () => {};
  try {
    // reports the size in device pixels, and reports again when the window moves to a screen with another pixel ratio
    observer.observe(surface, { box: "device-pixel-content-box" });
  } catch {
    observer.observe(surface);
    stopWatchingRatio = onPixelRatioChange(() => {
      const pixels = window.devicePixelRatio;
      resize(viewport, { width: Math.round(viewport.width * pixels), height: Math.round(viewport.height * pixels) });
    });
  }

  const position = (event: MouseEvent): Point => {
    const box = surface.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };
  const centre = (): Point => ({ x: viewport.width / 2, y: viewport.height / 2 });

  /** The pointer is over the map: from here on the read-out has a position to show. */
  function onPointerSeen(event: PointerEvent) {
    pointer = position(event);
    pointed = true;
    schedule();
  }

  function onPointerDown(event: PointerEvent) {
    onPointerSeen(event); // a press may be the first sign of a pointer: a tap, or a mouse that rested here
    if (event.button !== 0 || drag || !pointer) return; // one drag at a time: a second finger does not take the map over
    drag = { id: event.pointerId, last: pointer, moved: false };
    surface.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent) {
    onPointerSeen(event);
    if (drag?.id !== event.pointerId || !pointer) return;
    if ((event.buttons & 1) === 0) {
      endDrag(); // the release never arrived, for example because another button was held meanwhile
      return;
    }
    const dx = pointer.x - drag.last.x;
    const dy = pointer.y - drag.last.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_STARTS_AFTER) return;
    drag = { ...drag, last: pointer, moved: true };
    const before = view();
    const after = panBy(before, dx, dy, stage());
    if (after.x === before.x && after.y === before.y) return; // nothing left to bring in on that side
    surface.dataset.dragging = ""; // the closed hand shows only once the map really moves
    show(after);
  }

  function endDrag() {
    drag = null;
    pointed = true; // whatever was under the pointer before the drag may be under it again
    delete surface.dataset.dragging;
    schedule();
  }

  function onPointerUp(event: PointerEvent) {
    if (drag?.id !== event.pointerId) return;
    const clicked = !drag.moved;
    endDrag();
    if (clicked) onClick?.(position(event), frameOf(view()));
  }

  function onPointerLost(event: PointerEvent) {
    if (drag?.id === event.pointerId) endDrag();
  }

  function onPointerLeave() {
    pointer = null;
    pointed = true;
    schedule();
  }

  function onWheel(event: WheelEvent) {
    event.preventDefault(); // neither scroll the page nor zoom the browser
    pointer = position(event); // a wheel may turn before the pointer has moved
    pointed = true;
    show(zoomAt(view(), wheelZoomFactor(event.deltaY, event.deltaMode, event.ctrlKey), pointer, stage()));
    schedule(); // at a zoom limit the view stays, the position under the pointer is still written
  }

  function onDoubleClick(event: MouseEvent) {
    show(zoomAt(view(), DOUBLE_CLICK_ZOOM, position(event), stage()));
  }

  function onKeyDown(event: KeyboardEvent) {
    const action = mapKeyAction(event);
    if (!action) return;
    event.preventDefault();
    if (action.kind === "pan") show(panBy(view(), action.dx, action.dy, stage()));
    else if (action.kind === "zoom") zoomBy(action.factor);
    else if (action.kind === "fit") fit();
    else onEscape?.();
  }

  function zoomBy(factor: number) {
    show(zoomAt(view(), factor, centre(), stage()));
  }

  function fit() {
    show(fitView(artwork));
  }

  surface.addEventListener("pointerenter", onPointerSeen);
  surface.addEventListener("pointerdown", onPointerDown);
  surface.addEventListener("pointermove", onPointerMove);
  surface.addEventListener("pointerup", onPointerUp);
  surface.addEventListener("pointercancel", onPointerLost);
  surface.addEventListener("lostpointercapture", onPointerLost);
  surface.addEventListener("pointerleave", onPointerLeave);
  surface.addEventListener("wheel", onWheel, { passive: false }); // React's onWheel is passive and cannot stop the scroll
  surface.addEventListener("dblclick", onDoubleClick);
  area.addEventListener("keydown", onKeyDown);
  const stopListening = useAppStore.subscribe((state, before) => {
    if (state.views[map.id] === before.views[map.id]) return;
    moved = true;
    schedule();
  });

  return {
    zoomBy,
    fit,
    invalidate,
    destroy() {
      observer.disconnect();
      stopWatchingRatio();
      stopListening();
      cancelAnimationFrame(pending);
      surface.removeEventListener("pointerenter", onPointerSeen);
      surface.removeEventListener("pointerdown", onPointerDown);
      surface.removeEventListener("pointermove", onPointerMove);
      surface.removeEventListener("pointerup", onPointerUp);
      surface.removeEventListener("pointercancel", onPointerLost);
      surface.removeEventListener("lostpointercapture", onPointerLost);
      surface.removeEventListener("pointerleave", onPointerLeave);
      surface.removeEventListener("wheel", onWheel);
      surface.removeEventListener("dblclick", onDoubleClick);
      area.removeEventListener("keydown", onKeyDown);
    },
  };
}
