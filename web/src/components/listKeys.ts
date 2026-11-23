import type { KeyboardEvent } from "react";

/**
 * Arrow keys in a list of buttons. Up and Down move the focus, Home and End jump to the ends. The
 * list gives one of its buttons to the Tab key (tabIndex 0) and takes the others out (-1), so that
 * Tab passes a list of hundreds of matches in one step instead of hundreds.
 */
export function moveInList(event: KeyboardEvent<HTMLUListElement>): void {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const buttons = [...event.currentTarget.querySelectorAll("button")];
  const at = buttons.findIndex((button) => button === event.target);
  const last = buttons.length - 1;
  const to = { ArrowDown: Math.min(at + 1, last), ArrowUp: Math.max(at - 1, 0), Home: 0, End: last }[event.key];
  if (at === -1 || to === undefined) return;
  event.preventDefault();
  buttons[to].focus();
}
