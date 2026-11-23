import type { MapEntry } from "../lib/manifest.ts";
import { MapTabs } from "./MapTabs.tsx";

/** The bar across the top: the name of the tool in the first column, the map tabs from the second. */
export function TopBar({ maps }: { maps: MapEntry[] }) {
  return (
    <header className="col-span-2 grid grid-cols-subgrid border-b border-border bg-surface">
      <h1 className="flex items-baseline gap-2 self-center pl-4 whitespace-nowrap">
        <span className="font-heading text-[15px] font-semibold tracking-[0.08em]">LILA BLACK</span>
        <span className="text-[13px] font-normal text-text-muted">Player Journeys</span>
      </h1>
      <MapTabs maps={maps} />
    </header>
  );
}
