import type { ReactNode } from "react";

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

/** What failed, what to do about it, and a button that tries again. */
export function LoadError({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <div role="alert" className="max-w-80 text-center">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <p className="mt-1 text-[13px] text-text-muted">Check your connection and try again.</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 h-8 rounded-md border border-border bg-surface px-3 text-xs font-medium text-text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent active:bg-border"
      >
        Try again
      </button>
    </div>
  );
}
