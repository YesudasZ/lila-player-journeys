import { emptyNote } from "../lib/filters.ts";
import { dayLabel, fateLabel } from "../lib/labels.ts";
import type { Manifest, MapEntry } from "../lib/manifest.ts";
import { selectDrawList } from "../state/shown.ts";
import { useAppStore } from "../state/store.ts";
import { focusMapIfFocusWasLost } from "./focusMap.ts";

/**
 * Over the map when the filters leave no journey on it: why, in plain words, and the way back. The
 * map itself stays visible. The sentence sits in a status element that is always on the page, so
 * that assistive technology announces it when it appears; the button is outside it.
 */
export function EmptyNote({ map, manifest }: { map: MapEntry; manifest: Manifest }) {
  const list = useAppStore(selectDrawList);
  const days = useAppStore((state) => state.days);
  const fates = useAppStore((state) => state.fates);
  const clearFilters = useAppStore((state) => state.clearFilters);
  const empty = list !== null && list.counts.humans + list.counts.bots === 0;
  const chosenDays = manifest.days.filter((day) => days.includes(day.id)).map((day) => dayLabel(day.date));

  return (
    <div className={empty ? "absolute top-4 left-1/2 z-10 w-max max-w-[80%] -translate-x-1/2 rounded-md border border-border bg-surface px-4 py-3 text-center text-[13px]" : "sr-only"}>
      <p role="status">{empty && emptyNote(map.name, chosenDays, fates.map(fateLabel))}</p>
      {empty && (
        <button
          type="button"
          onClick={() => {
            clearFilters();
            focusMapIfFocusWasLost(); // this button goes with the note: the keyboard focus moves on to the map
          }}
          className="mt-2 h-8 rounded-md border border-border bg-surface px-3 text-xs font-medium text-text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent active:bg-border"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
