import type { MapEntry } from "../lib/manifest.ts";
import { CopyLink } from "./CopyLink.tsx";
import { MapTabs } from "./MapTabs.tsx";

/** The bar across the top: the name of the tool in the first column; from the second the map tabs, each with the matches the day filter leaves on it, and "Copy link" at the right end. */
export function TopBar({ maps, counts }: { maps: MapEntry[]; counts: ReadonlyMap<string, number> }) {
  return (
    <header className="col-span-2 grid grid-cols-subgrid border-b border-border bg-surface">
      <h1 className="flex items-baseline gap-2 self-center pl-4 whitespace-nowrap">
        <span className="font-heading text-[15px] font-semibold tracking-[0.08em]">LILA BLACK</span>
        <span className="text-[13px] font-normal text-text-muted">Player Journeys</span>
      </h1>
      <div className="flex min-w-0 items-center justify-between">
        <MapTabs maps={maps} counts={counts} />
        {maps.length > 0 && <CopyLink />}
      </div>
    </header>
  );
}
