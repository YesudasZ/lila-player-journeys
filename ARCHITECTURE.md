# Architecture

> Draft. The data pipeline exists and is tested. The browser app is built in the next phases; what this page says about it are decisions, not finished code.

## What it is built with, and why

| Part | Choice | Why |
|---|---|---|
| Data pipeline | Python, pyarrow, pandas, Pillow; runs offline | pyarrow exposes the raw integer behind the mistyped `ts` column. The dataset is small (89,104 rows): a full build takes 3 seconds |
| What the browser loads | Static files: a manifest, one JSON bundle per map, WebP minimaps | No server and no database to keep alive. The largest bundle is 463 kB gzipped |
| App | Vite, React, TypeScript, Tailwind, Zustand; drawn on Canvas 2D | The largest map has about 61,000 rows: within reach of a plain canvas, too many for SVG nodes, too few to need WebGL |
| Hosting | Vercel, static | A push deploys; a reviewer opens a link |

## From parquet to pixels

```
player_data/February_*/<user>_<match>.nakama-0     1,243 Parquet files, not in git
  │ pipeline/dataset.py      read; keep the raw ts integer; decode the event bytes
  │ pipeline/build_data.py   check: stop on anything the pipeline was not built for
  │ pipeline/clean.py        four rules, 89,104 → 88,617 rows
  │ pipeline/journeys.py     human or bot, death, public ids, counts per match
  │ pipeline/maps.py         world (x, z) → (u, v)
  ▼
web/public/data/   manifest.json · maps/<Map>.json · minimaps/<Map>.webp     committed
  ▼
browser            manifest → one map bundle → typed arrays → canvas layers
```

`make data` rebuilds these files and fails if its counts differ from the measured profile in `docs/profile/`.

## Mapping game coordinates to the minimap

1. The dataset README gives every map a `scale` and an origin: `u = (x - origin_x) / scale`, `v = (z - origin_z) / scale`. The `y` column is elevation and takes no part.
2. u and v are fractions of the image, so they do not depend on its size. That matters: the README says 1024×1024, the files are 4320², 2160×2158 and 9000². The pipeline stores u and v, never pixels.
3. The app multiplies by the size of the image it actually draws: `px = u × width`, `py = (1 − v) × height`. The flip is there because image rows count downward and z counts upward.
4. One function per language holds this. The constants exist only in `pipeline/maps.py` and reach the app through the manifest.

**How we know it is right.** All 89,104 rows land inside the image. Of the eight possible axis orientations only the README's keeps players on the map: 0.00%, 0.40% and 0.00% of samples fall off it on the three maps, against at least 2.7% for any other. Two independent AI reviewers, shown the eight overlays unlabeled, picked it every time. Zoomed in, trails follow roads and cross a bridge (`docs/img/`).

**How exact it is.** The orientation is certain. Scale and origin are right to about 1 to 2% of the map width; a fit suggests a slightly smaller x scale on two maps. We kept the documented constants.

## Where the data was ambiguous

| The data | What we did |
|---|---|
| `ts` is typed as milliseconds and described as match-relative | Read as Unix seconds: the values are dates in February 2026, and position samples are 5 apart |
| 17 files carry a bot-style numeric id but human events | Human or bot is decided per journey, by its movement event. These 17 are shown as humans without an account id |
| A journey stored twice, three files written twice, 3 Kill rows that mirror a death, positions logged after death | Four cleaning rules; 487 rows removed, each counted and tested |
| 1,227 rows that repeat another row of the same file, all Loot or BotKill | Kept: they cannot be told apart from real repeats |
| No extraction event | A journey with no death row is "no death recorded" |
| Position is not sampled while a player stands still | Sample counts are labelled as movement, not time spent |

The full list, with the evidence for each, is in `docs/DATA_NOTES.md`.

## Trade-offs

| Decision | Instead of | Why | Cost |
|---|---|---|---|
| Preprocess offline into static files | Parsing parquet in the browser, or an API | Fast first load, no backend, every number checked before it ships | New data needs a rebuild and a deploy |
| One bundle per map | One file per match | 93% of matches are a single journey; the all-matches view would need hundreds of requests | Opening one match loads its whole map |
| Heatmaps binned in the browser | Precomputed grids | They follow every filter | Binning work on each change |
| Canvas 2D | SVG, or WebGL with deck.gl | Enough for this much data, no heavy dependency | Hit-testing and zoom are written by hand |
| The README's map constants | A fitted calibration | They are the studio's own transform | A point can sit up to about 10 world units off near one edge of a map |
| Generated data committed to git | Building it on the host | The host has no raw data | 2.8 MB in the repo |
