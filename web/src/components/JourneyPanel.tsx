import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";

import { fateLabel, whoLabel } from "../lib/labels.ts";
import { revealScrollTop, tabStopOf } from "../lib/lists.ts";
import type { Manifest, MapEntry } from "../lib/manifest.ts";
import { matchSummary } from "../lib/matches.ts";
import { selectDrawList } from "../state/shown.ts";
import { useAppStore } from "../state/store.ts";
import { focusMapIfFocusWasLost } from "./focusMap.ts";
import { moveInList } from "./listKeys.ts";
import { Sample } from "./Samples.tsx";
import { ALL_MATCHES_ID, JOURNEYS_BUTTON_ID, JOURNEYS_HEADING_ID } from "./tabIds.ts";

const BUTTON =
  "rounded-md border border-border bg-surface text-xs font-medium text-text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent active:bg-border";

/**
 * The journeys of the open match, beside the map: what the match was, then one row per journey that
 * is drawn. Choosing a row focuses that journey on the map, as a click on its path does; choosing it
 * again clears the focus. The list is one Tab stop; the arrow keys move inside it.
 *
 * Closing the panel (× or Escape) keeps the match open; "Close match" goes back to all matches.
 * From 1200 px the panel has a column of its own; below that it floats over the map's right edge.
 */
export function JourneyPanel({ manifest, map, matchId }: { manifest: Manifest; map: MapEntry; matchId: string }) {
  const list = useAppStore(selectDrawList);
  const focus = useAppStore((state) => state.focus);
  const setFocus = useAppStore((state) => state.setFocus);
  const selectMatch = useAppStore((state) => state.selectMatch);
  const setJourneysPanel = useAppStore((state) => state.setJourneysPanel);
  const panelRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const match = manifest.matches.find((entry) => entry.id === matchId);
  const summary = match ? matchSummary(match, manifest.days) : null;
  const journeys = list?.single ? list.journeys.map((drawn) => drawn.journey) : [];
  const tabStop = tabStopOf(
    journeys.map((journey) => journey.id),
    focus,
  );

  // The focused journey stays in view, also when it was chosen on the map. Only the list scrolls.
  useLayoutEffect(() => {
    const rows = listRef.current;
    if (!rows || focus === null) return;
    const row = [...rows.querySelectorAll<HTMLElement>("[data-journey]")].find((each) => each.dataset.journey === focus);
    if (row) rows.scrollTop = revealScrollTop(row.offsetTop, row.offsetHeight, rows.scrollTop, rows.clientHeight);
  }, [focus]);

  // When the panel goes away while it holds the keyboard focus (Back, another map, a filter that
  // closes the match), the focus goes on to the map instead of falling back to the top of the page.
  // An explicit close moves it on itself, before this looks.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    return () => {
      if (panel?.contains(document.activeElement)) focusMapIfFocusWasLost();
    };
  }, []);

  /** Close the panel and keep the match: the focus goes to the button that brings the panel back. */
  function close() {
    flushSync(() => {
      setJourneysPanel(false);
    });
    document.getElementById(JOURNEYS_BUTTON_ID)?.focus();
  }

  /** Go back to all matches of the map: the focus goes to "All matches", which is always on the page. */
  function closeMatch() {
    flushSync(() => {
      selectMatch(map.id, null);
    });
    document.getElementById(ALL_MATCHES_ID)?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Escape" || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    event.preventDefault();
    close();
  }

  return (
    <aside
      ref={panelRef}
      aria-labelledby={JOURNEYS_HEADING_ID}
      onKeyDown={onKeyDown}
      className="relative z-20 col-start-2 row-start-2 flex min-h-0 w-[clamp(260px,26vw,300px)] flex-col justify-self-end border-l border-border bg-surface text-[13px] shadow-[-12px_0_24px_var(--color-bg)] min-[1200px]:col-start-3 min-[1200px]:row-span-2 min-[1200px]:w-auto min-[1200px]:justify-self-stretch min-[1200px]:shadow-none"
    >
      <div className="flex items-start gap-2 border-b border-border px-4 pt-3 pb-3">
        <div className="min-w-0 flex-1">
          <h2
            id={JOURNEYS_HEADING_ID}
            tabIndex={-1}
            className="rounded-sm font-heading text-[13px] font-semibold tracking-wide outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Journeys of <span className="font-mono font-medium">{matchId}</span>
          </h2>
          {summary && (
            <p className="mt-1 text-xs leading-5 text-text-muted">
              {summary.when}
              <br />
              {summary.who}
              <br />
              {summary.events}
            </p>
          )}
        </div>
        <button type="button" onClick={close} aria-label="Close the journeys panel" title="Close the journeys panel (Escape)" className={`size-7 shrink-0 text-sm ${BUTTON}`}>
          ×
        </button>
      </div>
      <div className="border-b border-border px-4 py-2">
        <button type="button" onClick={closeMatch} title={`Back to all matches of ${map.name}`} className={`h-7 px-2.5 ${BUTTON}`}>
          Close match
        </button>
      </div>
      {journeys.length === 0 ? (
        <p role="status" className="px-4 py-3 text-xs text-text-muted">
          No journey of this match is drawn: Humans and Bots are switched off in the legend.
        </p>
      ) : (
        <ul ref={listRef} aria-label={`Journeys of ${matchId}`} onKeyDown={moveInList} className="relative min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {journeys.map((journey) => (
            <li key={journey.id}>
              <button
                type="button"
                data-journey={journey.id}
                tabIndex={journey.id === tabStop ? 0 : -1}
                aria-pressed={journey.id === focus}
                onClick={() => {
                  setFocus(journey.id === focus ? null : journey.id);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent aria-pressed:bg-surface-2 aria-pressed:text-text aria-pressed:shadow-[inset_2px_0_0_var(--color-highlight)]"
              >
                <Sample layer={journey.actor === "human" ? "humans" : "bots"} />
                <span className="truncate text-text">{whoLabel(journey)}</span>
                <span className="ml-auto shrink-0">{fateLabel(journey.fate)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
