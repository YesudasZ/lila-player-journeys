import { eventLines } from "../lib/journeyEvents.ts";
import { whoLabel } from "../lib/labels.ts";
import type { Manifest, MapEntry } from "../lib/manifest.ts";
import { selectDrawList } from "../state/shown.ts";
import { useAppStore } from "../state/store.ts";
import { Sample } from "./Samples.tsx";

/**
 * The events of the focused journey of an open match as text, in the order of time: what the
 * tooltips of its markers say, for those who do not point at the map. It lists the markers that are
 * drawn, so it follows the legend's switches, and it lists the whole journey, whatever moment the
 * time slider stands at. The list takes the keyboard focus, so that it can be scrolled with the keys.
 */
export function JourneyEvents({ map, manifest }: { map: MapEntry; manifest: Manifest }) {
  const list = useAppStore(selectDrawList);
  const focus = useAppStore((state) => state.focus);
  const journey = list?.single ? list.journeys.find((drawn) => drawn.journey.id === focus)?.journey : undefined;
  if (!list || !journey) return null;
  const lines = eventLines(list, journey.id, map, manifest.encoding);

  return (
    <section aria-labelledby="events-heading" className="border-t border-border">
      <h2 id="events-heading" className="px-4 pt-3 pb-1 font-heading text-[13px] font-semibold tracking-wide">
        Events of {whoLabel(journey)}
      </h2>
      {lines.length === 0 ? (
        <p className="px-4 pb-3 text-xs text-text-muted">No kill, death or loot of this journey is drawn.</p>
      ) : (
        <ol
          tabIndex={0}
          aria-labelledby="events-heading"
          className="max-h-40 overflow-y-auto px-4 pb-2 text-xs focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        >
          {lines.map((line) => (
            <li key={line.row} className="flex items-start gap-2 py-0.5">
              <Sample layer={line.kind} />
              <div>
                <span className="font-mono text-text-muted">{line.when}</span> {line.what}
                <div className="font-mono text-[11px] text-text-muted">{line.where}</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
