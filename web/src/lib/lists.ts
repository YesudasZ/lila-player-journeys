/** Keyboard and scrolling arithmetic shared by the lists of matches and journeys. Pure. */

/**
 * The entry of a list that holds its single Tab stop: the chosen one when it is in the list, else
 * the first. Null for an empty list.
 */
export function tabStopOf(ids: readonly string[], chosen: string | null): string | null {
  if (ids.length === 0) return null;
  return chosen !== null && ids.includes(chosen) ? chosen : ids[0];
}

/**
 * The scroll position of a list that brings one of its rows fully into view, moving as little as
 * possible. All values are in pixels: the row's top and height within the list's content, the
 * list's current scroll position and the height of its visible part.
 */
export function revealScrollTop(rowTop: number, rowHeight: number, scrollTop: number, viewHeight: number): number {
  if (rowTop < scrollTop) return rowTop;
  if (rowTop + rowHeight > scrollTop + viewHeight) return Math.min(rowTop, rowTop + rowHeight - viewHeight);
  return scrollTop;
}

/** Whether the legend card shows its rows: when the viewer has not folded it away, and always while the journeys failed to load, since it holds that message. */
export const legendOpen = (collapsed: boolean, failed: boolean): boolean => !collapsed || failed;
