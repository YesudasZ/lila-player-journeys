import { useEffect, useRef, useState } from "react";

import { BUTTON_ZOOM_STEP } from "../lib/mapKeys.ts";
import type { Manifest, MapEntry } from "../lib/manifest.ts";
import type { ZoomLimits } from "../lib/view.ts";
import { togglePlay } from "../state/playback.ts";
import { useAppStore } from "../state/store.ts";
import { createJourneysLayer, type Hover } from "./layers/journeysLayer.ts";
import { createMinimapLayer } from "./layers/minimapLayer.ts";
import { MapReadout } from "./MapReadout.tsx";
import { mountMapSurface, type MapSurface } from "./mapSurface.ts";
import { MapTooltip } from "./MapTooltip.tsx";
import { MAP_SURFACE_ID } from "./tabIds.ts";
import { ZoomControls } from "./ZoomControls.tsx";
import { EmptyNote } from "./EmptyNote.tsx";

const KEYS_ID = "map-keys";

/** One map: the surface that is panned and zoomed, with its layers, the tooltip, the read-out and the zoom buttons. */
export function MapView({ map, image, manifest }: { map: MapEntry; image: HTMLImageElement; manifest: Manifest }) {
  const areaRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const journeysRef = useRef<HTMLCanvasElement>(null);
  const ringRef = useRef<HTMLCanvasElement>(null);
  const xRef = useRef<HTMLSpanElement>(null);
  const zRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const mounted = useRef<MapSurface | null>(null);
  const [limits, setLimits] = useState<ZoomLimits>({ atFit: true, atClosest: false });
  const [hover, setHover] = useState<Hover | null>(null);

  useEffect(() => {
    const [area, surface, minimap, journeys, ring] = [areaRef.current, surfaceRef.current, minimapRef.current, journeysRef.current, ringRef.current];
    const [x, z, bar, label] = [xRef.current, zRef.current, barRef.current, labelRef.current];
    if (!area || !surface || !minimap || !journeys || !ring || !x || !z || !bar || !label) return;
    const drawn = createJourneysLayer({ canvas: journeys, ringCanvas: ring, onHover: setHover });
    const mapSurface = mountMapSurface({
      area,
      surface,
      map,
      layers: [createMinimapLayer(minimap, image), drawn.layer, drawn.ring],
      readout: { x, z, bar, label },
      onLimits: setLimits,
      onPointer: drawn.point,
      onClick: drawn.click,
      onDoubleClick: drawn.unclick,
      onEscape: () => {
        useAppStore.getState().setFocus(null);
      },
      onPlay: togglePlay,
    });
    const stopWatching = drawn.watch(mapSurface.invalidate);
    mounted.current = mapSurface;
    return () => {
      stopWatching();
      mapSurface.destroy();
      mounted.current = null;
    };
  }, [map, image]);

  return (
    // The map's keys are heard here, so they also work while one of the buttons has the focus.
    <div ref={areaRef} className="relative h-full">
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
        {/* The layers, from the bottom: the minimap, the journeys, the ring around what is under the pointer. They share one view. */}
        <canvas ref={minimapRef} className="absolute inset-0 size-full" />
        <canvas ref={journeysRef} className="absolute inset-0 size-full" />
        <canvas ref={ringRef} className="absolute inset-0 size-full" />
        {/*
          The focus ring is drawn inside the map: magenta with a ring of the background inside it, so it shows on any
          artwork. The magenta is an outline, which forced-colours mode keeps; a shadow would be dropped there.
        */}
        <div className="pointer-events-none absolute inset-0 opacity-0 shadow-[inset_0_0_0_4px_var(--color-bg)] outline-2 -outline-offset-2 outline-accent group-focus-visible:opacity-100" />
      </div>
      <p id={KEYS_ID} className="sr-only">
        Drag to move. Scroll to zoom, double-click to zoom in. Click a path or a marker to focus its journey. Keyboard: arrow keys move, plus and minus
        zoom, zero fits the map to the window, Escape clears the focus, Space plays and pauses the open match.
      </p>
      <MapTooltip hover={hover} map={map} manifest={manifest} />
      <EmptyNote map={map} manifest={manifest} />
      <MapReadout x={xRef} z={zRef} bar={barRef} label={labelRef} />
      <ZoomControls
        limits={limits}
        onZoomIn={() => mounted.current?.zoomBy(BUTTON_ZOOM_STEP)}
        onZoomOut={() => mounted.current?.zoomBy(1 / BUTTON_ZOOM_STEP)}
        onFit={() => mounted.current?.fit()}
      />
    </div>
  );
}
