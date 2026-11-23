import { describe, expect, it } from "vitest";

import {
  CLOSEST_SCALE,
  FIT_MARGIN,
  clampView,
  closestZoom,
  fitScale,
  fitView,
  imageRect,
  imageToScreen,
  panBy,
  scaleOf,
  screenToImage,
  wheelZoomFactor,
  zoomAt,
  zoomLimits,
  type Box,
  type Stage,
} from "./view.ts";

// Grand Rift as shipped: a 2048 x 2046 image whose artwork is off-centre (fractions from the manifest).
const IMAGE = { width: 2048, height: 2046 };
const ARTWORK: Box = { left: 0.0767 * 2048, top: 0.1911 * 2046, right: 0.9556 * 2048, bottom: 0.8773 * 2046 };
const VIEWPORTS = {
  wide: { width: 1440, height: 742 },
  tall: { width: 600, height: 900 },
  square: { width: 800, height: 800 },
};
const stageOf = (viewport: { width: number; height: number }): Stage => ({ viewport, artwork: ARTWORK });
const WIDE = stageOf(VIEWPORTS.wide);

/** The artwork box as it lies in the viewport. */
function artworkOnScreen(view: ReturnType<typeof fitView>, stage: Stage) {
  const topLeft = imageToScreen({ x: ARTWORK.left, y: ARTWORK.top }, view, stage);
  const bottomRight = imageToScreen({ x: ARTWORK.right, y: ARTWORK.bottom }, view, stage);
  return { left: topLeft.x, top: topLeft.y, right: bottomRight.x, bottom: bottomRight.y };
}

describe("fit", () => {
  it.each(Object.entries(VIEWPORTS))("centres the artwork in a %s viewport with the margin free", (_, viewport) => {
    const stage = stageOf(viewport);
    const box = artworkOnScreen(fitView(ARTWORK), stage);
    expect((box.left + box.right) / 2).toBeCloseTo(viewport.width / 2, 9);
    expect((box.top + box.bottom) / 2).toBeCloseTo(viewport.height / 2, 9);
    const free = [box.left, box.top, viewport.width - box.right, viewport.height - box.bottom];
    expect(Math.min(...free)).toBeCloseTo(FIT_MARGIN, 9);
    expect(free.every((space) => space >= FIT_MARGIN - 1e-9)).toBe(true);
  });

  it.each(Object.entries(VIEWPORTS))("draws the image at the aspect ratio of the manifest in a %s viewport", (_, viewport) => {
    const rect = imageRect(fitView(ARTWORK), stageOf(viewport), IMAGE);
    expect(rect.width / rect.height).toBeCloseTo(2048 / 2046, 12);
  });

  it("draws the image where the view puts its corners", () => {
    const view = { x: 900, y: 1100, zoom: 3.2 };
    const scale = scaleOf(view, WIDE);
    const rect = imageRect(view, WIDE, IMAGE);
    // by hand: the view's point is in the middle of the 1440 x 742 viewport, the image's corner 900 and 1100 image pixels before it
    expect(rect.x).toBeCloseTo(720 - 900 * scale, 9);
    expect(rect.y).toBeCloseTo(371 - 1100 * scale, 9);
    const bottomRight = imageToScreen({ x: IMAGE.width, y: IMAGE.height }, view, WIDE);
    expect(rect.x + rect.width).toBeCloseTo(bottomRight.x, 9);
    expect(rect.y + rect.height).toBeCloseTo(bottomRight.y, 9);
  });

  it("is limited by the height in a wide viewport and by the width in a tall one", () => {
    expect(fitScale(WIDE)).toBeCloseTo((742 - 48) / ((0.8773 - 0.1911) * 2046), 12);
    expect(fitScale(stageOf(VIEWPORTS.tall))).toBeCloseTo((600 - 48) / ((0.9556 - 0.0767) * 2048), 12);
  });

  it("keeps a positive scale in a viewport smaller than its margins", () => {
    expect(fitScale(stageOf({ width: 10, height: 10 }))).toBeGreaterThan(0);
  });
});

describe("screen and image", () => {
  const view = { x: 900, y: 1100, zoom: 3.2 };

  it("are inverses of each other", () => {
    for (const point of [{ x: 0, y: 0 }, { x: 733.5, y: 12.25 }, { x: 1440, y: 742 }]) {
      const back = imageToScreen(screenToImage(point, view, WIDE), view, WIDE);
      expect(back.x).toBeCloseTo(point.x, 9);
      expect(back.y).toBeCloseTo(point.y, 9);
    }
  });

  it("put the view's own point at the centre of the viewport", () => {
    expect(imageToScreen({ x: 900, y: 1100 }, view, WIDE)).toEqual({ x: 720, y: 371 });
    expect(screenToImage({ x: 720, y: 371 }, view, WIDE)).toEqual({ x: 900, y: 1100 });
  });

  it("show the same framing after a resize: the same point in the middle, the same share of the artwork", () => {
    const larger = stageOf({ width: 2880, height: 1484 });
    expect(imageToScreen({ x: 900, y: 1100 }, view, larger)).toEqual({ x: 1440, y: 742 });
    expect(scaleOf(view, larger) / fitScale(larger)).toBeCloseTo(scaleOf(view, WIDE) / fitScale(WIDE), 12);
  });
});

