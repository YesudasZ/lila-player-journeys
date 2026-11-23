import { useLayoutEffect, useMemo, useRef } from "react";
import { useStore } from "zustand";

import type { MarkerKind } from "../lib/drawList.ts";
import { clock } from "../lib/labels.ts";
import type { Manifest } from "../lib/manifest.ts";
import { SPEEDS, sliderKeyAction, ticksOf } from "../lib/playback.ts";
import { pause, playback, seek, seekBy, setSpeed, togglePlay, type PlaybackState } from "../state/playback.ts";
import { selectDrawList } from "../state/shown.ts";
import { useAppStore } from "../state/store.ts";

const KEYS_ID = "timeline-keys";
const SLIDER_KEYS = "Left and right arrow: 5 seconds, with Shift 1 second. Page Up and Page Down: 60 seconds. Home and End: start and end. Space: play or pause.";

/** A mark above the track, in the colour its kind has on the map. Loot, of which there is much, is shorter. */
const MARK: Record<MarkerKind, string> = { loot: "h-1.5 bg-loot", storm_death: "h-3 bg-storm", death: "h-3 bg-death", kill: "h-3 bg-kill" };

/** Where playback stands and where the match ends, as the bar says it. */
const reading = (time: number, end: number): string => `${clock(Math.floor(time))} / ${clock(end)}`;

/**
 * The timeline under the map: play and pause, the time, a slider with a mark for every event of
 * the journeys that are drawn, and the speed. It plays one match; all matches together have no
 * clock. The time changes with every frame while a match plays, so the slider and the time are
 * written straight into the page, as the map's read-out is: React renders this bar only when play,
 * pause, speed, the match or the journeys drawn change.
 */
export function Timeline({ manifest }: { manifest: Manifest }) {
  const end = useStore(playback, (state) => state.end);
  const playing = useStore(playback, (state) => state.playing);
  const speed = useStore(playback, (state) => state.speed);
  const list = useAppStore(selectDrawList);
  const marks = useMemo(() => (list?.single ? ticksOf(list) : []), [list]);
  const slider = useRef<HTMLInputElement>(null);
  const said = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const write = ({ time, end: last }: PlaybackState) => {
      if (last === null || !slider.current || !said.current) return;
      slider.current.value = String(time);
      const now = reading(time, last);
      if (said.current.textContent === now) return; // the words change once a second
      said.current.textContent = now;
      slider.current.setAttribute("aria-valuetext", now.replace("/", "of"));
    };
    write(playback.getState());
    return playback.subscribe(write);
  }, [end]);

  if (end === null) {
    return (
      <section aria-label="Playback" className="flex h-14 items-center border-t border-border bg-surface px-4 text-xs text-text-muted">
        Open a match to play it back.
      </section>
    );
  }

  return (
    <section aria-label="Playback" className="flex h-14 items-center gap-3 border-t border-border bg-surface px-4">
      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? "Pause" : "Play"}
        title="Play/Pause (Space when the map or timeline is focused)"
        className="grid size-8 shrink-0 place-items-center rounded-md border border-accent bg-surface-2 text-accent hover:bg-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden="true">
          <path d={playing ? "M4 3h3v10H4zM9 3h3v10H9z" : "M5 3l8 5-8 5z"} />
        </svg>
      </button>
      <span ref={said} className="w-28 shrink-0 font-mono text-xs text-text" />
      <div className="relative min-w-0 flex-1">
        {/* The thumb is 12 pixels wide, so its middle travels between 6 pixels from either end: the marks keep to the same stretch. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-1.5 bottom-1/2 mb-0.5 h-3">
          {marks.map(({ kind, time }) => (
            <span key={`${kind} ${time}`} className={`absolute bottom-0 w-0.5 -translate-x-1/2 ${MARK[kind]}`} style={{ left: `${(time / end) * 100}%` }} />
          ))}
        </div>
        <input
          ref={slider}
          type="range"
          min={0}
          max={end}
          step="any"
          aria-label="Time in the match"
          aria-describedby={KEYS_ID}
          title={SLIDER_KEYS}
          onPointerDown={pause}
          onInput={(event) => {
            seek(Math.round(event.currentTarget.valueAsNumber)); // a dragged time is a whole second
          }}
          onKeyDown={(event) => {
            const action = sliderKeyAction(event, manifest.sample_step_seconds);
            if (!action) return;
            event.preventDefault();
            if (action.kind === "step") seekBy(action.seconds);
            else if (action.kind === "start") seek(0);
            else if (action.kind === "end") seek(end);
            else togglePlay();
          }}
          className="time-slider relative block w-full"
        />
        <p id={KEYS_ID} className="sr-only">
          {SLIDER_KEYS}
        </p>
      </div>
      <label className="flex shrink-0 items-center gap-1.5 text-xs text-text-muted">
        Speed
        <select
          value={speed}
          onChange={(event) => {
            setSpeed(Number(event.target.value));
          }}
          className="h-8 rounded-md border border-border bg-surface-2 px-1.5 font-mono text-xs text-text focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-accent"
        >
          {SPEEDS.map((each) => (
            <option key={each} value={each}>
              {each}x
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
