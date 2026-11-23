/**
 * What the read-out shows: the world position under the pointer and the world units one pixel covers.
 * Pure functions; the map surface only writes their results into the page.
 */
import { pixelToUv, uvToWorld, type Point, type Size, type WorldFrame } from "./projection.ts";
import { scaleOf, screenToImage, type Stage, type View } from "./view.ts";

/** World x and z under a point of the viewport, or null when that point is not on the image. */
export function worldUnder(pointer: Point, view: View, stage: Stage, image: Size, frame: WorldFrame): { x: number; z: number } | null {
  const onImage = screenToImage(pointer, view, stage);
  if (onImage.x < 0 || onImage.x > image.width || onImage.y < 0 || onImage.y > image.height) return null;
  const { u, v } = pixelToUv(onImage, image);
  return uvToWorld(u, v, frame);
}

/** World units covered by one CSS pixel of the viewport, measured across the map. */
export function unitsPerPixel(view: View, stage: Stage, image: Size, frame: WorldFrame): number {
  return frame.scale / image.width / scaleOf(view, stage);
}

/** A whole number of world units with a real minus sign, as a level editor shows it. */
export function wholeUnits(value: number): string {
  const rounded = Math.round(value);
  return rounded < 0 ? `−${Math.abs(rounded)}` : `${rounded}`;
}
