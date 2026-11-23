# LILA BLACK Player Journeys

**Live tool:** https://lila-player-journeys-psi.vercel.app

[![CI](https://github.com/YesudasZ/lila-player-journeys/actions/workflows/ci.yml/badge.svg)](https://github.com/YesudasZ/lila-player-journeys/actions/workflows/ci.yml)

A browser tool for Level Designers to see how players move, fight, loot and die on LILA BLACK's three maps. Built for the LILA Games Product Engineer written test.

> **Work in progress.** The raw telemetry has been measured, cleaned and built into the files the app loads. The app shows the three maps with pan and zoom, world coordinates under the cursor and a scale bar. Journeys, markers, filters, playback and heatmaps come next. The live tool shows what has been reviewed and merged so far.

| Read this | To learn |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | what it is built with, how data gets from parquet to pixels, the coordinate mapping, trade-offs (draft) |
| [docs/BRIEF.md](docs/BRIEF.md) | what the assignment asks for, as a checklist |
| [docs/DATA_NOTES.md](docs/DATA_NOTES.md) | what the data really contains, where the dataset README is wrong, and what the pipeline does about it |
| [docs/DATA_FORMAT.md](docs/DATA_FORMAT.md) | the files the app loads, field by field |
| [docs/profile/profile_report.md](docs/profile/profile_report.md) | every measurement, with the exact definition used |
| [docs/profile/crosscheck.md](docs/profile/crosscheck.md) | how those measurements and decisions were checked independently |
| [docs/img/](docs/img/) | proof that world coordinates land on the right minimap pixels |
| [docs/PLAN.md](docs/PLAN.md) | the build plan, phase by phase |

## The app

Needs Node 22.12 or newer. It runs from the data files committed in `web/public/data/`: no zip and no environment variables are needed.

```bash
cd web
npm ci          # install the pinned packages
npm run dev     # http://localhost:5173
npm run check   # type check, ESLint and unit tests
npm run build   # production build into web/dist/
```

Vite, React, TypeScript (strict), Tailwind CSS v4 and Zustand, drawing on an HTML canvas. Pure logic lives in `web/src/lib/` with its tests beside it.

## Data pipeline

Needs Python 3.12 or newer. The tests need nothing else:

```bash
make test     # creates .venv on first use, then runs the tests: synthetic files, and the committed data
```

`pipeline/requirements.txt` pins the five packages the pipeline uses directly.

Everything below reads the assignment's `player_data.zip`, which is not in this repo:

```bash
unzip player_data.zip -d data/raw   # creates data/raw/player_data/
make data       # rebuild web/public/data/ (the files the app loads); writes nothing unless every check passes
make profile    # re-measure the raw data -> docs/profile/
make overlay    # redraw the mapping proof images -> docs/img/
```

`web/public/data/` is generated and committed, so the app runs without the zip.

Environment variables: none.

Built with Claude Code.
