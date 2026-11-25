import { useEffect, useRef } from "react";
import { flushSync } from "react-dom";

import type { Manifest, MapEntry, MatchEntry } from "../lib/manifest.ts";
import { journeysIn } from "../lib/matches.ts";
import { selectMatchId } from "../state/shown.ts";
import { useAppStore } from "../state/store.ts";
import { focusMapIfFocusWasLost, useFocusRescue } from "./focusMap.ts";
import { Legend } from "./Legend.tsx";
import { JOURNEYS_BUTTON_ID, JOURNEYS_HEADING_ID, MAP_PANEL_ID, tabId } from "./tabIds.ts";
import { MapView } from "./MapView.tsx";
import { Centred, LoadError, LoadingLine } from "./StatusMessage.tsx";

/** The button at the map's top right that brings the journeys panel back while a match is open. */
function ReopenButton({ match, onReopen }: { match: MatchEntry; onReopen: () => void }) {
  const button = useRef<HTMLButtonElement>(null);
  useFocusRescue(button); // Back closes the match and removes the button, which may hold the focus that closing the panel gave it
  return (
    <button
      ref={button}
      id={JOURNEYS_BUTTON_ID}
      type="button"
      onClick={onReopen}
      title={`Show the journeys of ${match.id}`}
      className="absolute top-4 right-4 z-10 h-8 rounded-md border border-border bg-surface/90 px-3 text-xs font-medium text-text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent active:bg-border"
    >
      Journeys ({journeysIn(match)})
    </button>
  );
}

/**
 * The panel of the open tab: the map once its minimap is there, a status line until then. Over it are
 * the legend card and, while a match is open and its journeys panel is closed, a button at the top
 * right that brings the panel back. They are there also while the minimap loads or failed to load: the
 * journeys come apart from the minimap, and the legend holds their "Try again". Once the map is there,
 * they sit inside its area, so that the map's keys work on them and they follow the map in Tab order.
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

  // Made here and handed to the map, so that the map's own updates (the hovered thing, many times a
  // second while the view moves) leave them alone.
  const overlays = (
    <>
      {open && !panelWanted && <ReopenButton match={open} onReopen={reopen} />}
      <Legend map={map} />
    </>
  );

  return (
    <div role="tabpanel" id={MAP_PANEL_ID} aria-labelledby={tabId(map.id)} className="relative h-full">
      {minimap?.status === "ready" ? (
        <MapView key={map.id} map={map} image={minimap.value} manifest={manifest}>
          {overlays}
        </MapView>
      ) : (
        <>
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
          {overlays}
        </>
      )}
    </div>
  );
}
