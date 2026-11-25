import { useState } from "react";

import { LAYER_KEYS, shownLayers } from "../lib/drawList.ts";
import { LAYER_LABELS, countLabel, drawnLine } from "../lib/labels.ts";
import { legendOpen } from "../lib/lists.ts";
import type { MapEntry } from "../lib/manifest.ts";
import { PREF_KEYS, browserStorage, readFlag, writeFlag } from "../lib/prefs.ts";
import { selectDrawList, selectMatchId } from "../state/shown.ts";
import { useAppStore } from "../state/store.ts";
import { Chevron } from "./Chevron.tsx";
import { focusMapIfFocusWasLost } from "./focusMap.ts";
import { Sample } from "./Samples.tsx";
import { LoadError } from "./StatusMessage.tsx";

const BODY_ID = "legend-body";

/**
 * What the map shows, on a card at the map's bottom left: how many matches and journeys are drawn,
 * then one row per thing drawn with its sample, its count and a switch. A hidden row keeps its count,
 * so it still says how much it would show; the first line follows the switches for humans and bots.
 *
 * The card folds down to its title, and the page remembers that where the browser lets it. Folded,
 * its first line is still there for assistive technology. It stays open while the journeys failed to
 * load, since it holds the message and the button that tries again.
 */
export function Legend({ map }: { map: MapEntry }) {
  const list = useAppStore(selectDrawList);
  const loaded = useAppStore((state) => state.journeys[map.id]);
  const choices = useAppStore((state) => state.choices);
  const single = useAppStore(selectMatchId) !== null;
  const setShown = useAppStore((state) => state.setShown);
  const loadJourneys = useAppStore((state) => state.loadJourneys);
  const [folded, setFolded] = useState(() => readFlag(browserStorage, PREF_KEYS.legendCollapsed, false));
  const failed = loaded?.status === "error";
  const open = legendOpen(folded, failed);
  const shown = shownLayers(choices, single);

  return (
    <section
      aria-labelledby="legend-heading"
      className={`absolute bottom-4 left-4 z-10 max-h-[calc(100%-2rem)] overflow-y-auto rounded-md border border-border bg-surface/90 text-[13px] shadow-[0_8px_24px_var(--color-bg)] ${open ? "w-56" : "w-max"}`}
    >
      <h2 id="legend-heading" className="font-heading text-[13px] font-semibold tracking-wide">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={BODY_ID}
          aria-disabled={failed}
          title={failed ? undefined : open ? "Fold the legend away" : "Show the legend"}
          onClick={() => {
            if (failed) return;
            setFolded(!folded);
            writeFlag(browserStorage, PREF_KEYS.legendCollapsed, !folded);
          }}
          className="group flex w-full items-center gap-1.5 rounded-md px-3 py-2 text-left not-aria-disabled:hover:text-text focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        >
          <Chevron />
          Legend
        </button>
      </h2>
      {failed ? (
        <div id={BODY_ID} className="px-3 pt-1 pb-3">
          <LoadError
            title={`The journeys of ${map.name} did not load`}
            failure={loaded.failure}
            retrying={loaded.retrying}
            onRetry={() => void loadJourneys(map).then(focusMapIfFocusWasLost)}
          />
        </div>
      ) : (
        <>
          <p role="status" className={open ? "-mt-1 px-3 text-xs text-text-muted" : "sr-only"}>
            {list ? drawnLine(list) : `Loading the journeys of ${map.name}…`}
          </p>
          <ul id={BODY_ID} hidden={!open} className="px-3 pt-1 pb-2">
            {LAYER_KEYS.map((layer) => (
              <li key={layer}>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-md py-0.5 text-xs text-text-muted hover:text-text has-checked:text-text has-focus-visible:outline-2 has-focus-visible:outline-accent">
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
                  <span className="ml-auto font-mono text-text-muted">{list ? countLabel(list.counts[layer]) : "—"}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
