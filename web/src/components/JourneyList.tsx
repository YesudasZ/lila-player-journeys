import { useMemo } from "react";

import { fateLabel, whoLabel } from "../lib/labels.ts";
import type { MapEntry } from "../lib/manifest.ts";
import { useAppStore } from "../state/store.ts";
import { Sample } from "./Samples.tsx";

/**
 * The journeys of the open match. Choosing one focuses it on the map, as a click on its path does,
 * so the focus can also be set by keyboard; choosing it again clears the focus.
 */
export function JourneyList({ map, matchId }: { map: MapEntry; matchId: string }) {
  const loaded = useAppStore((state) => state.journeys[map.id]);
  const focus = useAppStore((state) => state.focus);
  const setFocus = useAppStore((state) => state.setFocus);
  const journeys = useMemo(() => (loaded?.status === "ready" ? loaded.value.filter((journey) => journey.match === matchId) : []), [loaded, matchId]);
  if (journeys.length === 0) return null;

  return (
    <section aria-labelledby="journeys-heading" className="flex max-h-[36%] min-h-0 flex-col border-t border-border">
      <h2 id="journeys-heading" className="px-4 pt-3 pb-1 font-heading text-[13px] font-semibold tracking-wide">
        Journeys of <span className="font-mono font-medium">{matchId}</span>
      </h2>
      <ul className="min-h-0 overflow-y-auto px-2 pb-2">
        {journeys.map((journey) => (
          <li key={journey.id}>
            <button
              type="button"
              aria-pressed={journey.id === focus}
              onClick={() => {
                setFocus(journey.id === focus ? null : journey.id);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs text-text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent aria-pressed:bg-surface-2 aria-pressed:text-text aria-pressed:shadow-[inset_2px_0_0_var(--color-highlight)]"
            >
              <Sample layer={journey.actor === "human" ? "humans" : "bots"} />
              <span className="text-text">{whoLabel(journey)}</span>
              <span className="ml-auto">{fateLabel(journey.fate)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
