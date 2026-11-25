import type { Manifest } from "../lib/manifest.ts";
import { AboutPanel } from "./AboutPanel.tsx";
import { CopyLink } from "./CopyLink.tsx";
import { MapTabs } from "./MapTabs.tsx";

/**
 * The bar across the top: the name of the tool over the left column; over the map and the journeys
 * panel the map tabs, each with the matches the day filter leaves on it, and at the right end "Copy
 * link" and the panel about the data and the keys. Until the manifest is there it holds the name alone.
 */
export function TopBar({ manifest, counts }: { manifest: Manifest | null; counts: ReadonlyMap<string, number> }) {
  return (
    <header className="col-span-full row-start-1 grid grid-cols-subgrid border-b border-border bg-surface">
      <h1 className="col-start-1 flex items-baseline gap-2 self-center pl-4 whitespace-nowrap">
        <span className="font-heading text-[15px] font-semibold tracking-[0.08em]">LILA BLACK</span>
        <span className="text-[13px] font-normal text-text-muted">Player Journeys</span>
      </h1>
      <div className="col-[2/-1] flex min-w-0 items-center justify-between">
        <MapTabs maps={manifest?.maps ?? []} counts={counts} />
        {manifest && (
          <div className="flex shrink-0 items-center gap-2 pr-4">
            <CopyLink />
            <AboutPanel manifest={manifest} />
          </div>
        )}
      </div>
    </header>
  );
}
