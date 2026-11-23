/** What a key does on the map. Pure; the map surface carries the action out. */

/** CSS pixels the map moves per press of an arrow key. */
export const KEY_PAN_STEP = 64;
/** The zoom factor of one press of a zoom button or of the plus and minus keys. */
export const BUTTON_ZOOM_STEP = 1.5;

/** `dx` and `dy` are how far the map itself moves, in CSS pixels, as in a drag. */
export type MapKeyAction = { kind: "pan"; dx: number; dy: number } | { kind: "zoom"; factor: number } | { kind: "fit" };

interface Pressed {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

/**
 * The action of a key press, or null when the key is not the map's. An arrow brings in what lies
 * that way, so the map moves the other way. With Ctrl, Cmd or Alt held the key belongs to the
 * browser: its own zoom and its shortcuts stay.
 */
export function mapKeyAction({ key, ctrlKey, metaKey, altKey }: Pressed): MapKeyAction | null {
  if (ctrlKey || metaKey || altKey) return null;
  switch (key) {
    case "ArrowLeft":
      return { kind: "pan", dx: KEY_PAN_STEP, dy: 0 };
    case "ArrowRight":
      return { kind: "pan", dx: -KEY_PAN_STEP, dy: 0 };
    case "ArrowUp":
      return { kind: "pan", dx: 0, dy: KEY_PAN_STEP };
    case "ArrowDown":
      return { kind: "pan", dx: 0, dy: -KEY_PAN_STEP };
    case "+":
    case "=":
      return { kind: "zoom", factor: BUTTON_ZOOM_STEP };
    case "-":
    case "_":
      return { kind: "zoom", factor: 1 / BUTTON_ZOOM_STEP };
    case "0":
      return { kind: "fit" };
    default:
      return null;
  }
}