describe("zoom at a point", () => {
  const view = { x: 1000, y: 1000, zoom: 3 };

  it.each([1.3, 0.8])("keeps the image point under the cursor where it is, for a factor of %s", (factor) => {
    const cursor = { x: 1010, y: 240 };
    const under = screenToImage(cursor, view, WIDE);
    const zoomed = zoomAt(view, factor, cursor, WIDE);
    expect(zoomed.zoom).toBeCloseTo(3 * factor, 12);
    const after = imageToScreen(under, zoomed, WIDE);
    expect(after.x).toBeCloseTo(cursor.x, 9);
    expect(after.y).toBeCloseTo(cursor.y, 9);
  });

  it("stops at the closest zoom, which is four screen pixels per image pixel", () => {
    const zoomed = zoomAt(view, 1000, { x: 720, y: 371 }, WIDE);
    expect(zoomed.zoom).toBe(closestZoom(WIDE));
    expect(CLOSEST_SCALE).toBe(4);
    expect(scaleOf(zoomed, WIDE)).toBeCloseTo(4, 12);
  });

  it("does not move the map when the wheel keeps turning at the closest zoom, wherever the cursor is", () => {
    const closest = { x: 1000, y: 1000, zoom: closestZoom(WIDE) };
    const again = zoomAt(closest, 2, { x: 1300, y: 150 }, WIDE);
    expect(again.zoom).toBe(closest.zoom);
    expect(again.x).toBeCloseTo(closest.x, 9);
    expect(again.y).toBeCloseTo(closest.y, 9);
  });

  it("keeps the point under the cursor even at the edge of the artwork, where the map is narrower than the viewport", () => {
    const cursor = imageToScreen({ x: ARTWORK.left + 20, y: 1000 }, fitView(ARTWORK), WIDE);
    const zoomed = zoomAt(fitView(ARTWORK), 2, cursor, WIDE);
    const after = imageToScreen({ x: ARTWORK.left + 20, y: 1000 }, zoomed, WIDE);
    expect(after.x).toBeCloseTo(cursor.x, 9);
    expect(after.y).toBeCloseTo(cursor.y, 9);
  });

  it("stops at fit when zooming out, and is then exactly the fit view wherever the cursor was", () => {
    expect(zoomAt(view, 0.001, { x: 30, y: 700 }, WIDE)).toEqual(fitView(ARTWORK));
  });

  it("has no closer zoom than fit when the fitted artwork is already drawn at the closest scale", () => {
    const tiny: Stage = { viewport: { width: 2000, height: 2000 }, artwork: { left: 0, top: 0, right: 100, bottom: 100 } };
    expect(closestZoom(tiny)).toBe(1);
  });
});

