/**
 * The map surface: one canvas with the minimap, and everything that moves it.
 *
 * This is plain DOM code on purpose. Panning and zooming happen many times a second, so they must
 * not go through a React render: the surface draws on the canvas, writes the read-out straight
 * into the page, and keeps the view in the store, where other parts of the app can read it.
 */
import { artworkInPixels, type MapEntry } from "../lib/manifest.ts";
import { pixelToUv, uvToWorld, type Point, type Size } from "../lib/projection.ts";
import { scaleBar, scaleBarLabel } from "../lib/scaleBar.ts";
import { clampView, closestZoom, fitView, imageRect, panBy, scaleOf, screenToImage, wheelZoomFactor, zoomAt, type Stage, type View } from "../lib/view.ts";
import { useAppStore } from "../state/store.ts";

const DRAG_STARTS_AFTER = 3; // CSS pixels; a smaller movement is still a click
const KEY_PAN_STEP = 64; // CSS pixels per press of an arrow key
export const BUTTON_ZOOM_STEP = 1.5;
const DOUBLE_CLICK_ZOOM = 2;
const SCALE_BAR_MAX = 120; // CSS pixels
const NO_VALUE = "—";

/** The elements of the read-out that the surface writes into. */
export interface ReadoutParts {
  x: HTMLElement;
  z: HTMLElement;
  bar: HTMLElement;
  label: HTMLElement;
}

export interface ZoomLimits {
  /** The map is fitted: it cannot be zoomed out further. */
  atFit: boolean;
  /** The map is at its closest zoom. */
  atClosest: boolean;
}

export interface MapSurface {
  /** Zoom by a factor about the centre of the viewport. */
  zoomBy: (factor: number) => void;
  /** Show the whole artwork again. */
  fit: () => void;
  /** Stop listening and drawing. */
  destroy: () => void;
}

interface Parts {
  /** The focusable element that receives pointer, wheel and key events and gives the viewport its size. */
  surface: HTMLElement;
  canvas: HTMLCanvasElement;
  map: MapEntry;
  image: HTMLImageElement;
  readout: ReadoutParts;
  onLimits: (limits: ZoomLimits) => void;
}

