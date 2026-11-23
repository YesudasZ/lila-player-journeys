import type { Manifest, MapEntry } from "../lib/manifest.ts";
import { selectMatchId } from "../state/shown.ts";
import { useAppStore } from "../state/store.ts";
import { JourneyList } from "./JourneyList.tsx";
import { Legend } from "./Legend.tsx";
import { MatchList } from "./MatchList.tsx";

/** The column beside the map: which matches are shown, the journeys of an open match, and the legend with its switches. */
export function Sidebar({ manifest, map }: { manifest: Manifest; map: MapEntry }) {
  const matchId = useAppStore(selectMatchId);
  return (
    <aside aria-label="Matches and legend" className="flex min-h-0 flex-col border-r border-border bg-surface text-[13px]">
      <MatchList key={map.id} manifest={manifest} map={map} />
      {matchId !== null && <JourneyList matchId={matchId} />}
      <Legend map={map} />
    </aside>
  );
}
