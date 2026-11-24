import { HEAT_KINDS, HEAT_LABELS, HEAT_TOKENS, heatEvents, heatSummary } from "../lib/heat.ts";
import { countLabel } from "../lib/labels.ts";
import type { MapEntry } from "../lib/manifest.ts";
import { selectHeat } from "../state/shown.ts";
import { useAppStore } from "../state/store.ts";
import { Chip } from "./Filters.tsx";

/**
 * The heat layers, at the top of the sidebar: at most one is on, and pressing the one that is on
 * switches the heat off. Under the buttons is the legend of the layer that is on: its numbers, what
 * it counts and at whose position, the rows of each event by its name in the data, and a strip from
 * the faintest to the fullest cell. The sentence sits in a status element that is always on the
 * page, so that assistive technology announces it when the layer or the filters change.
 */
export function HeatControl({ map }: { map: MapEntry }) {
  const kind = useAppStore((state) => state.heat);
  const setHeat = useAppStore((state) => state.setHeat);
  const heat = useAppStore(selectHeat);
  const said = heat ? heatSummary(heat, map.scale) : kind === null ? "" : `Loading the journeys of ${map.name}…`;

  return (
    <section aria-labelledby="heat-heading" className="border-b border-border px-4 pt-3 pb-3">
      <div className="flex items-center gap-3">
        <h2 id="heat-heading" className="font-heading text-[13px] font-semibold tracking-wide">
          Heat
        </h2>
        <div role="group" aria-labelledby="heat-heading" className="flex flex-wrap gap-1.5">
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
      <p role="status" className={said ? "mt-2 text-xs leading-4 text-text-muted" : "sr-only"}>
        {said}
      </p>
      {heat && heat.total > 0 && (
        <>
          <p className="mt-1 font-mono text-[11px] text-text-muted">{heatEvents(heat)}</p>
          <div aria-hidden="true" className="mt-1.5 flex items-center gap-2 font-mono text-[11px] text-text-muted">
            <span>1</span>
            <span className="h-2 flex-1 rounded-sm" style={{ background: `linear-gradient(to right, transparent, var(${HEAT_TOKENS[heat.kind]}))` }} />
            <span>{countLabel(heat.most)}</span>
          </div>
        </>
      )}
    </section>
  );
}