/** A whole number of world units with a real minus sign, as a level editor shows it. */
function wholeUnits(value: number): string {
  const rounded = Math.round(value);
  return rounded < 0 ? `−${Math.abs(rounded)}` : `${rounded}`;
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

export function mountMapSurface({ surface, canvas, map, image, readout, onLimits }: Parts): MapSurface {
  const found = canvas.getContext("2d");
  if (!found) throw new Error("this browser cannot draw on a canvas");
  const context = found;
  const artwork = artworkInPixels(map.minimap);
  const imageSize: Size = { width: map.minimap.width, height: map.minimap.height };
  const background = getComputedStyle(surface).getPropertyValue("--color-bg").trim();

  let viewport: Size = { width: surface.clientWidth, height: surface.clientHeight };
  let frame = 0;
  let pointer: Point | null = null; // where the pointer is over the surface, in CSS pixels
  let drag: { id: number; last: Point; moved: boolean } | null = null;
  let limits: ZoomLimits | null = null;

  const stage = (): Stage => ({ viewport, artwork });
  /** The view in the store, brought inside the limits of the stage as it is now. */
  const view = (): View => clampView(useAppStore.getState().views[map.id] ?? fitView(artwork), stage());
  const show = (next: View) => {
    useAppStore.getState().setView(map.id, next.zoom === 1 ? null : next); // a fitted map has no view of its own
  };

  function draw() {
    frame = 0;
    const current = view();
    const ratio = canvas.width / Math.max(viewport.width, 1);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.globalCompositeOperation = "source-over";
    context.fillStyle = background;
    context.fillRect(0, 0, viewport.width, viewport.height);
    // "lighten" keeps the brighter of image and background, so the image's pure black surround becomes the background
    context.globalCompositeOperation = "lighten";
    context.imageSmoothingQuality = "high";
    const rect = imageRect(current, stage(), imageSize);
    context.drawImage(image, rect.x, rect.y, rect.width, rect.height);
    writeReadout(current);
    reportLimits(current);
  }

  function schedule() {
    frame ||= requestAnimationFrame(draw);
  }

  function writeReadout(current: View) {
    const unitsPerPixel = map.scale / imageSize.width / scaleOf(current, stage());
    const bar = scaleBar(unitsPerPixel, SCALE_BAR_MAX);
    readout.bar.style.width = `${bar.pixels}px`;
    readout.label.textContent = scaleBarLabel(bar.units);

    const onImage = pointer && screenToImage(pointer, current, stage());
    if (onImage && onImage.x >= 0 && onImage.x <= imageSize.width && onImage.y >= 0 && onImage.y <= imageSize.height) {
      const { u, v } = pixelToUv(onImage, imageSize);
      const world = uvToWorld(u, v, map);
      readout.x.textContent = wholeUnits(world.x);
      readout.z.textContent = wholeUnits(world.z);
    } else {
      readout.x.textContent = NO_VALUE;
      readout.z.textContent = NO_VALUE;
    }
  }

  function reportLimits(current: View) {
    const next = { atFit: current.zoom <= 1, atClosest: current.zoom >= closestZoom(stage()) };
    if (limits?.atFit === next.atFit && limits.atClosest === next.atClosest) return;
    limits = next;
    onLimits(next);
  }

  /** The canvas gets one pixel per device pixel, so the map is sharp on any screen. */
  function resize(css: Size, device: Size) {
    viewport = css;
    canvas.width = device.width;
    canvas.height = device.height;
    draw(); // now, not on the next frame: resizing a canvas clears it
  }

  const observer = new ResizeObserver((entries) => {
    const entry = entries.at(-1);
    if (!entry) return;
    const css = entry.contentBoxSize[0];
    const device = (entry.devicePixelContentBoxSize as readonly ResizeObserverSize[] | undefined)?.[0];
    const ratio = window.devicePixelRatio;
    resize(
      { width: css.inlineSize, height: css.blockSize },
      device ? { width: device.inlineSize, height: device.blockSize } : { width: Math.round(css.inlineSize * ratio), height: Math.round(css.blockSize * ratio) },
    );
  });
  let stopWatchingRatio = () => {};
  try {
    // reports the size in device pixels, and reports again when the window moves to a screen with another pixel ratio
    observer.observe(surface, { box: "device-pixel-content-box" });
  } catch {
    observer.observe(surface);
    stopWatchingRatio = onPixelRatioChange(() => {
      const ratio = window.devicePixelRatio;
      resize(viewport, { width: Math.round(viewport.width * ratio), height: Math.round(viewport.height * ratio) });
    });
  }

  const position = (event: MouseEvent): Point => {
    const box = surface.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };
  const centre = (): Point => ({ x: viewport.width / 2, y: viewport.height / 2 });

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    drag = { id: event.pointerId, last: position(event), moved: false };
    surface.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent) {
    pointer = position(event);
    if (drag?.id === event.pointerId) {
      const dx = pointer.x - drag.last.x;
      const dy = pointer.y - drag.last.y;
      if (!drag.moved && Math.hypot(dx, dy) < DRAG_STARTS_AFTER) return;
      if (!drag.moved) surface.dataset.dragging = "";
      drag = { ...drag, last: pointer, moved: true };
      show(panBy(view(), dx, dy, stage()));
    }
    schedule();
  }

  function onPointerEnd(event: PointerEvent) {
    if (drag?.id !== event.pointerId) return;
    drag = null;
    delete surface.dataset.dragging;
  }

  function onPointerLeave() {
    pointer = null;
    schedule();
  }

  function onWheel(event: WheelEvent) {
    event.preventDefault(); // neither scroll the page nor zoom the browser
    show(zoomAt(view(), wheelZoomFactor(event.deltaY, event.deltaMode, event.ctrlKey), position(event), stage()));
  }

  function onDoubleClick(event: MouseEvent) {
    show(zoomAt(view(), DOUBLE_CLICK_ZOOM, position(event), stage()));
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.ctrlKey || event.metaKey || event.altKey) return; // the browser's own zoom and shortcuts stay
    const pans: Record<string, [number, number]> = {
      ArrowLeft: [KEY_PAN_STEP, 0],
      ArrowRight: [-KEY_PAN_STEP, 0],
      ArrowUp: [0, KEY_PAN_STEP],
      ArrowDown: [0, -KEY_PAN_STEP],
    };
    const pan = pans[event.key] as [number, number] | undefined;
    if (pan) show(panBy(view(), pan[0], pan[1], stage()));
    else if (event.key === "+" || event.key === "=") zoomBy(BUTTON_ZOOM_STEP);
    else if (event.key === "-" || event.key === "_") zoomBy(1 / BUTTON_ZOOM_STEP);
    else if (event.key === "0") fit();
    else return;
    event.preventDefault();
  }

  function zoomBy(factor: number) {
    show(zoomAt(view(), factor, centre(), stage()));
  }

  function fit() {
    show(fitView(artwork));
  }

  surface.addEventListener("pointerdown", onPointerDown);
  surface.addEventListener("pointermove", onPointerMove);
  surface.addEventListener("pointerup", onPointerEnd);
  surface.addEventListener("pointercancel", onPointerEnd);
  surface.addEventListener("pointerleave", onPointerLeave);
  surface.addEventListener("wheel", onWheel, { passive: false }); // React's onWheel is passive and cannot stop the scroll
  surface.addEventListener("dblclick", onDoubleClick);
  surface.addEventListener("keydown", onKeyDown);
  const stopListening = useAppStore.subscribe((state, before) => {
    if (state.views !== before.views) schedule();
  });

  return {
    zoomBy,
    fit,
    destroy() {
      observer.disconnect();
      stopWatchingRatio();
      stopListening();
      cancelAnimationFrame(frame);
      surface.removeEventListener("pointerdown", onPointerDown);
      surface.removeEventListener("pointermove", onPointerMove);
      surface.removeEventListener("pointerup", onPointerEnd);
      surface.removeEventListener("pointercancel", onPointerEnd);
      surface.removeEventListener("pointerleave", onPointerLeave);
      surface.removeEventListener("wheel", onWheel);
      surface.removeEventListener("dblclick", onDoubleClick);
      surface.removeEventListener("keydown", onKeyDown);
    },
  };
}
