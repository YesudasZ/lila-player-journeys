import { useEffect } from "react";
import { flushSync } from "react-dom";

import type { Manifest, MapEntry } from "../lib/manifest.ts";
import { journeysIn } from "../lib/matches.ts";
import { selectMatchId } from "../state/shown.ts";
import { useAppStore } from "../state/store.ts";
import { focusMapIfFocusWasLost } from "./focusMap.ts";
import { JOURNEYS_BUTTON_ID, JOURNEYS_HEADING_ID, MAP_PANEL_ID, tabId } from "./tabIds.ts";
import { MapView } from "./MapView.tsx";
import { Centred, LoadError, LoadingLine } from "./StatusMessage.tsx";

/**
 * The panel of the open tab: the map once its minimap is there, a status line until then. While a
 * match is open and its journeys panel is closed, a button at the top right brings the panel back.
 */
export function MapPanel({ map, manifest }: { map: MapEntry; manifest: Manifest }) {
  const minimap = useAppStore((state) => state.minimaps[map.id]);
  const loadMinimap = useAppStore((state) => state.loadMinimap);
  const matchId = useAppStore(selectMatchId);
  const panelWanted = useAppStore((state) => state.journeysPanel);
  const setJourneysPanel = useAppStore((state) => state.setJourneysPanel);
  const open = matchId === null ? undefined : manifest.matches.find((match) => match.id === matchId);

  /** Bring the panel back and take the keyboard focus to its heading, so that the next Tab is in the panel. */
  function reopen() {
    flushSync(() => {
      setJourneysPanel(true);
    });
    document.getElementById(JOURNEYS_HEADING_ID)?.focus();
  }

  // The page's title follows the open map. It is set on the one title element that index.html has.
  useEffect(() => {
    document.title = `${map.name} · LILA BLACK Player Journeys`;
  }, [map.name]);

  return (
    <div role="tabpanel" id={MAP_PANEL_ID} aria-labelledby={tabId(map.id)} className="relative h-full">
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
      {open && !panelWanted && (
        <button
          id={JOURNEYS_BUTTON_ID}
          type="button"
          onClick={reopen}
          title={`Show the journeys of ${open.id}`}
          className="absolute top-4 right-4 z-10 h-8 rounded-md border border-border bg-surface/90 px-3 text-xs font-medium text-text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent active:bg-border"
        >
          Journeys ({journeysIn(open)})
        </button>
      )}
    </div>
  );
}
