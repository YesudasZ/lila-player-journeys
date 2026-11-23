# LILA BLACK Player Journeys

[![CI](https://github.com/YesudasZ/lila-player-journeys/actions/workflows/ci.yml/badge.svg)](https://github.com/YesudasZ/lila-player-journeys/actions/workflows/ci.yml)

A browser tool for Level Designers to see how players move, fight, loot and die on LILA BLACK's three maps. Built for the LILA Games Product Engineer written test.

> **Work in progress.** The raw telemetry has been measured, cleaned and built into the files the app will load, and the coordinate mapping is proven. The app itself is not built yet.

| Read this | To learn |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | what it is built with, how data gets from parquet to pixels, the coordinate mapping, trade-offs (draft) |
| [docs/BRIEF.md](docs/BRIEF.md) | what the assignment asks for, as a checklist |
| [docs/DATA_NOTES.md](docs/DATA_NOTES.md) | what the data really contains, where the dataset README is wrong, and what the pipeline does about it |
| [docs/profile/profile_report.md](docs/profile/profile_report.md) | every measurement, with the exact definition used |
| [docs/profile/crosscheck.md](docs/profile/crosscheck.md) | how those measurements and decisions were checked independently |
| [docs/img/](docs/img/) | proof that world coordinates land on the right minimap pixels |
| [docs/PLAN.md](docs/PLAN.md) | the build plan, phase by phase |

## Data pipeline

Needs Python 3.12 or newer. The unit tests need nothing else:

```bash
make setup    # virtual environment with pinned dependencies
make test     # 78 tests on synthetic data
```

Everything below reads the assignment's `player_data.zip`, which is not in this repo:

```bash
unzip player_data.zip -d data/raw   # creates data/raw/player_data/
make data       # rebuild web/public/data/ (the files the app loads) and check the counts
make profile    # re-measure the raw data -> docs/profile/
make overlay    # redraw the mapping proof images -> docs/img/
```

`web/public/data/` is generated and committed, so the app runs without the zip.

Environment variables: none.

Built with Claude Code.
