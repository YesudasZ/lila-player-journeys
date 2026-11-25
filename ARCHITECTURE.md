# Architecture

## Stack and why

- **Python pipeline:** pyarrow exposes the raw integer behind the mistyped `ts` column; every check runs before anything ships.
- **React, TypeScript, Canvas 2D:** 61,000 rows on the largest map are too many for SVG and too few to need WebGL; playback runs outside React at 60 fps.
- **Static hosting on Vercel:** nothing to keep alive, and a merge to `main` deploys.

## Data flow

```
1,243 parquet files → pipeline: read, check, clean, journeys, project, encode
                    → static files: manifest, one JSON bundle per map, WebP minimaps
                    → browser: draw list → heat grids → canvas layers
```

Filters, playback and heat are computed in the browser from each map's bundle, so they follow every filter.

## Coordinate mapping

`u = (x − origin_x) / scale`, `v = (z − origin_z) / scale`, pixel `(u × width, (1 − v) × height)`

| Map | scale | origin_x | origin_z |
|---|---|---|---|
| Ambrose Valley | 900 | −370 | −473 |
| Grand Rift | 581 | −290 | −290 |
| Lockdown | 1000 | −500 | −500 |

- **UV storage.** u and v are stored as integers on 65,535 steps, not pixels, so any image size works: the sources are 4320², 2160 × 2158 and 9000²; the app draws 2048 px WebPs.
- **Y flip.** Image rows count down and z counts up, hence `1 − v`. `y` is elevation and takes no part.
- **Proof:** [overlays](docs/img/overlay_AmbroseValley.jpg) and [orientation check](docs/img/orientation_AmbroseValley.jpg) per map; tests: [test_maps.py](pipeline/tests/test_maps.py), [projection.test.ts](web/src/lib/projection.test.ts).

## Assumptions

| README says | The data shows | Decision |
|---|---|---|
| `ts` is milliseconds within the match | Unix seconds, in February 2026 | Read the raw integer as seconds |
| `event` is bytes | Eight values, all valid UTF-8 | Decode once, in the loader |
| A UUID is a human, a numeric id a bot | 17 numeric-id files hold human movement | Human or bot by movement event |
| Scale and origin for x, z | Orientation confirmed; within 1–2% | Use them unchanged |
| Five day folders | UTC days of writing; 5 matches start before midnight | The folder's day |

Full list: [docs/DATA_NOTES.md](docs/DATA_NOTES.md).

## Trade-offs

| Decision | Instead of | Why | Cost |
|---|---|---|---|
| Offline pipeline, static files | Parquet in the browser, or an API | Fast load, no backend | New data needs a rebuild |
| Canvas 2D, written by hand | deck.gl, or SVG | Enough here; no heavy dependency | Hit-testing and zoom are our code |
| One bundle per map | One file per match | 93% of matches hold one journey | Opening a match loads its map |
| Heat binned in the browser | Precomputed grids | It follows every filter | About 2 ms per change |
| Desktop only | Touch and pinch zoom | Level Designers work at a desk | A notice below 900 px |

More: [docs/TRADEOFFS.md](docs/TRADEOFFS.md).
