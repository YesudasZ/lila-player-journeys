import { useEffect } from "react";

import type { Manifest, MapEntry } from "../lib/manifest.ts";
import { useAppStore } from "../state/store.ts";
import { focusMapIfFocusWasLost } from "./focusMap.ts";
import { MAP_PANEL_ID, tabId } from "./tabIds.ts";
import { MapView } from "./MapView.tsx";
import { Centred, LoadError, LoadingLine } from "./StatusMessage.tsx";

/** The panel of the open tab: the map once its minimap is there, a status line until then. */
export function MapPanel({ map, manifest }: { map: MapEntry; manifest: Manifest }) {
  const minimap = useAppStore((state) => state.minimaps[map.id]);
  const loadMinimap = useAppStore((state) => state.loadMinimap);

  // The page's title follows the open map. It is set on the one title element that index.html has.
  useEffect(() => {
    document.title = `${map.name} · LILA BLACK Player Journeys`;
  }, [map.name]);

  return (
    <div role="tabpanel" id={MAP_PANEL_ID} aria-labelledby={tabId(map.id)} className="h-full">
      {minimap?.status === "ready" ? (
        <MapView key={map.id} map={map} image={minimap.value} manifest={manifest} />
      ) : (
        <Centred>
          {minimap?.status === "error" ? (
            <LoadError
              title={`${map.name} did not load`}
              failure={minimap.failure}
              retrying={minimap.retrying}
              onRetry={() => void loadMinimap(map).then(focusMapIfFocusWasLost)}
            />
          ) : (
            <LoadingLine>{`Loading ${map.name}…`}</LoadingLine>
          )}
        </Centred>
      )}
    </div>
  );
}
