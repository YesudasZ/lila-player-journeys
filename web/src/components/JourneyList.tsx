import { fateLabel, whoLabel } from "../lib/labels.ts";
import { selectDrawList } from "../state/shown.ts";
import { useAppStore } from "../state/store.ts";
import { moveInList } from "./listKeys.ts";
import { Sample } from "./Samples.tsx";

/**
 * The journeys of the open match that are drawn. Choosing one focuses it on the map, as a click on
 * its path does, so the focus can also be set by keyboard; choosing it again clears the focus.
 * The list is one stop for the Tab key; the arrow keys move inside it.
 */
export function JourneyList({ matchId }: { matchId: string }) {
  const list = useAppStore(selectDrawList);
  const focus = useAppStore((state) => state.focus);
  const setFocus = useAppStore((state) => state.setFocus);
  const journeys = list?.single ? list.journeys.map((drawn) => drawn.journey) : [];
  if (journeys.length === 0) return null;
  const tabStop = journeys.some((journey) => journey.id === focus) ? focus : journeys[0].id;

  return (
    <section aria-labelledby="journeys-heading" className="flex max-h-[36%] min-h-24 flex-col border-t border-border">
      <h2 id="journeys-heading" className="px-4 pt-3 pb-1 font-heading text-[13px] font-semibold tracking-wide">
        Journeys of <span className="font-mono font-medium">{matchId}</span>
      </h2>
      <ul onKeyDown={moveInList} className="min-h-0 overflow-y-auto px-2 pb-2">
        {journeys.map((journey) => (
          <li key={journey.id}>
            <button
              type="button"
              tabIndex={journey.id === tabStop ? 0 : -1}
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
