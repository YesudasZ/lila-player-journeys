/** The ids that tie each map tab to the panel it opens, for assistive technology. */
export const MAP_PANEL_ID = "map-panel";

export const tabId = (mapId: string): string => `map-tab-${mapId}`;

/** The id of the map itself, the element that is panned and zoomed. Only one map is on the page at a time. */
export const MAP_SURFACE_ID = "map-surface";
