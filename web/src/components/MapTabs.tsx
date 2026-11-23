import { useRef, type KeyboardEvent } from "react";

import type { MapEntry } from "../lib/manifest.ts";
import { useAppStore } from "../state/store.ts";
import { MAP_PANEL_ID, tabId } from "./tabIds.ts";

/** One tab per map. Left and Right move between them and wrap, Home and End jump; the map follows the focus. */
export function MapTabs({ maps, counts }: { maps: MapEntry[]; counts: ReadonlyMap<string, number> }) {
  const mapId = useAppStore((state) => state.mapId);
  const selectMap = useAppStore((state) => state.selectMap);
  const tabs = useRef(new Map<string, HTMLButtonElement>());

  function onKeyDown(event: KeyboardEvent, index: number) {
    if (event.ctrlKey || event.metaKey || event.altKey) return; // Back and Forward, for example, stay the browser's
    const last = maps.length - 1;
    const target = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    const map = maps[target];
    selectMap(map.id);
    tabs.current.get(map.id)?.focus();
  }

  if (maps.length === 0) return null; // nothing to choose from until the manifest is there

  return (
    <div role="tablist" aria-label="Map" className="flex gap-1">
      {maps.map((map, index) => {
        const selected = map.id === mapId;
        return (
          <button
            key={map.id}
            ref={(element) => {
              if (element) tabs.current.set(map.id, element);
              else tabs.current.delete(map.id);
            }}
            type="button"
            role="tab"
            id={tabId(map.id)}
            aria-selected={selected}
            aria-controls={MAP_PANEL_ID}
            tabIndex={selected ? 0 : -1}
            onClick={() => {
              selectMap(map.id);
            }}
            onKeyDown={(event) => {
              onKeyDown(event, index);
            }}
            className="group relative flex h-12 items-center px-1 text-sm font-medium whitespace-nowrap text-text-muted outline-none aria-selected:text-text"
          >
            <span className="flex h-8 items-center rounded-md px-2.5 group-hover:bg-surface-2 group-hover:text-text group-focus-visible:outline-2 group-focus-visible:outline-accent group-active:bg-border group-aria-selected:group-hover:bg-transparent">
              {map.name}
              <span className="ml-1.5 font-mono text-xs font-normal text-text-muted">{counts.get(map.id)}</span>
            </span>
            {selected && <span className="absolute inset-x-3.5 bottom-0 h-0.5 bg-accent" />}
          </button>
        );
      })}
    </div>
  );
}
