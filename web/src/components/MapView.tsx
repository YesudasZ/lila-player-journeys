import { useEffect, useRef, useState } from "react";

import { BUTTON_ZOOM_STEP } from "../lib/mapKeys.ts";
import type { MapEntry } from "../lib/manifest.ts";
import type { ZoomLimits } from "../lib/view.ts";
import { MapReadout } from "./MapReadout.tsx";
import { mountMapSurface, type MapSurface } from "./mapSurface.ts";
import { ZoomControls } from "./ZoomControls.tsx";

const KEYS_ID = "map-keys";

/** One map: the surface that is panned and zoomed, the read-out and the zoom buttons over its corners. */
export function MapView({ map, image }: { map: MapEntry; image: HTMLImageElement }) {
  const areaRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const xRef = useRef<HTMLSpanElement>(null);
  const zRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const mounted = useRef<MapSurface | null>(null);
  const [limits, setLimits] = useState<ZoomLimits>({ atFit: true, atClosest: false });

  useEffect(() => {
    const [area, surface, canvas] = [areaRef.current, surfaceRef.current, canvasRef.current];
    const [x, z, bar, label] = [xRef.current, zRef.current, barRef.current, labelRef.current];
    if (!area || !surface || !canvas || !x || !z || !bar || !label) return;
    const mapSurface = mountMapSurface({ area, surface, canvas, map, image, readout: { x, z, bar, label }, onLimits: setLimits });
    mounted.current = mapSurface;
    return () => {
      mapSurface.destroy();
      mounted.current = null;
    };
  }, [map, image]);

  return (
    // The map's keys are heard here, so they also work while one of the buttons has the focus.
    <div ref={areaRef} className="relative h-full">
      <div
        ref={surfaceRef}
        tabIndex={0}
        role="application"
        aria-roledescription="map"
        aria-label={map.name}
        aria-describedby={KEYS_ID}
        className="group absolute inset-0 cursor-crosshair touch-none outline-none select-none data-dragging:cursor-grabbing"
      >
        <canvas ref={canvasRef} className="block size-full" />
        {/*
          The focus ring is drawn inside the map: magenta with a ring of the background inside it, so it shows on any
          artwork. The magenta is an outline, which forced-colours mode keeps; a shadow would be dropped there.
        */}
        <div className="pointer-events-none absolute inset-0 opacity-0 shadow-[inset_0_0_0_4px_var(--color-bg)] outline-2 -outline-offset-2 outline-accent group-focus-visible:opacity-100" />
      </div>
      <p id={KEYS_ID} className="sr-only">
        Drag to move. Scroll to zoom, double-click to zoom in. Keyboard: arrow keys move, plus and minus zoom, zero fits the map to the window.
      </p>
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
