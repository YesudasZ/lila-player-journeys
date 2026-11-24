/**
 * The clock of playback. It lives outside React, in a store of its own: while a match plays the
 * time changes with every frame, and only the map's layer and the time slider follow that, by
 * listening here. React reads `playing`, `speed` and `end`, which change rarely.
 */
import { createStore } from "zustand/vanilla";

import { checkedLink, roundedTime } from "../lib/link.ts";
import { FIRST_SPEED, advance } from "../lib/playback.ts";
import { selectMatchId } from "./shown.ts";
import { useAppStore, type AppState } from "./store.ts";

export interface PlaybackState {
  /** Seconds from the start of the open match to its last row: where the time slider ends. Null while all matches are shown, which cannot be played. */
  end: number | null;
  /** Seconds into the open match. At the end the whole match is shown, and that is how a match opens. */
  time: number;
  playing: boolean;
  /** Seconds of the match per second of real time. */
  speed: number;
}

export const playback = createStore<PlaybackState>(() => ({ end: null, time: 0, playing: false, speed: FIRST_SPEED }));

let frame = 0; // the animation frame that has been asked for, 0 while the clock stands
let last: number | null = null; // when the frame before was, in milliseconds; null before the first frame of a run

/** One frame of a running clock. What listens to the time draws in this same frame (the map's layer does), so the map and the slider show one time. */
function tick(now: number) {
  const { time, end, speed } = playback.getState();
  const elapsed = last === null ? 0 : now - last; // the first frame only sets the time to count from
  last = now;
  const next = end === null ? time : advance(time, elapsed, speed, end);
  if (end === null || next >= end) {
    frame = 0;
    playback.setState({ time: next, playing: false });
    return;
  }
  playback.setState({ time: next });
  if (playback.getState().playing) frame = requestAnimationFrame(tick); // a listener may have paused in answer
}

function stand() {
  if (frame !== 0) cancelAnimationFrame(frame);
  frame = 0;
}

/** Play the open match. At its end, which is where a match opens, it starts again from 0:00. */
export function play(): void {
  const { end, time, playing } = playback.getState();
  if (end === null || playing) return;
  last = null;
  playback.setState({ playing: true, time: time >= end ? 0 : time });
  if (playback.getState().playing) frame = requestAnimationFrame(tick); // a listener may have paused in answer
}

/** Stop the clock where it is. The time is rounded to what a link can hold, so that the address shows this very moment. */
export function pause(): void {
  if (!playback.getState().playing) return;
  stand();
  playback.setState((state) => ({ playing: false, time: roundedTime(state.time) }));
}

export function togglePlay(): void {
  if (playback.getState().playing) pause();
  else play();
}

/** Go to a time of the open match, kept inside it. A match that plays goes on from there. */
export function seek(time: number): void {
  const { end } = playback.getState();
  if (end === null) return;
  playback.setState({ time: Math.min(Math.max(roundedTime(time), 0), end) });
}

export function setSpeed(speed: number): void {
  playback.setState({ speed });
}

/** The time as a link holds it: null at the end, where the whole match is shown, and while no match is open. */
export function linkTime({ end, time }: PlaybackState): number | null {
  return end === null || time >= end ? null : roundedTime(time);
}

/**
 * Let the clock follow the app: a match that is opened starts whole and paused, at its end, and all
 * matches together have no clock. The link the page was opened with may name a time, which its
 * match gets once. The clock also stops when the tab is hidden, so that coming back to the tab
 * never finds the match far ahead. Returns what stops all this.
 */
export function startPlayback(): () => void {
  let opened: string | null = null; // the id of the match the clock is set for
  let fromLink = true; // the link the page was opened with has not been applied yet
  const follow = (state: AppState) => {
    const manifest = state.manifest.status === "ready" ? state.manifest.value : null;
    const id = selectMatchId(state);
    const match = manifest?.matches.find((entry) => entry.id === id) ?? null;
    if ((match?.id ?? null) !== opened) {
      opened = match?.id ?? null;
      stand();
      const linked = fromLink && manifest && match ? checkedLink(state.asked, manifest).t : null;
      playback.setState({ end: match?.span ?? null, time: linked ?? match?.span ?? 0, playing: false });
    }
    if (manifest) fromLink = false;
  };
  follow(useAppStore.getState());
  const stopFollowing = useAppStore.subscribe(follow);
  const onVisibility = () => {
    if (document.hidden) pause();
  };
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    stopFollowing();
    document.removeEventListener("visibilitychange", onVisibility);
    stand();
    playback.setState({ playing: false });
  };
}
