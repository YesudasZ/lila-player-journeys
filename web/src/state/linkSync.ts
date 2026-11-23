/**
 * The view in the address bar. The page is opened with a link (`App` hands it to the store); from
 * then on every change of the view is written back into the address, so that a reload or a copied
 * address shows the same view.
 */
import { encodeLink } from "../lib/link.ts";
import { selectLink } from "./shown.ts";
import { useAppStore } from "./store.ts";

/** Milliseconds after the last change. Panning changes the view many times a second, and browsers limit how often an address may be rewritten. */
const WRITE_AFTER = 300;

/** The query of the view as the state stands; until the manifest is there, the one the page was opened with. */
function currentQuery(): string {
  const link = selectLink(useAppStore.getState());
  return link ? encodeLink(link) : location.search;
}

/** The whole address of the view as the state stands, for "Copy link". It does not wait for the address bar to catch up. */
export function currentAddress(): string {
  return `${location.origin}${location.pathname}${currentQuery()}${location.hash}`;
}

/**
 * Keep the address in step with the view. It is rewritten in place, without a new entry in the
 * history: Back and Forward leave the tool, they do not step through views. Returns what stops it.
 */
export function startLinkSync(): () => void {
  let timer = 0;
  const write = () => {
    const query = currentQuery();
    if (query !== location.search) history.replaceState(history.state, "", `${location.pathname}${query}${location.hash}`);
  };
  const stop = useAppStore.subscribe(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(write, WRITE_AFTER);
  });
  return () => {
    stop();
    window.clearTimeout(timer);
  };
}
