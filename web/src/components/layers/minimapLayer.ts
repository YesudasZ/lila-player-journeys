import { imageRect } from "../../lib/view.ts";
import type { Layer } from "../mapSurface.ts";

/** The bottom layer: the minimap on the app's background. */
export function createMinimapLayer(canvas: HTMLCanvasElement, image: HTMLImageElement): Layer {
  const background = getComputedStyle(canvas).getPropertyValue("--color-bg").trim();
  return {
    canvas,
    draw(context, { view, stage, image: size }) {
      context.fillStyle = background;
      context.fillRect(0, 0, stage.viewport.width, stage.viewport.height);
      // "lighten" keeps the brighter of image and background, so the image's pure black surround becomes the background
      context.globalCompositeOperation = "lighten";
      context.imageSmoothingQuality = "high";
      const rect = imageRect(view, stage, size);
      context.drawImage(image, rect.x, rect.y, rect.width, rect.height);
    },
  };
}
