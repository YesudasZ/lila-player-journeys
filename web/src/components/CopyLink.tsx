import { useEffect, useState } from "react";

import { currentAddress } from "../state/linkSync.ts";

const SAID_FOR = { copied: 2000, refused: 6000 }; // milliseconds a message stays

/** Copies the address of the current view. It says that it did, or what to do when the browser does not let a page copy. */
export function CopyLink() {
  const [said, setSaid] = useState<keyof typeof SAID_FOR | null>(null);

  useEffect(() => {
    if (!said) return;
    const timer = window.setTimeout(() => {
      setSaid(null);
    }, SAID_FOR[said]);
    return () => {
      window.clearTimeout(timer);
    };
  }, [said]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(currentAddress());
      setSaid("copied");
    } catch {
      setSaid("refused");
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-3">
      <span role="status" className="text-xs text-text-muted">
        {said === "copied" && "Link copied"}
        {said === "refused" && "Copy the address from the address bar"}
      </span>
      <button
        type="button"
        onClick={() => void copy()}
        className="h-8 rounded-md border border-border bg-surface px-3 text-xs font-medium text-text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent active:bg-border"
      >
        Copy link
      </button>
    </div>
  );
}
