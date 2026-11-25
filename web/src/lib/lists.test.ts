import { describe, expect, it } from "vitest";

import { activeFilters } from "./filters.ts";
import { legendOpen, revealScrollTop, tabStopOf } from "./lists.ts";

describe("the Tab stop of a list", () => {
  it("is the chosen entry when the list holds it, else the first, and none in an empty list", () => {
    expect(tabStopOf(["a", "b", "c"], "b")).toBe("b");
    expect(tabStopOf(["a", "b", "c"], "z")).toBe("a");
    expect(tabStopOf(["a", "b", "c"], null)).toBe("a");
    expect(tabStopOf([], "a")).toBeNull();
  });
});

describe("scrolling a row into a list's view", () => {
  it("moves as little as possible: up to a row above, down to a row below, not at all for a row in view", () => {
    expect(revealScrollTop(0, 30, 50, 200)).toBe(0);
    expect(revealScrollTop(300, 30, 50, 200)).toBe(130);
    expect(revealScrollTop(100, 30, 50, 200)).toBe(50);
    expect(revealScrollTop(220, 30, 50, 200)).toBe(50); // its bottom edge is exactly at the view's bottom
  });

  it("shows the top of a row that is taller than the view", () => {
    expect(revealScrollTop(100, 300, 0, 200)).toBe(100);
  });
});

describe("the legend card and the filters' header", () => {
  it("shows the legend unless it was folded away, and always while the journeys failed to load", () => {
    expect([legendOpen(false, false), legendOpen(true, false), legendOpen(true, true), legendOpen(false, true)]).toEqual([true, false, true, true]);
  });

  it("counts the chosen days and fates together", () => {
    expect([activeFilters([], []), activeFilters(["February_10"], ["killed_by_bot", "killed"])]).toEqual([0, 3]);
  });
});
