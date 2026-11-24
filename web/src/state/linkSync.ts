/**
 * The view in the address bar. The page is opened with a link (`App` hands it to the store); from
 * then on the address follows the view, so that a reload or a copied address shows the same view.
 *
 * A step of the user (a map, a match, a focus, a filter, a switch or a heat layer) adds an entry to
 * the history, so Back and Forward walk through the views that were looked at. Everything else
 * rewrites the entry in place: moving and zooming the map and the time of playback, since nobody
 * wants to walk back through every drag or pause, and whatever a link or the arrival of data
 * changes, since the user chose none of it.
 */
import { decodeLink, encodeLink } from "../lib/link.ts";
import { linkTime, playback } from "./playback.ts";
import { selectLink } from "./shown.ts";
import { useAppStore, type AppState } from "./store.ts";

/** Milliseconds after the last change. Panning changes the view many times a second, and browsers limit how often an address may be rewritten. */
const WRITE_AFTER = 300;
/** Milliseconds of real time between two writes of the moment while a match plays: a reload then comes back close to it. Safari allows 100 writes in 30 s. */
const WRITE_WHILE_PLAYING = 2000;

/** The query of a view, which is a state of the app and the time of its playback; until the manifest is there, the one the page was opened with. */
function queryOf(state: AppState, time: number | null): string {
  const link = selectLink(state, time);
  return link ? encodeLink(link) : location.search;
}

/** The query of the view as the state and the clock stand. */
const currentQuery = (): string => queryOf(useAppStore.getState(), linkTime(playback.getState()));

/** An address of this page with another query. */
const withQuery = (query: string): string => `${location.pathname}${query}${location.hash}`;

/** The whole address of the view as the state stands, for "Copy link". It does not wait for the address bar to catch up. */
export function currentAddress(): string {
  return `${location.origin}${withQuery(currentQuery())}`;
}

/**
 * Write to the history: a new entry, or the one it stands on. A browser refuses a write that
 * follows too many others by throwing (Safari allows 100 in 30 seconds). The view is not harmed by
 * that, so the refusal stops here; the next write brings the address up to date.
 */
function write(how: "pushState" | "replaceState", query: string) {
  try {
    history[how](how === "pushState" ? null : history.state, "", withQuery(query));
  } catch (error) {
    console.warn(error);
  }
}

/**
 * Keep the address in step with the view, and the view in step with Back and Forward. While a match
 * plays, its moment is written in place every 2 s, not with every frame, so that a reload comes back
 * close to it; when the time comes to rest, after a pause or a seek, it is written at once. Returns
 * what stops it.
 *
 * `App` starts the clock's follower (`startPlayback`) before this, so the follower hears a change of
 * the app first: when a step is heard here, the clock already belongs to the view that the step opened.
 */
export function startLinkSync(): () => void {
  let timer = 0;
  // The view as it was last heard here: a state of the app, and the time of playback that goes with it. It is the view that a step leaves.
  let seen = useAppStore.getState();
  let rested = linkTime(playback.getState());

  /** Make the entry the history stands on say this query. */
  const rewrite = (query: string) => {
    window.clearTimeout(timer);
    if (query !== location.search) write("replaceState", query);
  };
  /** Rewrite the entry once the view has been still for a moment. */
  const later = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (!playback.getState().playing) rewrite(currentQuery()); // while a match plays the writes below take care of it
    }, WRITE_AFTER);
  };
  let playingTimer = 0;
  /** While a match plays, rewrite the entry every few seconds with its moment and whatever else has changed. */
  const writeWhilePlaying = () => {
    window.clearTimeout(playingTimer);
    playingTimer = window.setTimeout(() => {
      if (!playback.getState().playing) return; // the pause that ended it writes the moment it stopped at
      rewrite(currentQuery());
      writeWhilePlaying();
    }, WRITE_WHILE_PLAYING);
  };

  const stopApp = useAppStore.subscribe((state, before) => {
    const time = linkTime(playback.getState());
    if (state.steps === before.steps) later();
    else {
      const [from, to] = [queryOf(before, rested), queryOf(state, time)];
      if (to === from) later(); // a step that changes nothing in the address, as a click on the empty map: nothing to step back to
      else {
        // The entry that the step leaves gets the view as it last was, then the new view gets an entry of its own.
        rewrite(from);
        write("pushState", to);
      }
    }
    [seen, rested] = [state, time];
  });
  const stopClock = playback.subscribe((clock, before) => {
    if (clock.playing && !before.playing) writeWhilePlaying(); // a match starts to play
    // A clock that the follower is setting for a change of the app is not the time of the view that
    // is being left: that change is heard above in a moment, and takes the clock's time with it.
    if (useAppStore.getState() !== seen) return;
    rested = linkTime(clock);
    if (!clock.playing) later(); // while it plays the time changes sixty times a second: it is written every few seconds instead
  });
  /**
   * Back or Forward: the address is the one of another entry, whose view is opened, with its time
   * of playback (the clock's follower takes that from the link). A move of the map that was still
   * to be written belonged to the entry that was left, and is not written.
   */
  const onPop = () => {
    useAppStore.getState().applyLink(decodeLink(location.search));
  };
  window.addEventListener("popstate", onPop);
  return () => {
    stopApp();
    stopClock();
    window.clearTimeout(timer);
    window.clearTimeout(playingTimer);
    window.removeEventListener("popstate", onPop);
  };
}
