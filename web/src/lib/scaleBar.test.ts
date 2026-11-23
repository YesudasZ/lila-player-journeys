import { describe, expect, it } from "vitest";

import { scaleBar, scaleBarLabel } from "./scaleBar.ts";

describe("scale bar", () => {
  it.each([
    // world units per pixel, expected units: the three maps fitted to a 1440 x 742 viewport (readout.test.ts), then closer and further
    [1.183, 100],
    [0.574, 50],
    [1.239, 100],
    [0.11, 10],
    [0.071, 5],
    [0.0171, 2],
    [9.2, 1000],
    [0.004, 0.2],
  ])("at %s units per pixel the bar stands for %s units", (unitsPerPixel, units) => {
    const bar = scaleBar(unitsPerPixel, 120);
    expect(bar.units).toBeCloseTo(units, 12);
    expect(bar.pixels).toBeCloseTo(units / unitsPerPixel, 9);
  });

  it("is always 1, 2 or 5 times a power of ten, at most the given width and more than two fifths of it", () => {
    for (let exponent = -3; exponent <= 3; exponent += 0.01) {
      const bar = scaleBar(10 ** exponent, 120);
      const leading = bar.units / 10 ** Math.floor(Math.log10(bar.units) + 1e-9);
      expect([1, 2, 5]).toContain(Math.round(leading));
      expect(bar.pixels).toBeLessThanOrEqual(120 + 1e-9);
      expect(bar.pixels).toBeGreaterThan(120 * 0.4 - 1e-9);
    }
  });

  it("takes a bar that fits exactly, for each of the three leading digits", () => {
    expect(scaleBar(1000 / 120, 120).units).toBe(1000);
    expect(scaleBar(1, 100).units).toBe(100);
    expect(scaleBar(0.5, 100).units).toBe(50);
    expect(scaleBar(0.2, 100).units).toBe(20);
  });

  it("labels the bar in units, singular for one", () => {
    expect(scaleBarLabel(100)).toBe("100 units");
    expect(scaleBarLabel(1)).toBe("1 unit");
    expect(scaleBarLabel(2000)).toBe("2,000 units");
    expect(scaleBarLabel(0.5)).toBe("0.5 units");
  });
});
