import type { Manifest, MapEntry } from "../lib/manifest.ts";
import { selectMatchId } from "../state/shown.ts";
import { useAppStore } from "../state/store.ts";
import { Filters } from "./Filters.tsx";
import { JourneyList } from "./JourneyList.tsx";
import { Legend } from "./Legend.tsx";
import { MatchList } from "./MatchList.tsx";

/** The column beside the map: the filters, which matches are shown, the journeys of an open match, and the legend with its switches. */
export function Sidebar({ manifest, map }: { manifest: Manifest; map: MapEntry }) {
  const matchId = useAppStore(selectMatchId);
  return (
    <aside aria-label="Filters, matches and legend" className="flex min-h-0 flex-col border-r border-border bg-surface text-[13px]">
      <Filters manifest={manifest} />
      <MatchList key={map.id} manifest={manifest} map={map} />
      {matchId !== null && <JourneyList matchId={matchId} />}
      <Legend map={map} />
    </aside>
  );
}
