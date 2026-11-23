/**
 * The only projection code in the app: stored positions to pixels and to world units, and back.
 *
 * The data files hold u and v, fractions of the minimap: u grows to the right, v grows upward
 * (docs/DATA_FORMAT.md). They are stored as integer codes. A map's scale and origin come from the
 * manifest; nothing here knows a map by name.
 */

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** The part of a manifest map entry that ties u and v to world units. */
export interface WorldFrame {
  /** World units spanned by the full image, in both directions. */
  scale: number;
  /** World x at the left edge of the image. */
  origin_x: number;
  /** World z at the bottom edge of the image. */
  origin_z: number;
}

/** A stored u or v code as a fraction of the image. `steps` is the manifest's `encoding.uv_steps`. */
export function codeToUnit(code: number, steps: number): number {
  return code / steps;
}

/** u and v as a pixel of an image of any size. Image rows count downward and v counts upward, hence the flip. */
export function uvToPixel(u: number, v: number, image: Size): Point {
  return { x: u * image.width, y: (1 - v) * image.height };
}

/** The inverse of `uvToPixel`. */
export function pixelToUv(pixel: Point, image: Size): { u: number; v: number } {
  return { u: pixel.x / image.width, v: 1 - pixel.y / image.height };
}

/** u and v as world x and z on a map. */
export function uvToWorld(u: number, v: number, map: WorldFrame): { x: number; z: number } {
  return { x: u * map.scale + map.origin_x, z: v * map.scale + map.origin_z };
}

/** The inverse of `uvToWorld`. */
export function worldToUv(x: number, z: number, map: WorldFrame): { u: number; v: number } {
  return { u: (x - map.origin_x) / map.scale, v: (z - map.origin_z) / map.scale };
}
