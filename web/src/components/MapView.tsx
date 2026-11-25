import { useEffect, useRef, useState, type ReactNode } from "react";

import { BUTTON_ZOOM_STEP, MAP_HELP } from "../lib/mapKeys.ts";
import { artworkInPixels, type Manifest, type MapEntry } from "../lib/manifest.ts";
import { landProfile, roomForCorner, type LandProfile } from "../lib/room.ts";
import { NO_INSETS } from "../lib/view.ts";
import type { ZoomLimits } from "../lib/view.ts";
import { togglePlay } from "../state/playback.ts";
import { selectJourneysPanelShown } from "../state/shown.ts";
import { useAppStore } from "../state/store.ts";
import { createHeatLayer } from "./layers/heatLayer.ts";
import { createJourneysLayer, type Hover } from "./layers/journeysLayer.ts";
import { createMinimapLayer } from "./layers/minimapLayer.ts";
import { MapReadout } from "./MapReadout.tsx";
import { LEGEND_CORNER } from "./overlays.ts";
import { mountMapSurface, type MapSurface } from "./mapSurface.ts";
import { MapTooltip } from "./MapTooltip.tsx";
import { JOURNEYS_HEADING_ID, MAP_SURFACE_ID } from "./tabIds.ts";
import { ZoomControls } from "./ZoomControls.tsx";
import { EmptyNote } from "./EmptyNote.tsx";
import { FilterNotice } from "./FilterNotice.tsx";

const KEYS_ID = "map-keys";
/** The side of the small copy of the minimap that its land is read from: a coast is then placed within a few screen pixels. */
const LAND_SAMPLE = 256;

/**
 * How far the journeys panel reaches over the map from its right edge: its whole width while it
 * floats over the map (below 1200 px), nothing while it has a column of its own or is closed.
 */
function panelOver(surface: HTMLElement): number {
  const panel = document.querySelector(`[aria-labelledby="${JOURNEYS_HEADING_ID}"]`);
  if (!panel) return 0;
  const map = surface.getBoundingClientRect();
  const over = panel.getBoundingClientRect();
  return over.left > map.left && over.left < map.right ? map.right - over.left : 0;
}

/** The land of a minimap, row by row; null where the browser will not read the pixels back. */
function landOf(image: HTMLImageElement): LandProfile | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = LAND_SAMPLE;
    canvas.height = LAND_SAMPLE;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, LAND_SAMPLE, LAND_SAMPLE);
    return landProfile(context.getImageData(0, 0, LAND_SAMPLE, LAND_SAMPLE).data, LAND_SAMPLE, LAND_SAMPLE);
  } catch {
    return null; // a canvas that cannot be read back: the map is fitted without room for the legend
  }
}

interface Props {
  map: MapEntry;
  image: HTMLImageElement;
  manifest: Manifest;
  /** The controls the map panel puts over the map, in Tab order after the notes: the button that brings the journeys back, the legend card. */
  children?: ReactNode;
}

/**
 * One map: the surface that is panned and zoomed, with its layers and the tooltip; over it the notes
 * of the filters at the top, the controls handed in by the map panel, and the read-out and the zoom
 * buttons at the bottom right. The read-out shows while the pointer is over the map or the map has the
 * keyboard focus: the map surface marks the pointer on this element, so no React update is needed.
 */
