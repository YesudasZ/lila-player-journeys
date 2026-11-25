# More trade-offs

The five decisions that shaped the tool most are in [ARCHITECTURE.md](../ARCHITECTURE.md#trade-offs). These are the others.

| Decision | Instead of | Why | Cost |
|---|---|---|---|
| No layer for ignored areas | Marking cells no path crosses | It needs a mask of walkable ground | Read from the Traffic layer |
| No list of a journey's events | Text in the journeys panel | Tooltips cover it | One event's details need a pointer |
| A history entry per choice | One per change, or none | Back undoes a choice, not a drag | A double-click that changes the focus leaves one entry |
| At Fit, the map leaves room for the legend card, read from each minimap's land | A card over the map, or a fixed gutter for the artwork's box | No land lies under the card on any map; the box's corners are mostly sea | With a match open the fitted map is 82–92% of its size at 1280 px, 90–99% at 1440 px |
