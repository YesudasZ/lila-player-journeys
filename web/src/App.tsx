import { useEffect, useMemo } from "react";

import { focusMapIfFocusWasLost } from "./components/focusMap.ts";
import { MapPanel } from "./components/MapPanel.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { Centred, LoadError, LoadingLine } from "./components/StatusMessage.tsx";
import { JourneyPanel } from "./components/JourneyPanel.tsx";
import { Timeline } from "./components/Timeline.tsx";
import { TopBar } from "./components/TopBar.tsx";
import { matchCounts } from "./lib/filters.ts";
import { decodeLink } from "./lib/link.ts";
import { startLinkSync } from "./state/linkSync.ts";
import { startPlayback } from "./state/playback.ts";
import { selectJourneysPanelShown, selectMatchId } from "./state/shown.ts";
import { useAppStore } from "./state/store.ts";

/**
 * The page's columns: the left column, the map, and the journeys panel of an open match. The third
 * column is always declared, at zero width while the panel is closed, so the top bar's subgrid keeps
 * its tracks. From 1200 px the panel docks and the map narrows; below that it floats over the map's
 * right edge, since docking would leave the map too little room. The column width never animates:
 * every frame of a transition would redraw the map's canvases. Written out in full for Tailwind.
 */
const COLUMNS = "grid-cols-[clamp(260px,22vw,300px)_minmax(0,1fr)_0px]";
const COLUMNS_WITH_PANEL = "grid-cols-[clamp(260px,22vw,300px)_minmax(0,1fr)_0px] min-[1200px]:grid-cols-[clamp(260px,22vw,300px)_minmax(0,1fr)_clamp(260px,22vw,300px)]";

/**
 * The page grid. The top bar spans all columns. Below it: the left column, the map, and the
 * journeys panel while a match is open; the timeline has the map's last row, so the map never has
 * to move for it. Every child is placed explicitly, and the DOM puts the journeys panel right
 * after the left column, so that Tab reaches the journeys straight after the match list.
 * A window narrower than 900 px gets a line above the grid that says what the tool is built for.
 */
export function App() {
  const manifest = useAppStore((state) => state.manifest);
  const mapId = useAppStore((state) => state.mapId);
  const loadManifest = useAppStore((state) => state.loadManifest);

  const days = useAppStore((state) => state.days);

  // The page opens the view its address asks for, and from then on the address follows the view.
  useEffect(() => {
    // The clock first: before the manifest arrives, so that it gets the time the link names, and before
    // the address code, which reads the clock whenever the view changes.
    const stopClock = startPlayback();
    const stopLink = startLinkSync();
    void loadManifest(decodeLink(location.search));
    return () => {
      stopLink();
      stopClock();
    };
  }, [loadManifest]);

  const counts = useMemo(() => (manifest.status === "ready" ? matchCounts(manifest.value, days) : new Map<string, number>()), [manifest, days]);

  const maps = manifest.status === "ready" ? manifest.value.maps : [];
  const map = maps.find((entry) => entry.id === mapId);
  const matchId = useAppStore(selectMatchId);
  const panelShown = useAppStore(selectJourneysPanelShown);

  return (
    <div className="flex h-full flex-col">
      <p className="border-b border-border bg-surface-2 px-4 py-1.5 text-center text-xs text-text-muted min-[900px]:hidden">
        This tool is built for a desktop browser. In a window this narrow the map has little room, and it is not zoomed by pinching.
      </p>
      <div className={`grid min-h-0 flex-1 grid-rows-[48px_minmax(0,1fr)_auto] overflow-hidden ${panelShown ? COLUMNS_WITH_PANEL : COLUMNS}`}>
        <TopBar manifest={manifest.status === "ready" ? manifest.value : null} counts={counts} />
        {manifest.status === "ready" && map ? (
          <>
            <Sidebar manifest={manifest.value} map={map} />
            {panelShown && matchId !== null && <JourneyPanel manifest={manifest.value} map={map} matchId={matchId} />}
            <main className="col-start-2 row-start-2 min-h-0 min-w-0">
              <MapPanel map={map} manifest={manifest.value} />
            </main>
            <div className="col-start-2 row-start-3 min-w-0">
              <Timeline manifest={manifest.value} />
            </div>
          </>
        ) : (
          <main className="col-span-full row-span-2 row-start-2 min-h-0">
            <Centred>
              {manifest.status === "error" ? (
                <LoadError
                  title="The maps did not load"
                  failure={manifest.failure}
                  retrying={manifest.retrying}
                  onRetry={() => void loadManifest().then(focusMapIfFocusWasLost)}
                />
              ) : (
                <LoadingLine>Loading maps…</LoadingLine>
              )}
            </Centred>
          </main>
        )}
      </div>
    </div>
  );
}
