import { describe, expect, it } from "vitest";

import { mapKeyAction } from "./mapKeys.ts";
import { panBy, type Stage } from "./view.ts";

const press = (key: string, held: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean } = {}) =>
  mapKeyAction({ key, ctrlKey: false, metaKey: false, altKey: false, ...held });

describe("keys on the map", () => {
  it("an arrow moves the map 64 pixels the other way", () => {
    expect(press("ArrowLeft")).toEqual({ kind: "pan", dx: 64, dy: 0 });
    expect(press("ArrowRight")).toEqual({ kind: "pan", dx: -64, dy: 0 });
    expect(press("ArrowUp")).toEqual({ kind: "pan", dx: 0, dy: 64 });
    expect(press("ArrowDown")).toEqual({ kind: "pan", dx: 0, dy: -64 });
  });

  it("so the left arrow brings in what lies to the left, and the up arrow what lies above", () => {
    const stage: Stage = { viewport: { width: 1000, height: 800 }, artwork: { left: 0, top: 0, right: 2000, bottom: 2000 } };
    const view = { x: 1000, y: 1000, zoom: 4 };
    const pan = (key: string) => {
      const action = press(key);
      if (action?.kind !== "pan") throw new Error(`${key} does not pan`);
      return panBy(view, action.dx, action.dy, stage);
    };
    expect(pan("ArrowLeft").x).toBeLessThan(view.x);
    expect(pan("ArrowRight").x).toBeGreaterThan(view.x);
    expect(pan("ArrowUp").y).toBeLessThan(view.y); // image rows count downward
    expect(pan("ArrowDown").y).toBeGreaterThan(view.y);
  });

  it("plus and minus zoom by one button step, with or without shift", () => {
    expect(press("+")).toEqual({ kind: "zoom", factor: 1.5 });
    expect(press("=")).toEqual({ kind: "zoom", factor: 1.5 });
    expect(press("-")).toEqual({ kind: "zoom", factor: 1 / 1.5 });
    expect(press("_")).toEqual({ kind: "zoom", factor: 1 / 1.5 });
  });

  it("zero fits the map to the window", () => {
    expect(press("0")).toEqual({ kind: "fit" });
  });

  it("Esc clears the focus on a journey", () => {
    expect(press("Escape")).toEqual({ kind: "clear" });
  });

  it.each(["Enter", "Tab", "a", "1", "Home"])("leaves %j to whatever has the focus", (key) => {
    expect(press(key)).toBeNull();
  });

  it.each(["ctrlKey", "metaKey", "altKey"] as const)("leaves a key held with %s to the browser", (modifier) => {
    for (const key of ["+", "-", "0", "ArrowLeft", "Escape"]) expect(press(key, { [modifier]: true })).toBeNull();
  });
});

describe("Space on the map", () => {
  it("plays and pauses the open match, and is left to the browser with Ctrl, Cmd or Alt", () => {
    expect(mapKeyAction({ key: " ", ctrlKey: false, metaKey: false, altKey: false })).toEqual({ kind: "play" });
    expect(mapKeyAction({ key: " ", ctrlKey: true, metaKey: false, altKey: false })).toBeNull();
    expect(mapKeyAction({ key: " ", ctrlKey: false, metaKey: false, altKey: true })).toBeNull();
  });
});
