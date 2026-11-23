import { useEffect, useMemo } from "react";

import { focusMapIfFocusWasLost } from "./components/focusMap.ts";
import { MapPanel } from "./components/MapPanel.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { Centred, LoadError, LoadingLine } from "./components/StatusMessage.tsx";
import { TopBar } from "./components/TopBar.tsx";
import { matchCounts } from "./lib/filters.ts";
import { decodeLink } from "./lib/link.ts";
import { startLinkSync } from "./state/linkSync.ts";
import { useAppStore } from "./state/store.ts";

/**
 * The page grid. The top bar spans both columns; below it the sidebar has the first column and the
 * map the second. The timeline will take a third row, so the map never has to move.
 */
export function App() {
  const manifest = useAppStore((state) => state.manifest);
  const mapId = useAppStore((state) => state.mapId);
  const loadManifest = useAppStore((state) => state.loadManifest);

  const days = useAppStore((state) => state.days);

  // The page opens the view its address asks for, and from then on the address follows the view.
  useEffect(() => {
    void loadManifest(decodeLink(location.search));
    return startLinkSync();
  }, [loadManifest]);

  const counts = useMemo(() => (manifest.status === "ready" ? matchCounts(manifest.value, days) : new Map<string, number>()), [manifest, days]);

  const maps = manifest.status === "ready" ? manifest.value.maps : [];
  const map = maps.find((entry) => entry.id === mapId);

  return (
    <div className="grid h-full grid-cols-[320px_minmax(0,1fr)] grid-rows-[48px_minmax(0,1fr)] overflow-hidden">
      <TopBar maps={maps} counts={counts} />
      {manifest.status === "ready" && map ? (
        <>
          <Sidebar manifest={manifest.value} map={map} />
          <main className="min-h-0">
            <MapPanel map={map} manifest={manifest.value} />
          </main>
        </>
      ) : (
        <main className="col-span-2 min-h-0">
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
  );
}
