import { clock, fateLabel, markerTitle, whoLabel } from "../lib/labels.ts";
import type { Manifest, MapEntry } from "../lib/manifest.ts";
import { codeToElevation, codeToUnit, uvToWorld } from "../lib/projection.ts";
import { wholeUnits } from "../lib/readout.ts";
import type { Hover } from "./layers/journeysLayer.ts";

const GAP = 14; // CSS pixels between the thing and its tooltip
const ROOM_BELOW = 100; // CSS pixels a tooltip needs below the thing; nearer to the bottom edge it goes above

/**
 * What is under the pointer: a marker's event, or a path, then who, the time into the match, and
 * the place in world units. It opens toward the middle of the map, so it is never cut off at an
 * edge. It is hidden from assistive technology: it can only be reached with a pointer, and what it
 * says about a single event has no other way in yet (see PLAN.md, Phase 8).
 */
export function MapTooltip({ hover, map, manifest }: { hover: Hover | null; map: MapEntry; manifest: Manifest }) {
  if (!hover) return null;
  const { at, viewport, journey, row, marker } = hover;
  const { uv_steps: steps, elevation_steps_per_unit: perUnit } = manifest.encoding;
  const world = uvToWorld(codeToUnit(journey.u[row], steps), codeToUnit(journey.v[row], steps), map);
  const across = at.x > viewport.width / 2 ? `calc(-100% - ${GAP}px)` : `${GAP}px`;
  const down = at.y > viewport.height - ROOM_BELOW ? `calc(-100% - ${GAP}px)` : `${GAP}px`;
  const until = marker && journey.t[marker.last] > journey.t[row] ? ` to ${clock(journey.t[marker.last])}` : "";

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute z-10 w-max rounded-md border border-border bg-surface px-2.5 py-2 text-xs leading-4"
      style={{ left: at.x, top: at.y, transform: `translate(${across}, ${down})` }}
    >
      <div className="font-medium">{marker ? markerTitle(marker.kind, marker.count, journey.fate) : whoLabel(journey)}</div>
      <div className="text-text-muted">{marker ? whoLabel(journey) : fateLabel(journey.fate)}</div>
      <div className="mt-1 font-mono text-text-muted">
        at {clock(journey.t[row])}
        {until} · x {wholeUnits(world.x)} z {wholeUnits(world.z)} · elevation {wholeUnits(codeToElevation(journey.y[row], perUnit))}
      </div>
    </div>
  );
}
