# LILA BLACK Player Journeys

A browser tool for Level Designers to see how players move, fight, loot and die on LILA BLACK's three maps. Built for the LILA Games Product Engineer written test.

> **Work in progress.** Phase 1 (data discovery) is done: the raw telemetry has been measured and the coordinate mapping proven. The app is not built yet.

| Read this | To learn |
|---|---|
| [docs/BRIEF.md](docs/BRIEF.md) | what the assignment asks for, as a checklist |
| [docs/DATA_NOTES.md](docs/DATA_NOTES.md) | what the data really contains, where the dataset README is wrong, and what the pipeline does about it |
| [docs/profile/profile_report.md](docs/profile/profile_report.md) | every measurement, with the exact definition used |
| [docs/img/](docs/img/) | proof that world coordinates land on the right minimap pixels |
| [docs/PLAN.md](docs/PLAN.md) | the build plan, phase by phase |

## Reproduce the measurements

Needs Python 3.12 or newer and the assignment's `player_data.zip`, which is not in this repo.

```bash
unzip player_data.zip -d data/raw   # creates data/raw/player_data/
make setup                          # virtual environment with pinned dependencies
make test                           # unit tests; no data needed
make profile                        # writes docs/profile/profile_report.json and .md
make overlay                        # writes docs/img/overlay_*.jpg and orientation_*.jpg
```

Environment variables: none.

Built with Claude Code.
