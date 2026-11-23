import { useMemo, useState } from "react";

import { countLabel, counted, dayLabel } from "../lib/labels.ts";
import { matchesWithFates, onChosenDays } from "../lib/filters.ts";
import type { Manifest, MapEntry } from "../lib/manifest.ts";
import { findMatches, journeysIn, matchesOfMap, noMatchNote } from "../lib/matches.ts";
import { selectMatchId } from "../state/shown.ts";
import { useAppStore } from "../state/store.ts";
import { moveInList } from "./listKeys.ts";

const ROW =
  "flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-xs text-text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent aria-pressed:bg-surface-2 aria-pressed:text-text aria-pressed:shadow-[inset_2px_0_0_var(--color-accent)]";

/**
 * The matches of the open map that the filters leave, busiest first. "All matches" shows them together; choosing one opens
 * it alone, and choosing it again goes back. The box narrows the list to the ids that contain what
 * was typed. The list is one stop for the Tab key; the arrow keys move inside it. An empty list says
 * why, in a status element that is always on the page, so that it is announced when it gets its text.
 */
export function MatchList({ manifest, map }: { manifest: Manifest; map: MapEntry }) {
  const matchId = useAppStore(selectMatchId);
  const selectMatch = useAppStore((state) => state.selectMatch);
  const [typed, setTyped] = useState("");
  const chosenDays = useAppStore((state) => state.days);
  const fates = useAppStore((state) => state.fates);
  const loaded = useAppStore((state) => state.journeys[map.id]);
  const matches = useMemo(() => {
    const withFates = loaded?.status === "ready" ? matchesWithFates(loaded.value, fates) : null;
    return matchesOfMap(manifest, map.id).filter((match) => onChosenDays(match, chosenDays) && (!withFates || withFates.has(match.id)));
  }, [manifest, map.id, chosenDays, fates, loaded]);
  const found = useMemo(() => findMatches(matches, typed), [matches, typed]);
  const tabStop = found.some((match) => match.id === matchId) ? matchId : found.at(0)?.id;
  const days = useMemo(() => new Map(manifest.days.map((day) => [day.id, dayLabel(day.date)])), [manifest.days]);

  return (
    <section aria-labelledby="matches-heading" className="flex min-h-48 flex-1 flex-col">
      <div className="px-4 pt-3 pb-2">
        <h2 id="matches-heading" className="font-heading text-[13px] font-semibold tracking-wide">
          Matches
        </h2>
        <button
          type="button"
          aria-pressed={matchId === null}
          onClick={() => {
            selectMatch(map.id, null);
          }}
          className={`${ROW} mt-2 -mx-2 w-[calc(100%+1rem)] text-[13px]`}
        >
          All matches ({countLabel(matches.length)})
        </button>
        <input
          type="search"
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
          }}
          aria-label="Find a match by its id"
          placeholder="Find a match id"
          spellCheck={false}
          className="mt-2 h-8 w-full rounded-md border border-border bg-surface-2 px-2.5 font-mono text-xs text-text placeholder:font-sans placeholder:text-text-muted focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-accent"
        />
      </div>
      <p role="status" className={found.length === 0 ? "px-4 py-2 text-xs text-text-muted" : "sr-only"}>
        {found.length === 0 && noMatchNote(map.name, matches.length, typed)}
      </p>
      {found.length > 0 && (
        <ul onKeyDown={moveInList} className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {found.map((match) => (
            <li key={match.id}>
              <button
                type="button"
                tabIndex={match.id === tabStop ? 0 : -1}
                aria-pressed={match.id === matchId}
                onClick={() => {
                  selectMatch(map.id, match.id === matchId ? null : match.id);
                }}
                className={ROW}
              >
                <span className="font-mono text-text">{match.id}</span>
                <span>{days.get(match.day)}</span>
                <span className="ml-auto">
                  {counted(journeysIn(match), "journey", "journeys")}
                  {match.bots > 0 && `, ${counted(match.bots, "bot", "bots")}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
