import { LAYER_KEYS, shownLayers } from "../lib/drawList.ts";
import { LAYER_LABELS, countLabel, counted } from "../lib/labels.ts";
import type { MapEntry } from "../lib/manifest.ts";
import { selectDrawList, selectMatchId } from "../state/shown.ts";
import { useAppStore } from "../state/store.ts";
import { Sample } from "./Samples.tsx";
import { LoadError } from "./StatusMessage.tsx";

/**
 * What the map shows: how many matches and journeys, then one row per thing drawn with its sample,
 * its count and a switch. A hidden row keeps its count, so it still says how much it would show.
 */
export function Legend({ map }: { map: MapEntry }) {
  const list = useAppStore(selectDrawList);
  const loaded = useAppStore((state) => state.journeys[map.id]);
  const choices = useAppStore((state) => state.choices);
  const single = useAppStore(selectMatchId) !== null;
  const setShown = useAppStore((state) => state.setShown);
  const loadJourneys = useAppStore((state) => state.loadJourneys);
  const shown = shownLayers(choices, single);

  return (
    <section aria-labelledby="legend-heading" className="border-t border-border px-4 pt-3 pb-4">
      <h2 id="legend-heading" className="font-heading text-[13px] font-semibold tracking-wide">
        Legend
      </h2>
      {loaded?.status === "error" ? (
        <div className="py-4">
          <LoadError
            title={`The journeys of ${map.name} did not load`}
            failure={loaded.failure}
            retrying={loaded.retrying}
            onRetry={() => void loadJourneys(map)}
          />
        </div>
      ) : (
        <>
          <p role="status" className="mt-0.5 text-xs text-text-muted">
            {list
              ? `${counted(list.matches, "match", "matches")}, ${counted(list.counts.humans + list.counts.bots, "journey", "journeys")}`
              : `Loading the journeys of ${map.name}…`}
          </p>
          <ul className="mt-2">
            {LAYER_KEYS.map((layer) => (
              <li key={layer}>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-md py-1 text-text-muted hover:text-text has-checked:text-text has-focus-visible:outline-2 has-focus-visible:outline-accent">
                  <input
                    type="checkbox"
                    className="size-3.5 accent-accent outline-none"
                    checked={shown[layer]}
                    onChange={(event) => {
                      setShown(layer, event.target.checked);
                    }}
                  />
                  <Sample layer={layer} />
                  <span>{LAYER_LABELS[layer]}</span>
                  <span className="ml-auto font-mono text-xs text-text-muted">{list ? countLabel(list.counts[layer]) : "—"}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
