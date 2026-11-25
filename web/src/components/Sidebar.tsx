import type { Manifest, MapEntry } from "../lib/manifest.ts";
import { Filters } from "./Filters.tsx";
import { HeatControl } from "./HeatControl.tsx";
import { MatchList } from "./MatchList.tsx";

/**
 * The column left of the map: what you choose to look at. The match list takes the height that is
 * left. The legend sits on the map, and the journeys of an open match have a panel on the right.
 */
export function Sidebar({ manifest, map }: { manifest: Manifest; map: MapEntry }) {
  return (
    <aside aria-label="Heat, filters and matches" className="col-start-1 row-span-2 row-start-2 flex min-h-0 flex-col overflow-y-auto border-r border-border bg-surface text-[13px]">
      <HeatControl map={map} />
      <Filters manifest={manifest} />
      <MatchList key={map.id} manifest={manifest} map={map} />
    </aside>
  );
}
