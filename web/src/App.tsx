import { useEffect } from "react";

import { MapPanel } from "./components/MapPanel.tsx";
import { Centred, LoadError, LoadingLine } from "./components/StatusMessage.tsx";
import { TopBar } from "./components/TopBar.tsx";
import { useAppStore } from "./state/store.ts";

/**
 * The page grid. The top bar spans both columns. In this phase the map does too; the sidebar
 * will take the first column and the timeline a third row, so the map never has to move.
 */
export function App() {
  const manifest = useAppStore((state) => state.manifest);
  const mapId = useAppStore((state) => state.mapId);
  const loadManifest = useAppStore((state) => state.loadManifest);

  useEffect(() => {
    void loadManifest();
  }, [loadManifest]);

  const maps = manifest.status === "ready" ? manifest.value.maps : [];
  const map = maps.find((entry) => entry.id === mapId);

  return (
    <div className="grid h-full grid-cols-[320px_minmax(0,1fr)] grid-rows-[48px_minmax(0,1fr)] overflow-hidden">
      <TopBar maps={maps} />
      <main className="col-span-2 min-h-0">
        {map ? (
          <MapPanel map={map} />
        ) : (
          <Centred>
            {manifest.status === "error" ? (
              <LoadError title="The maps did not load" failure={manifest.failure} retrying={manifest.retrying} onRetry={() => void loadManifest()} />
            ) : (
              <LoadingLine>Loading maps…</LoadingLine>
            )}
          </Centred>
        )}
      </main>
    </div>
  );
}