describe("pan and clamp", () => {
  const view = { x: 1000, y: 1000, zoom: 4 };

  it("moves the map with the drag", () => {
    const scale = scaleOf(view, WIDE);
    const panned = panBy(view, 50, -20, WIDE);
    expect(panned.x).toBeCloseTo(1000 - 50 / scale, 9);
    expect(panned.y).toBeCloseTo(1000 + 20 / scale, 9);
    expect(panned.zoom).toBe(4);
  });

  it.each([
    [1e6, 1e6],
    [-1e6, -1e6],
    [1e6, -1e6],
  ])("stops a drag by %s, %s where the zoom has no more artwork to bring in", (dx, dy) => {
    const panned = panBy(view, dx, dy, WIDE);
    const middle = fitView(ARTWORK);
    const reach = { x: ((ARTWORK.right - ARTWORK.left) / 2) * (1 - 1 / 4), y: ((ARTWORK.bottom - ARTWORK.top) / 2) * (1 - 1 / 4) };
    expect(panned.x).toBeCloseTo(middle.x - Math.sign(dx) * reach.x, 9);
    expect(panned.y).toBeCloseTo(middle.y - Math.sign(dy) * reach.y, 9);
  });

  it("never shows more empty space on a side than the fitted map does, at any zoom", () => {
    const fitted = artworkOnScreen(fitView(ARTWORK), WIDE);
    expect(fitted.top).toBeCloseTo(FIT_MARGIN, 9); // the height limits the fit of a wide viewport
    for (const zoom of [1.5, 4, closestZoom(WIDE)]) {
      const downRight = artworkOnScreen(panBy({ x: 1000, y: 1000, zoom }, 1e6, 1e6, WIDE), WIDE);
      expect(downRight.top).toBeCloseTo(fitted.top, 9);
      expect(downRight.left).toBeCloseTo(fitted.left, 9);
      const upLeft = artworkOnScreen(panBy({ x: 1000, y: 1000, zoom }, -1e6, -1e6, WIDE), WIDE);
      expect(upLeft.bottom).toBeCloseTo(fitted.bottom, 9);
      expect(upLeft.right).toBeCloseTo(fitted.right, 9);
    }
  });

  it("keeps the centre of the viewport inside the artwork box", () => {
    for (const [dx, dy] of [[1e6, 0], [-1e6, 0], [0, 1e6], [0, -1e6]] as const) {
      const { x, y } = panBy(view, dx, dy, WIDE);
      expect(x).toBeGreaterThanOrEqual(ARTWORK.left);
      expect(x).toBeLessThanOrEqual(ARTWORK.right);
      expect(y).toBeGreaterThanOrEqual(ARTWORK.top);
      expect(y).toBeLessThanOrEqual(ARTWORK.bottom);
    }
  });

  it("does not pan a fitted map: there is nothing outside the viewport to bring in", () => {
    expect(panBy(fitView(ARTWORK), 300, 200, WIDE)).toEqual(fitView(ARTWORK));
  });

  it("brings a view from a link back inside the limits", () => {
    expect(clampView({ x: -5000, y: 99999, zoom: 0.2 }, WIDE)).toEqual(fitView(ARTWORK));
    expect(clampView({ x: 1000, y: 1000, zoom: 500 }, WIDE).zoom).toBe(closestZoom(WIDE));
  });

  it.each([
    { x: Number.NaN, y: 1000, zoom: 2 },
    { x: 1000, y: Number.NaN, zoom: 2 },
    { x: 1000, y: 1000, zoom: Number.NaN },
    { x: Number.POSITIVE_INFINITY, y: 1000, zoom: 2 },
  ])("shows the fitted map for a view that is not made of numbers: %o", (broken) => {
    expect(clampView(broken, WIDE)).toEqual(fitView(ARTWORK));
  });

  it("lets the centre move a quarter of the artwork's length either way at zoom 2", () => {
    const length = ARTWORK.right - ARTWORK.left;
    const middle = (ARTWORK.left + ARTWORK.right) / 2;
    expect(clampView({ x: -1e6, y: 1000, zoom: 2 }, WIDE).x).toBeCloseTo(middle - length / 4, 9);
    expect(clampView({ x: 1e6, y: 1000, zoom: 2 }, WIDE).x).toBeCloseTo(middle + length / 4, 9);
    expect(clampView({ x: middle + 10, y: 1000, zoom: 2 }, WIDE).x).toBe(middle + 10);
  });
});

describe("zoom limits", () => {
  it("are reached at fit and at the closest zoom, and nowhere between", () => {
    expect(zoomLimits(fitView(ARTWORK), WIDE)).toEqual({ atFit: true, atClosest: false });
    expect(zoomLimits({ x: 1000, y: 1000, zoom: 3 }, WIDE)).toEqual({ atFit: false, atClosest: false });
    expect(zoomLimits({ x: 1000, y: 1000, zoom: closestZoom(WIDE) }, WIDE)).toEqual({ atFit: false, atClosest: true });
  });

  it("are both reached when the fitted artwork is already drawn at the closest scale", () => {
    const artwork = { left: 0, top: 0, right: 100, bottom: 100 };
    expect(zoomLimits(fitView(artwork), { viewport: { width: 2000, height: 2000 }, artwork })).toEqual({ atFit: true, atClosest: true });
  });
});

describe("wheel", () => {
  it("zooms in when scrolling up and out by the same factor when scrolling down", () => {
    expect(wheelZoomFactor(-100, 0, false)).toBeCloseTo(Math.exp(0.15), 12);
    expect(wheelZoomFactor(100, 0, false) * wheelZoomFactor(-100, 0, false)).toBeCloseTo(1, 12);
  });

  it("reads a delta in lines or pages as pixels", () => {
    expect(wheelZoomFactor(3, 1, false)).toBeCloseTo(wheelZoomFactor(48, 0, false), 12);
    expect(wheelZoomFactor(1, 2, false)).toBeCloseTo(wheelZoomFactor(400, 0, false), 12);
  });

  it("follows a trackpad pinch faster than a scroll of the same delta", () => {
    expect(wheelZoomFactor(-10, 0, true)).toBeCloseTo(Math.exp(0.1), 12);
    expect(wheelZoomFactor(-10, 0, true)).toBeGreaterThan(wheelZoomFactor(-10, 0, false));
  });

  it("never zooms by more than a factor of two in one event", () => {
    expect(wheelZoomFactor(-1e6, 0, false)).toBe(2);
    expect(wheelZoomFactor(1e6, 0, true)).toBe(0.5);
  });
});
