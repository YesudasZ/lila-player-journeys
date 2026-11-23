/** The scale bar: a round number of world units and how long that is on screen. */

export interface ScaleBar {
  units: number;
  pixels: number;
}

/**
 * The longest bar of 1, 2 or 5 times a power of ten world units that is at most `maxPixels` long.
 * `unitsPerPixel` is how many world units one CSS pixel covers at the current zoom.
 */
export function scaleBar(unitsPerPixel: number, maxPixels: number): ScaleBar {
  const most = unitsPerPixel * maxPixels;
  let power = 10 ** Math.floor(Math.log10(most));
  if (power * 10 <= most) power *= 10; // log10 can land just under a whole number
  const step = [5, 2, 1].find((candidate) => candidate * power <= most) ?? 1;
  const units = step * power;
  return { units, pixels: units / unitsPerPixel };
}

/** The bar's label: "100 units", "1 unit", "0.5 units". */
export function scaleBarLabel(units: number): string {
  const amount = units.toLocaleString("en-US", { maximumFractionDigits: 6 });
  return `${amount} ${units === 1 ? "unit" : "units"}`;
}
