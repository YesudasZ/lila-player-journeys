import type { RefObject } from "react";

interface ReadoutRefs {
  x: RefObject<HTMLSpanElement | null>;
  z: RefObject<HTMLSpanElement | null>;
  bar: RefObject<HTMLSpanElement | null>;
  label: RefObject<HTMLSpanElement | null>;
}

/**
 * World coordinates under the pointer, and the scale bar, left of the zoom buttons. The map surface
 * writes the values straight into these elements, many times a second, so they are not React state.
 * The panel has a fixed size: nothing shifts while the numbers change. It shows while the pointer is
 * over the map (the map surface marks the map area with `data-pointer`) or while the map has the
 * keyboard focus, which still wants the scale. A pointer passes through it to the map.
 */
export function MapReadout({ x, z, bar, label }: ReadoutRefs) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute right-15 bottom-4 w-54 rounded-md border border-border bg-surface/90 px-2.5 py-2 font-mono text-xs leading-4 opacity-0 transition-opacity group-has-[#map-surface:focus-visible]/map:opacity-100 group-data-pointer/map:opacity-100 motion-reduce:transition-none"
    >
      <div className="flex gap-4">
        <span>
          <span className="text-text-muted">x</span>{" "}
          <span ref={x} className="inline-block w-[4ch] text-right">
            —
          </span>
        </span>
        <span>
          <span className="text-text-muted">z</span>{" "}
          <span ref={z} className="inline-block w-[4ch] text-right">
            —
          </span>
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span ref={bar} className="block h-1.5 border-x-2 border-b-2 border-text" />
        <span ref={label} className="text-text-muted" />
      </div>
    </div>
  );
}
