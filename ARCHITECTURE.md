# Architecture

An offline pipeline turns the telemetry into static files; a browser app draws them. There is no server.

## Stack, and why

| Part | Choice | Why |
|---|---|---|
| Pipeline | Python: pyarrow, pandas, numpy, Pillow | pyarrow shows the raw integer behind the mistyped `ts` column. 89,104 rows build in 3 s |
| Browser data | A manifest, one JSON bundle per map, WebP minimaps | Nothing to keep alive. The largest bundle is 470 kB gzipped |
| App | Vite, React, TypeScript, Tailwind, Zustand; Canvas 2D | 61,000 rows on the largest map: too many for SVG nodes, too few to need WebGL |
| Hosting | Vercel, static, no environment variables | A merge to `main` deploys; a reviewer opens a link |

## Data flow

```
1,243 parquet files (not in git)
 → pipeline/: read (raw ts, decoded events) → check → clean (4 rules: 89,104 → 88,617 rows)
              → journeys (human or bot, fate, public ids) → project (x, z → u, v) → encode
 → web/public/data/ (committed): manifest.json · maps/<Map>.json · minimaps/<Map>.webp
 → app: fetch a map → typed arrays → draw list → canvas layers (minimap, heat, journeys, hover ring)
```

`make data` writes nothing unless every check passes: no full player id, bundle size, counts equal to the profile in `docs/profile/`. Filters, playback and heat are computed in the browser from the draw list, so they follow every filter, and every view has its own address.

## Coordinate mapping

`u = (x − origin_x) / scale`, `v = (z − origin_z) / scale`, pixel `(u × width, (1 − v) × height)`. `y` is elevation and takes no part.

| Map | scale | origin_x | origin_z |
|---|---|---|---|
| Ambrose Valley | 900 | −370 | −473 |
| Grand Rift | 581 | −290 | −290 |
| Lockdown | 1000 | −500 | −500 |

- **UV storage.** The pipeline stores u and v, never pixels, as integers on 65,535 steps (finer than 0.02 world units). So the image size is free: the README says 1024², the files are 4320², 2160×2158 and 9000², and the app draws 2048-pixel WebPs.
- **Y flip.** Image rows count downward and z counts upward, hence `1 − v`.
- **One function per language** (`pipeline/maps.py`, `web/src/lib/projection.ts`). The constants live only in the pipeline and reach the app through the manifest. The app's function is tested against points the pipeline writes, and both against the README's worked example.
- **Proof.** Every row lands inside its image. Of the eight possible axis orientations only this one keeps players on the map: at most 0.40% of samples fall off it, against at least 2.7% for any other. Zoomed in, trails follow roads and cross a bridge (`docs/img/overlay_*.jpg`, `orientation_*.jpg`). Scale and origin are right to about 1 to 2% of a map's width.

## Assumptions

| The README says | The data shows | Decision |
|---|---|---|
| `ts` is milliseconds within the match | Unix seconds: dates in February 2026 | Read the raw integer as seconds |
| A UUID is a human, a numeric id a bot | 17 numeric-id files hold human events | Human or bot by movement event; these are "no account id" (A1) |
| Kill and Killed are player against player | Every event is written from its file owner's side; each Kill mirrors a Killed of the same file | A kill lies where the killer stood; the 3 mirrored rows are dropped (A4) |
| Players must extract | No extraction or match-end event | "No death recorded", never "survived" (A3) |
| Position is sampled periodically | Every 5 s, and not while standing still | Counts mean movement, not time; playback waits, then moves in the last 5 s (A6) |
| Nothing | A journey stored twice, three files written twice, rows after a death | Four cleaning rules remove 487 rows, each tested; repeated Loot and BotKill rows stay (A2) |
| Five day folders | UTC days of writing; 5 matches start the evening before | A match belongs to its folder's day (A10) |

All ten, with evidence: `docs/DATA_NOTES.md`.

## Trade-offs

| Decision | Instead of | Why | Cost |
|---|---|---|---|
| Offline pipeline, static files | Parquet in the browser, or an API | Fast first load, no backend, every number checked before it ships | New data needs a rebuild and a deploy |
| Canvas 2D, written by hand | deck.gl, or SVG | Enough for this data; no heavy dependency | Hit-testing and zoom are our code |
| One bundle per map | One file per match | 93% of matches hold one journey | Opening one match loads its map |
| Heat binned in the browser | Precomputed grids | It follows every filter | About 2 ms of work per change |
| No layer for ignored areas | Marking cells no path crosses | It needs a mask of walkable ground | Read from the Traffic layer |
| No list of a journey's events | Text in the sidebar | Tooltips cover it | One event's details need a pointer |
| Desktop only | Touch and pinch zoom | Level Designers work at a desk | A notice below 900 px |
| A history entry per choice | One per change, or none | Back undoes a choice, not a drag | A double-click that changes the focus leaves one entry |
