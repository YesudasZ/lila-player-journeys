/**
 * The room the legend card takes in the map's bottom left corner while it is open: its offset from the
 * corner (16 px, the card's `left-4` and `bottom-4`), its size and a gap of 8 px. The fitted map keeps
 * its land out of this corner (lib/room.ts), also while the card is folded, so that folding it never
 * moves the map. The card's width is set from here; its open height is checked by the measurements.
 */
export const LEGEND_WIDTH = 200;
const LEGEND_OPEN_HEIGHT = 204; // the open card is 202 px: its title, its first line and six rows of 24 px; 2 px spare
export const LEGEND_CORNER = { width: 16 + LEGEND_WIDTH + 8, height: 16 + LEGEND_OPEN_HEIGHT + 8 };
