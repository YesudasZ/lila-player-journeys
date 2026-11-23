import type { ReactNode } from "react";

import type { Failure } from "../data/failure.ts";

/** Puts a status message in the middle of the cell it is in. */
export function Centred({ children }: { children: ReactNode }) {
  return <div className="grid h-full place-items-center p-6">{children}</div>;
}

/** One quiet line for a wait. It appears only when the wait lasts long enough to be noticed. */
export function LoadingLine({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="animate-appear-late text-[13px] text-text-muted">
      {children}
    </p>
  );
}

interface ProblemProps {
  title: string;
  /** What the reader can do about it. */
  advice: string;
  /** The label of the one button. */
  action: string;
  onAction: () => void;
  /** The action is under way. The button stays where it is, so the keyboard focus is not lost, and does nothing. */
  busy?: boolean;
}

/** What went wrong, what to do about it, and one button that does it. */
function Problem({ title, advice, action, onAction, busy = false }: ProblemProps) {
  return (
    <div role="alert" className="max-w-80 text-center">
      <h2 className="font-heading text-[15px] font-semibold">{title}</h2>
      <p className="mt-1 text-[13px] text-text-muted">{advice}</p>
      <button
        type="button"
        aria-disabled={busy}
        onClick={() => {
          if (!busy) onAction();
        }}
        className="mt-4 h-8 rounded-md border border-border bg-surface px-3 text-xs font-medium text-text-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent not-aria-disabled:hover:bg-surface-2 not-aria-disabled:hover:text-text not-aria-disabled:active:bg-border"
      >
        {action}
      </button>
    </div>
  );
}

const reload = () => {
  window.location.reload();
};

interface LoadErrorProps {
  title: string;
  failure: Failure;
  /** Another try is under way. */
  retrying: boolean;
  onRetry: () => void;
}

/**
 * A load that failed. When no usable answer came, the advice is to try again. When the data came and
 * this version of the tool cannot read it, trying again would not help: reloading fetches the current version.
 */
export function LoadError({ title, failure, retrying, onRetry }: LoadErrorProps) {
  if (failure === "refused") {
    return <Problem title={title} advice="The map data does not fit this version of the tool. Reload the page to get the current version." action="Reload" onAction={reload} />;
  }
  return <Problem title={title} advice="Check your connection and try again." action={retrying ? "Trying again…" : "Try again"} onAction={onRetry} busy={retrying} />;
}

/** A fault in the tool itself, caught while the page was drawn. */
export function Crashed() {
  return <Problem title="Something went wrong" advice="Reload the page to start again." action="Reload" onAction={reload} />;
}
