import { useEffect } from "react";

import { useAppStore } from "../state/store.ts";

const SHOWN_FOR = 6000; // milliseconds

/**
 * Said over the map when a day or fate filter has closed the open match, so that the view does not
 * change silently. It goes after a few seconds, or as soon as something else is chosen. The
 * sentence sits in a status element that is always on the page, so that assistive technology
 * announces it when it appears.
 */
export function FilterNotice() {
  const closed = useAppStore((state) => state.closedByFilters);
  const dismissNotice = useAppStore((state) => state.dismissNotice);

  useEffect(() => {
    if (closed === null) return;
    const timer = window.setTimeout(dismissNotice, SHOWN_FOR);
    return () => {
      window.clearTimeout(timer);
    };
  }, [closed, dismissNotice]);

  return (
    <p role="status" className={closed === null ? "sr-only" : "rounded-md border border-border bg-surface px-4 py-2 text-center text-[13px]"}>
      {closed !== null && "Match hidden by your filters — showing all matches"}
    </p>
  );
}
