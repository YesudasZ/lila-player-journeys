# LILA BLACK Player Journeys

**Live tool: https://lila-player-journeys-psi.vercel.app**

[![CI](https://github.com/YesudasZ/lila-player-journeys/actions/workflows/ci.yml/badge.svg)](https://github.com/YesudasZ/lila-player-journeys/actions/workflows/ci.yml)

A browser tool for Level Designers to see how players move, fight, loot and die on LILA BLACK's three maps.
It draws every recorded journey on the game's minimaps, plays a match back on a timeline, and lays heat layers for traffic, kills, deaths and loot over the map.
Every view has its own address, so a finding can be sent as a link. Built for the LILA Games Product Engineer written test.

| Read this | To learn |
|---|---|
| [INSIGHTS.md](INSIGHTS.md) | three things the tool showed about the game, with the numbers behind them |
| [ARCHITECTURE.md](ARCHITECTURE.md) | one page: stack, data flow, coordinate mapping, assumptions, trade-offs |
| [docs/DATA_NOTES.md](docs/DATA_NOTES.md) | what the data really contains, where its README is wrong, and what the pipeline does about it |
| [docs/DATA_FORMAT.md](docs/DATA_FORMAT.md) | the files the app loads, field by field |
| [docs/QA_REPORT.md](docs/QA_REPORT.md) | the final QA: every requirement of the brief tested on the live tool, with evidence |

## Tech stack

- **App:** Vite, React, TypeScript (strict), Tailwind CSS v4 and Zustand, drawing on layered HTML canvases.
- **Data pipeline:** Python 3.12 or newer with pyarrow, pandas, numpy and Pillow. It runs offline and writes static files.
- **Hosting:** Vercel, static. **Env vars: none.**

## Run the app

Needs Node 22.12 or newer. It runs from the data files committed in `web/public/data/`, so nothing has to be downloaded.

```bash
cd web
npm ci && npm run dev    # http://localhost:5173
```

## Rebuild the data

Needs Python 3.12 or newer and the assignment's `player_data.zip`, which is not in this repo. Put the zip into `_inbox/`, then:

```bash
mkdir -p data/raw                          # unzip makes only one folder level
unzip _inbox/player_data.zip -d data/raw   # creates data/raw/player_data/
make data       # rebuild web/public/data/; writes nothing unless every check passes
make insights   # print the numbers behind INSIGHTS.md
```

`make profile` measures the raw data again (`docs/profile/`), and `make overlay` redraws the images that prove the coordinate mapping (`docs/img/`). `make help` lists every target. Every number in the docs comes from these scripts: `make profile` for the raw data and `make insights` for the insights.

## Tests

```bash
make test                  # pipeline, committed data and statistics; needs no raw data
cd web && npm run check    # type check, ESLint and unit tests
```

## Project structure

```
pipeline/    offline data code: read, check, clean, project, encode; its tests
analysis/    the statistics behind INSIGHTS.md
web/         the app: src/lib (pure logic with tests), src/state, src/components; public/data (generated, committed)
docs/        data notes and format, plan and progress, proof images, screenshots
```

## Walkthrough video

A silent 4:39 screen recording of the live tool: [docs/media/walkthrough.mp4](docs/media/walkthrough.mp4).

| Time | Chapter |
|---|---|
| 0:00 | **Maps and legend.** Every journey on Ambrose Valley, the three map tabs, hovering and zooming, and the legend's switches |
| 1:08 | **Filters.** Days, fates and "Clear filters" |
| 1:41 | **Opening a match and the journeys panel.** Match `fbbc5d02` from the list, its summary and journeys, one journey in focus |
| 2:01 | **Playback.** Play, the speed set to 20x, and journeys picked out while the match plays |
| 3:05 | **Heatmaps.** Traffic, Kills, Deaths and Loot, on one match and on all matches, with the ⓘ details |
| 3:58 | **Copy link.** The view of a Lockdown match copied, then opened from the link in a new tab |
| 4:18 | **Data and keys.** Where the data differs from its README, what each heat layer counts, and the keys |

## Walkthrough

Each step is a link into the live tool.

1. **[Every journey of a map](https://lila-player-journeys-psi.vercel.app/).** Humans are solid blue lines with round heads, bots dashed orange lines with square heads. Triangles are kills, crosses deaths, diamonds deaths in the storm. The legend card at the bottom left switches each of them on and off. Drag to move, scroll to zoom; hover a path or a marker for who, when and where.

   ![All journeys on Ambrose Valley](docs/img/walkthrough/01-all-matches.jpg)

2. **[Filter by map and day](https://lila-player-journeys-psi.vercel.app/?map=Lockdown&days=February_10).** The tabs switch maps and show how many matches the filters leave on each. The chips filter by UTC day and by how a journey ended; folded away, the Filters heading still says how many are on.

   ![Lockdown on 10 February](docs/img/walkthrough/02-map-and-day.jpg)

3. **[Open one match](https://lila-player-journeys-psi.vercel.app/?match=fbbc5d02).** Search for a match id or choose from the list on the left. This one has 2 humans and 14 bots. Loot appears as small rings, and the panel on the right sums the match up and lists its journeys. Its × closes the panel and keeps the match open.

   ![Match fbbc5d02](docs/img/walkthrough/03-one-match.jpg)

4. **[Focus a journey](https://lila-player-journeys-psi.vercel.app/?match=fbbc5d02&journey=fbbc5d02-5787de75).** Click a path, or choose the journey in the panel, to pick it out from the others.

   ![One journey in focus](docs/img/walkthrough/04-focused-journey.jpg)

5. **[Play the match back](https://lila-player-journeys-psi.vercel.app/?match=fbbc5d02&t=118).** Space plays and pauses; the slider and its keys seek; speeds go from 1x to 60x. The link opens at 1:58, the second in which a bot kills one of the two humans.

   ![Playback at 1:58](docs/img/walkthrough/05-playback.jpg)

6. **[Filter by fate](https://lila-player-journeys-psi.vercel.app/?fate=killed_by_storm).** Only the journeys that ended in the storm, with their last positions.

   ![Journeys that ended in the storm](docs/img/walkthrough/06-fate-filter.jpg)

7. **Heat layers:** [Traffic](https://lila-player-journeys-psi.vercel.app/?heat=movement), [Kills](https://lila-player-journeys-psi.vercel.app/?heat=kill), [Deaths](https://lila-player-journeys-psi.vercel.app/?map=Lockdown&heat=death) and [Loot](https://lila-player-journeys-psi.vercel.app/?heat=loot). The line under the heat buttons gives the count and the fullest cell; the ⓘ beside it says in how many matches, what is counted and at whose position. A layer follows every filter.

   ![Kills on Ambrose Valley](docs/img/walkthrough/07-heat-kills.jpg)

8. **[Zoom in and share](https://lila-player-journeys-psi.vercel.app/?heat=kill&view=1058,1559,4).** The address always says the view; "Copy link" copies it. The browser's Back and Forward step through the views you chose.

   ![The cell with the most kills](docs/img/walkthrough/08-zoomed-link.jpg)

9. **Data and keys.** The button at the top right opens a short panel: where the data differs from its README, what each heat layer counts, and the keys.

---

Built by Yesudas M J. I used Claude Code as an AI pair-programmer, as encouraged in the brief; I planned the phases, made the architecture and scope decisions, reviewed every phase and ran the QA.
