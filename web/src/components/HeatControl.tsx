import { useRef, useState } from "react";

import { HEAT_KINDS, HEAT_LABELS, HEAT_TOKENS, heatEvents, heatLine, heatSummary } from "../lib/heat.ts";
import { countLabel } from "../lib/labels.ts";
import type { MapEntry } from "../lib/manifest.ts";
import { selectHeat } from "../state/shown.ts";
import { useAppStore } from "../state/store.ts";
import { Chip } from "./Filters.tsx";
import { useFocusRescue } from "./focusMap.ts";

const DETAILS_ID = "heat-details";

/** The ⓘ button that opens the details of the heat layer. It goes with the layer, so Back may remove it while it has the focus. */
function DetailsButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const button = useRef<HTMLButtonElement>(null);
  useFocusRescue(button);
  return (
    <button
      ref={button}
      type="button"
      aria-expanded={open}
      aria-controls={DETAILS_ID}
      aria-label="Heat layer details"
      title="Heat layer details"
      onClick={onToggle}
      className="grid size-5 shrink-0 place-items-center rounded-full border border-border font-heading text-[11px] leading-none font-semibold text-text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent aria-expanded:border-accent-2 aria-expanded:text-accent-2"
    >
      i
    </button>
  );
}

/**
 * The heat layers, at the top of the left column: at most one is on, and pressing the one that is on
 * switches the heat off. Under the buttons, one line says how much the layer counts and how much its
 * fullest cell holds, above a strip from the faintest to the fullest cell. The ⓘ button beside the
 * line opens the details: how many matches, the cell size, what is counted and at whose position,
 * and the rows of each event by its name in the data. The line sits in a status element that is
 * always on the page, so that assistive technology announces it when the layer or the filters change.
 */
export function HeatControl({ map }: { map: MapEntry }) {
  const kind = useAppStore((state) => state.heat);
  const setHeat = useAppStore((state) => state.setHeat);
  const heat = useAppStore(selectHeat);
  const [details, setDetails] = useState(false);
  const line = heatLine(heat, kind, map.name);

  return (
    <section aria-labelledby="heat-heading" className="border-b border-border px-3 pt-3 pb-3">
      <div className="flex items-center gap-3">
        <h2 id="heat-heading" className="font-heading text-[13px] font-semibold tracking-wide">
          Heat
        </h2>
        <div role="group" aria-labelledby="heat-heading" className="flex flex-wrap gap-1">
          {HEAT_KINDS.map((each) => (
            <Chip
              key={each}
              pressed={kind === each}
              onPress={() => {
                setHeat(kind === each ? null : each);
              }}
            >
              {HEAT_LABELS[each]}
            </Chip>
          ))}
        </div>
      </div>
      <div className={line ? "mt-2 flex items-start gap-2" : undefined}>
        <p role="status" className={line ? "min-w-0 flex-1 text-xs leading-5 text-text-muted" : "sr-only"}>
          {line}
        </p>
        {heat && heat.total > 0 && (
          <DetailsButton
            open={details}
            onToggle={() => {
              setDetails(!details);
            }}
          />
        )}
      </div>
      {heat && heat.total > 0 && (
        <>
          <div aria-hidden="true" className="mt-1.5 flex items-center gap-2 font-mono text-[11px] text-text-muted">
            <span>1</span>
            <span className="h-2 flex-1 rounded-sm" style={{ background: `linear-gradient(to right, transparent, var(${HEAT_TOKENS[heat.kind]}))` }} />
            <span>{countLabel(heat.most)}</span>
          </div>
          <div id={DETAILS_ID} hidden={!details} className="mt-2 rounded-md bg-surface-2 px-2.5 py-2 text-xs leading-5 text-text-muted">
            <p>{heatSummary(heat, map.scale)}</p>
            <p className="mt-1 font-mono text-[11px] leading-4">{heatEvents(heat)}</p>
          </div>
        </>
      )}
    </section>
  );
}
