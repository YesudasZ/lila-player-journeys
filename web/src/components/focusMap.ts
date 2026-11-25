import { useLayoutEffect, type RefObject } from "react";

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

/**
 * When the element goes away while it holds the keyboard focus (Back, Forward, another map, a filter
 * that closes what it belongs to), the focus goes on to the map instead of falling back to the top of
 * the page. React runs this cleanup while the element is still on the page. An action that moves the
 * focus on by itself, such as closing the journeys panel, has done so before the check runs.
 */
export function useFocusRescue(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const element = ref.current;
    return () => {
      if (element?.contains(document.activeElement)) focusMapIfFocusWasLost();
    };
  }, [ref]);
}
