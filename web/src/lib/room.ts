/**
 * Room for the legend card, which sits over the bottom left corner of the map. When the fitted map
 * would put land under the card, it moves right, or up, just far enough to keep the land out of the
 * corner, and shrinks only when moving is not enough. The land is read from the minimap's own pixels,
 * so the room follows the shape of each island rather than its rectangular box. Pure.
 */
import type { Size } from "./projection.ts";
import { FIT_MARGIN, NO_INSETS, anchorOf, fitScale, type Box, type Insets } from "./view.ts";

/** A minimap's land row by row, read from a small sample of the image. */
export interface LandProfile {
  /** The size of the sample, in its own pixels. */
  width: number;
  height: number;
  /** For each row of the sample from the top, the x of its leftmost land pixel, or Infinity for a row without land. */
  leftmost: Float64Array;
}

/** A pixel is land when its brightest channel is above this. The minimaps' background is black, with a dark glow. */
export const LAND_THRESHOLD = 40;

/** The land profile of RGBA pixels, as a canvas's `getImageData` gives them. */
export function landProfile(pixels: ArrayLike<number>, width: number, height: number, threshold = LAND_THRESHOLD): LandProfile {
  const leftmost = new Float64Array(height).fill(Infinity);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4;
      if (Math.max(pixels[at], pixels[at + 1], pixels[at + 2]) > threshold) {
        leftmost[y] = x;
        break;
      }
    }
  }
  return { width, height, leftmost };
}

/**
 * Whether the map, fitted with these insets, keeps all its land out of the bottom left corner of the
 * viewport: `corner.width` CSS pixels from its left edge and `corner.height` from its bottom edge.
 * Each sample pixel counts with its whole area, so a coast that only touches the corner counts.
 */
export function cornerIsClear(profile: LandProfile, image: Size, artwork: Box, viewport: Size, corner: Size, insets: Insets): boolean {
  const stage = { viewport, artwork, insets };
  const scale = fitScale(stage);
  const anchor = anchorOf(stage);
  const middleX = (artwork.left + artwork.right) / 2;
  const middleY = (artwork.top + artwork.bottom) / 2;
  const across = image.width / profile.width; // image pixels per sample pixel
  const down = image.height / profile.height;
  for (let row = 0; row < profile.height; row += 1) {
    const x = profile.leftmost[row];
    if (x === Infinity) continue;
    const lowest = ((row + 1) * down - middleY) * scale + anchor.y;
    if (lowest <= viewport.height - corner.height) continue;
    const leftmost = (x * across - middleX) * scale + anchor.x;
    if (leftmost < corner.width) return false;
  }
  return true;
}

/**
 * The insets that keep the fitted map's land out of the bottom left corner: room on the left, which
 * moves the map right, or room at the bottom, which moves it up; whichever leaves the map larger, and
 * the least room that does. Moving costs nothing while the map has empty space on that side; beyond
 * it, the map shrinks. `base` is room already kept for something else, such as a panel over the map's
 * right edge; it is part of the answer. Only `base` when the corner is clear already, or when no room
 * would clear it.
 */
export function roomForCorner(profile: LandProfile, image: Size, artwork: Box, viewport: Size, corner: Size, base: Insets = NO_INSETS, step = 2): Insets {
  if (cornerIsClear(profile, image, artwork, viewport, corner, base)) return base;
  let best = base;
  let bestScale = 0;
  for (const side of ["left", "bottom"] as const) {
    const most = (side === "left" ? viewport.width - base.right : viewport.height - base.top) - 2 * FIT_MARGIN;
    for (let room = step; room < most; room += step) {
      const insets = { ...base, [side]: base[side] + room };
      if (!cornerIsClear(profile, image, artwork, viewport, corner, insets)) continue;
      const scale = fitScale({ viewport, artwork, insets });
      if (scale > bestScale) {
        best = insets;
        bestScale = scale;
      }
      break;
    }
  }
  return best;
}
