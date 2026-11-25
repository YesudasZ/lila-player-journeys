/**
 * The arrow of a section that folds away: it points right while the section is folded and down while
 * it is open. The button that holds it needs the `group` class and `aria-expanded`.
 */
export function Chevron() {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      className="size-3 shrink-0 text-text-muted transition-transform group-aria-expanded:rotate-90 motion-reduce:transition-none"
    >
      <path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
