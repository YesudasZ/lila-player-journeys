import { useRef, useState, type ReactNode } from "react";

import { activeFilters } from "../lib/filters.ts";
import { dayLabel, fateLabel } from "../lib/labels.ts";
import type { Manifest } from "../lib/manifest.ts";
import { PREF_KEYS, browserStorage, readFlag, writeFlag } from "../lib/prefs.ts";
import { useAppStore } from "../state/store.ts";
import { Chevron } from "./Chevron.tsx";

/** One choice of a filter or of a layer: pressed when it is chosen. A wide chip takes two cells of a grid. */
export function Chip({ pressed, onPress, wide = false, children }: { pressed: boolean; onPress: () => void; wide?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onPress}
      className={`rounded-full border border-border px-1.5 py-0.5 text-[11px] leading-4 whitespace-nowrap text-text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent aria-pressed:border-accent aria-pressed:bg-surface-2 aria-pressed:text-text ${wide ? "col-span-2" : ""}`}
    >
      {children}
    </button>
  );
}

const BODY_ID = "filters-body";

/**
 * The filters: days and fates. Nothing chosen in a row means all of it. The days are the folders
 * the data came in, which are UTC days; the last one was still being collected.
 *
 * The section folds away under its heading, which says how many chips are chosen, so that a folded
 * section still tells that the map is filtered. The page remembers the fold where the browser lets it.
 */
export function Filters({ manifest }: { manifest: Manifest }) {
  const days = useAppStore((state) => state.days);
  const fates = useAppStore((state) => state.fates);
  const toggleDay = useAppStore((state) => state.toggleDay);
  const toggleFate = useAppStore((state) => state.toggleFate);
  const clearFilters = useAppStore((state) => state.clearFilters);
  const [folded, setFolded] = useState(() => readFlag(browserStorage, PREF_KEYS.filtersCollapsed, false));
  const toggle = useRef<HTMLButtonElement>(null);
  const active = activeFilters(days, fates);

  return (
    <section aria-labelledby="filters-heading" className="border-b border-border px-3 pt-3 pb-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="filters-heading" className="font-heading text-[13px] font-semibold tracking-wide">
          <button
            ref={toggle}
            type="button"
            aria-expanded={!folded}
            aria-controls={BODY_ID}
            onClick={() => {
              setFolded(!folded);
              writeFlag(browserStorage, PREF_KEYS.filtersCollapsed, !folded);
            }}
            className="group -mx-1 flex items-center gap-1.5 rounded-sm px-1 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          >
            <Chevron />
            Filters
            {active > 0 && <span className="font-sans text-xs font-normal tracking-normal text-text-muted">· {active} active</span>}
          </button>
        </h2>
        {active > 0 && (
          <button
            type="button"
            onClick={() => {
              clearFilters();
              toggle.current?.focus(); // the button is gone once nothing is chosen: the keyboard focus stays with the filters
            }}
            className="rounded-sm text-xs text-accent-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Clear filters
          </button>
        )}
      </div>
      <div id={BODY_ID} hidden={folded}>
        <div role="group" aria-labelledby="filter-days" className="mt-2">
          <p id="filter-days" className="text-xs text-text-muted">
            Days (UTC)
          </p>
          <div className="mt-1 grid grid-cols-3 gap-1">
            {manifest.days.map((day) => (
              <Chip
                key={day.id}
                wide={day.partial}
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
          <div className="mt-1 flex flex-wrap gap-1">
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
      </div>
    </section>
  );
}
