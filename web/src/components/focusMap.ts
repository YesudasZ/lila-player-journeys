import { MAP_SURFACE_ID } from "./tabIds.ts";

/**
 * For after a button that had the keyboard focus has given way to the map, as "Try again" does when
 * the retry works: the focus goes on to the map instead of back to the top of the page. It stays
 * where it is when it has gone somewhere else in the meantime.
 */
export function focusMapIfFocusWasLost(): void {
  requestAnimationFrame(() => {
    if (document.activeElement === document.body) document.getElementById(MAP_SURFACE_ID)?.focus();
  });
}