export function MapView({ map, image, manifest, children }: Props) {
  const areaRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const heatRef = useRef<HTMLCanvasElement>(null);
  const journeysRef = useRef<HTMLCanvasElement>(null);
  const ringRef = useRef<HTMLCanvasElement>(null);
  const xRef = useRef<HTMLSpanElement>(null);
  const zRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const mounted = useRef<MapSurface | null>(null);
  const [limits, setLimits] = useState<ZoomLimits>({ atFit: true, atClosest: false });
  const [hover, setHover] = useState<Hover | null>(null);
  const panelShown = useAppStore(selectJourneysPanelShown);

  // A journeys panel that floats over the map takes room from it, and gives it back when it closes.
  useEffect(() => {
    mounted.current?.refit();
  }, [panelShown]);

  useEffect(() => {
    const [area, surface, minimap, heat, journeys, ring] = [areaRef.current, surfaceRef.current, minimapRef.current, heatRef.current, journeysRef.current, ringRef.current];
    const [x, z, bar, label] = [xRef.current, zRef.current, barRef.current, labelRef.current];
    if (!area || !surface || !minimap || !heat || !journeys || !ring || !x || !z || !bar || !label) return;
    const drawn = createJourneysLayer({ canvas: journeys, ringCanvas: ring, onHover: setHover });
    // The fitted map keeps its land out from under the legend card and from under a journeys panel that floats over it (lib/room.ts).
    const land = landOf(image);
    const artwork = artworkInPixels(map.minimap);
    const imageSize = { width: map.minimap.width, height: map.minimap.height };
    const heated = createHeatLayer(heat);
    const mapSurface = mountMapSurface({
      area,
      surface,
      map,
      layers: [createMinimapLayer(minimap, image), heated.layer, drawn.layer, drawn.ring],
      readout: { x, z, bar, label },
      onLimits: setLimits,
      onPointer: drawn.point,
      onClick: drawn.click,
      onDoubleClick: drawn.unclick,
      onEscape: () => {
        useAppStore.getState().setFocus(null);
      },
      onPlay: togglePlay,
      roomFor: (viewport) => {
        const base = { ...NO_INSETS, right: panelOver(surface) };
        return land ? roomForCorner(land, imageSize, artwork, viewport, LEGEND_CORNER, base) : base;
      },
    });
    const stopWatching = drawn.watch(mapSurface.invalidate, mapSurface.drawNow);
    const stopHeat = heated.watch(mapSurface.invalidate);
    mounted.current = mapSurface;
    return () => {
      stopWatching();
      stopHeat();
      mapSurface.destroy();
      mounted.current = null;
    };
  }, [map, image]);

  return (
    // The map's keys are heard here, so they also work while one of the buttons or the legend has the focus.
    <div ref={areaRef} data-panel={panelShown ? "" : undefined} className="group/map relative h-full">
      <div
        ref={surfaceRef}
        id={MAP_SURFACE_ID}
        tabIndex={0}
        role="application"
        aria-roledescription="map"
        aria-label={map.name}
        aria-describedby={KEYS_ID}
        data-hovering={hover ? "" : undefined}
        className="group absolute inset-0 cursor-crosshair touch-none outline-none select-none data-hovering:cursor-pointer data-dragging:cursor-grabbing"
      >
        {/* The layers, from the bottom: the minimap, the heat, the journeys, the ring around what is under the pointer. They share one view. */}
        <canvas ref={minimapRef} className="absolute inset-0 size-full" />
        <canvas ref={heatRef} className="absolute inset-0 size-full" />
        <canvas ref={journeysRef} className="absolute inset-0 size-full" />
        <canvas ref={ringRef} className="absolute inset-0 size-full" />
        {/*
          The focus ring is drawn inside the map: magenta with a ring of the background inside it, so it shows on any
          artwork. The magenta is an outline, which forced-colours mode keeps; a shadow would be dropped there.
        */}
        <div className="pointer-events-none absolute inset-0 opacity-0 shadow-[inset_0_0_0_4px_var(--color-bg)] outline-2 -outline-offset-2 outline-accent group-focus-visible:opacity-100" />
      </div>
      <p id={KEYS_ID} className="sr-only">
        {MAP_HELP}
      </p>
      {/*
        What the filters did to the view, at the top of the map, clear of the button in the top right corner. Below
        1200 px the journeys panel floats over the map's right edge, and the notes move into the part left visible.
        The box itself lets the pointer through to the map.
      */}
      <div className="pointer-events-none absolute inset-x-32 top-4 z-10 flex flex-col items-center gap-2 max-[1200px]:group-data-panel/map:right-[calc(clamp(260px,26vw,300px)+1rem)] max-[1200px]:group-data-panel/map:left-4">
        <FilterNotice />
        <EmptyNote map={map} manifest={manifest} />
      </div>
      {children}
      <MapReadout x={xRef} z={zRef} bar={barRef} label={labelRef} />
      <ZoomControls
        limits={limits}
        onZoomIn={() => mounted.current?.zoomBy(BUTTON_ZOOM_STEP)}
        onZoomOut={() => mounted.current?.zoomBy(1 / BUTTON_ZOOM_STEP)}
        onFit={() => mounted.current?.fit()}
      />
      <MapTooltip hover={hover} map={map} manifest={manifest} />
    </div>
  );
}
