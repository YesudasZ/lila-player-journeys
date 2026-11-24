import { useRef, type ReactNode } from "react";

import { dayLabel, fateLabel } from "../lib/labels.ts";
import type { Manifest } from "../lib/manifest.ts";
import { useAppStore } from "../state/store.ts";

/** One choice of a filter or of a layer: pressed when it is chosen. */
export function Chip({ pressed, onPress, children }: { pressed: boolean; onPress: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onPress}
      className="rounded-full border border-border px-2 py-0.5 text-xs text-text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent aria-pressed:border-accent aria-pressed:bg-surface-2 aria-pressed:text-text"
    >
      {children}
    </button>
  );
}

/**
 * The filters: days and fates. Nothing chosen in a row means all of it. The days are the folders
 * the data came in, which are UTC days; the last one was still being collected.
 */
export function Filters({ manifest }: { manifest: Manifest }) {
  const days = useAppStore((state) => state.days);
  const fates = useAppStore((state) => state.fates);
  const toggleDay = useAppStore((state) => state.toggleDay);
  const toggleFate = useAppStore((state) => state.toggleFate);
  const clearFilters = useAppStore((state) => state.clearFilters);
  const daysLabel = useRef<HTMLParagraphElement>(null);

  return (
    <section aria-labelledby="filters-heading" className="border-b border-border px-4 pt-3 pb-3">
      <div className="flex items-baseline justify-between">
        <h2 id="filters-heading" className="font-heading text-[13px] font-semibold tracking-wide">
          Filters
        </h2>
        {(days.length > 0 || fates.length > 0) && (
          <button
            type="button"
            onClick={() => {
              clearFilters();
              daysLabel.current?.focus(); // the button is gone once nothing is chosen: the keyboard focus stays in the filters
            }}
            className="rounded-sm text-xs text-accent-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            Clear filters
          </button>
        )}
      </div>
      <div role="group" aria-labelledby="filter-days" className="mt-2">
        <p id="filter-days" ref={daysLabel} tabIndex={-1} className="rounded-sm text-xs text-text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          Days (UTC)
        </p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {manifest.days.map((day) => (
            <Chip
              key={day.id}
              pressed={days.includes(day.id)}
              onPress={() => {
                toggleDay(day.id);
              }}
            >
              {dayLabel(day.date)}
              {day.partial && <span className="text-[10px] text-text-muted"> partial</span>}
            </Chip>
          ))}
        </div>
      </div>
      <div role="group" aria-labelledby="filter-fates" className="mt-2">
        <p id="filter-fates" className="text-xs text-text-muted">
          Fate of the journey
        </p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {manifest.fates.map((fate) => (
            <Chip
              key={fate}
              pressed={fates.includes(fate)}
              onPress={() => {
                toggleFate(fate);
              }}
            >
              {fateLabel(fate)}
            </Chip>
          ))}
        </div>
      </div>
    </section>
  );
}
