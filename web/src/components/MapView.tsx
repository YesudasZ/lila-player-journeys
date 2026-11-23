import { useEffect, useRef, useState } from "react";

import type { MapEntry } from "../lib/manifest.ts";
import { MapReadout } from "./MapReadout.tsx";
import { BUTTON_ZOOM_STEP, mountMapSurface, type MapSurface, type ZoomLimits } from "./mapSurface.ts";
import { ZoomControls } from "./ZoomControls.tsx";

const KEYS_ID = "map-keys";

/** One map: the surface that is panned and zoomed, the read-out and the zoom buttons over its corners. */
export function MapView({ map, image }: { map: MapEntry; image: HTMLImageElement }) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const xRef = useRef<HTMLSpanElement>(null);
  const zRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const mounted = useRef<MapSurface | null>(null);
  const [limits, setLimits] = useState<ZoomLimits>({ atFit: true, atClosest: false });

  useEffect(() => {
    const [surface, canvas, x, z, bar, label] = [surfaceRef.current, canvasRef.current, xRef.current, zRef.current, barRef.current, labelRef.current];
    if (!surface || !canvas || !x || !z || !bar || !label) return;
    const mapSurface = mountMapSurface({ surface, canvas, map, image, readout: { x, z, bar, label }, onLimits: setLimits });
    mounted.current = mapSurface;
    return () => {
      mapSurface.destroy();
      mounted.current = null;
    };
  }, [map, image]);

  return (
    <div className="relative h-full">
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
        {/* The focus ring is drawn inside the map: magenta with a ring of the background inside it, so it shows on any artwork. */}
        <div className="pointer-events-none absolute inset-0 opacity-0 shadow-[inset_0_0_0_2px_var(--color-accent),inset_0_0_0_4px_var(--color-bg)] group-focus-visible:opacity-100" />
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
