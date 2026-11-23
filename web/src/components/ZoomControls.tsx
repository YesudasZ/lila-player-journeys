import type { ReactNode } from "react";

import type { ZoomLimits } from "./mapSurface.ts";

interface ButtonProps {
  label: string;
  shortcut: string;
  /** At a zoom limit the button stays focusable, so the keyboard focus is not lost, but does nothing. */
  unavailable?: boolean;
  onPress: () => void;
  className: string;
  children: ReactNode;
}

function ControlButton({ label, shortcut, unavailable = false, onPress, className, children }: ButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={`${label} (${shortcut})`}
      aria-disabled={unavailable}
      onClick={() => {
        if (!unavailable) onPress();
      }}
      className={`grid size-8 place-items-center border border-border bg-surface text-text-muted focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent aria-disabled:text-text-muted/40 not-aria-disabled:hover:bg-surface-2 not-aria-disabled:hover:text-text not-aria-disabled:active:bg-border ${className}`}
    >
      {children}
    </button>
  );
}

const Glyph = ({ path }: { path: string }) => (
  <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
    <path d={path} />
  </svg>
);

interface Props {
  limits: ZoomLimits;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}

/** Zoom in, zoom out and Fit, for a hand that has no wheel and as a reminder of the keys. */
export function ZoomControls({ limits, onZoomIn, onZoomOut, onFit }: Props) {
  return (
    <div className="absolute right-4 bottom-4 flex flex-col">
      <ControlButton label="Zoom in" shortcut="+" unavailable={limits.atClosest} onPress={onZoomIn} className="rounded-t-md">
        <Glyph path="M8 3v10M3 8h10" />
      </ControlButton>
      <ControlButton label="Zoom out" shortcut="−" unavailable={limits.atFit} onPress={onZoomOut} className="-mt-px rounded-b-md">
        <Glyph path="M3 8h10" />
      </ControlButton>
      <ControlButton label="Fit map to window" shortcut="0" onPress={onFit} className="mt-1.5 rounded-md text-xs font-medium">
        Fit
      </ControlButton>
    </div>
  );
}
