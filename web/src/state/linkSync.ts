/**
 * The view in the address bar. The page is opened with a link (`App` hands it to the store); from
 * then on every change of the view is written back into the address, so that a reload or a copied
 * address shows the same view.
 */
import { encodeLink } from "../lib/link.ts";
import { linkTime, playback } from "./playback.ts";
import { selectLink } from "./shown.ts";
import { useAppStore } from "./store.ts";

/** Milliseconds after the last change. Panning changes the view many times a second, and browsers limit how often an address may be rewritten. */
const WRITE_AFTER = 300;

/** The query of the view as the state and the clock stand; until the manifest is there, the one the page was opened with. */
function currentQuery(): string {
  const link = selectLink(useAppStore.getState(), linkTime(playback.getState()));
  return link ? encodeLink(link) : location.search;
}

/** The whole address of the view as the state stands, for "Copy link". It does not wait for the address bar to catch up. */
export function currentAddress(): string {
  return `${location.origin}${location.pathname}${currentQuery()}${location.hash}`;
}

/**
 * Keep the address in step with the view. It is rewritten in place (`replaceState`), without a new
 * entry in the history: Back and Forward leave the tool, they step neither through views nor
 * through the pauses of playback. While a match plays the address is left alone; the time is
 * written when it comes to rest, after a pause or a seek. Returns what stops it.
 */
export function startLinkSync(): () => void {
  let timer = 0;
  const write = () => {
    if (playback.getState().playing) return; // the pause that ends the playing writes what has changed meanwhile
    const query = currentQuery();
    if (query !== location.search) history.replaceState(history.state, "", `${location.pathname}${query}${location.hash}`);
  };
  const later = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(write, WRITE_AFTER);
  };
  const stopApp = useAppStore.subscribe(later);
  const stopClock = playback.subscribe((state) => {
    if (!state.playing) later();
  });
  return () => {
    stopApp();
    stopClock();
    window.clearTimeout(timer);
  };
}
