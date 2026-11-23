import { emptyNote } from "../lib/filters.ts";
import { dayLabel, fateLabel } from "../lib/labels.ts";
import type { Manifest, MapEntry } from "../lib/manifest.ts";
import { selectDrawList } from "../state/shown.ts";
import { useAppStore } from "../state/store.ts";

/** Over the map when the filters leave no journey on it: why, in plain words, and the way back. The map itself stays visible. */
export function EmptyNote({ map, manifest }: { map: MapEntry; manifest: Manifest }) {
  const list = useAppStore(selectDrawList);
  const days = useAppStore((state) => state.days);
  const fates = useAppStore((state) => state.fates);
  const clearFilters = useAppStore((state) => state.clearFilters);
  if (!list || list.counts.humans + list.counts.bots > 0) return null;
  const chosenDays = manifest.days.filter((day) => days.includes(day.id)).map((day) => dayLabel(day.date));

  return (
    <div role="status" className="absolute top-4 left-1/2 z-10 w-max max-w-[80%] -translate-x-1/2 rounded-md border border-border bg-surface px-4 py-3 text-center text-[13px]">
      <p>{emptyNote(map.name, chosenDays, fates.map(fateLabel))}</p>
      <button
        type="button"
        onClick={clearFilters}
        className="mt-2 h-8 rounded-md border border-border bg-surface px-3 text-xs font-medium text-text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent active:bg-border"
      >
        Clear filters
      </button>
    </div>
  );
}
