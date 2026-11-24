/**
 * The heat layer: the grid of the heat that is on, painted into a small image with one pixel per
 * cell and drawn scaled into the map's rectangle, where the browser's smoothing blends the cells.
 * Under it the minimap is dimmed, so that the colour reads clearly. What is counted and how strong
 * a cell is comes from web/src/lib/heat.ts; this file only paints.
 */
import { HEAT_TOKENS, rgbOf, strength, type Heat } from "../../lib/heat.ts";
import { imageRect } from "../../lib/view.ts";
import { selectHeat } from "../../state/shown.ts";
import { useAppStore } from "../../state/store.ts";
import type { Layer } from "../mapSurface.ts";

const FULL = 0.85; // the opacity of the fullest cell
const DIMMED = 0.4; // how much of the background lies over the minimap while a heat layer is on

interface HeatLayer {
  layer: Layer;
  /** Call `redraw` whenever the heat has to be drawn again. Returns what stops the watching. */
  watch: (redraw: (layer: Layer) => void) => () => void;
}

export function createHeatLayer(canvas: HTMLCanvasElement): HeatLayer {
  const style = getComputedStyle(canvas);
  const background = style.getPropertyValue("--color-bg").trim();
  const image = document.createElement("canvas");
  let painted: Heat | null = null;

  /** The grid as an image: every cell a pixel in the colour of its kind, as strong as the cell is full. */
  function paint(heat: Heat) {
    image.width = heat.cells;
    image.height = heat.cells;
    const pen = image.getContext("2d");
    if (!pen) throw new Error("this browser cannot draw on a canvas");
    const [red, green, blue] = rgbOf(style.getPropertyValue(HEAT_TOKENS[heat.kind]));
    const pixels = pen.createImageData(heat.cells, heat.cells);
    for (let cell = 0; cell < heat.smooth.length; cell += 1) {
      pixels.data[cell * 4] = red;
      pixels.data[cell * 4 + 1] = green;
      pixels.data[cell * 4 + 2] = blue;
      pixels.data[cell * 4 + 3] = Math.round(strength(heat.smooth[cell], heat.top) * FULL * 255);
    }
    pen.putImageData(pixels, 0, 0);
    painted = heat;
  }

  const layer: Layer = {
    canvas,
    draw(context, { view, stage, image: size }) {
      const heat = selectHeat(useAppStore.getState());
      if (!heat) return;
      const rect = imageRect(view, stage, size);
      context.globalAlpha = DIMMED;
      context.fillStyle = background;
      context.fillRect(rect.x, rect.y, rect.width, rect.height);
      context.globalAlpha = 1;
      if (heat.total === 0) return;
      if (painted !== heat) paint(heat);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image, rect.x, rect.y, rect.width, rect.height);
    },
  };

  function watch(redraw: (layer: Layer) => void): () => void {
    let before = selectHeat(useAppStore.getState());
    return useAppStore.subscribe((state) => {
      const now = selectHeat(state);
      if (now === before) return;
      before = now;
      redraw(layer);
    });
  }

  return { layer, watch };
}
