# The brief, as a checklist

Source: "Lila Product Engineer Written Test", 6-page PDF (kept out of git). Everything below is paraphrased from it. The dataset's own README is covered in [DATA_NOTES.md](DATA_NOTES.md).

**In one line:** build and host a browser tool that lets LILA's Level Designers see how players move, fight, loot and die on the three LILA BLACK maps, from 5 days of raw telemetry.

**The users are Level Designers, not data scientists.** The background section names four things they cannot see today: where players move, where fights break out, where people die to the storm, and which areas of a map get ignored.

Status key: ☐ not started · ◐ in progress · ☑ done and verified.

## What is provided

- `player_data.zip`: 5 days of production gameplay data from LILA BLACK.
- One minimap image for each of the game's 3 maps.
- A README explaining the data format, schema and coordinate system. The brief's instruction: read it carefully before starting.

## Core requirements (all "must have")

| # | Requirement | How this project meets it | Phase | Status |
|---|---|---|---|---|
| R1 | Load and parse the provided parquet data | Offline Python pipeline (pyarrow) reads all 1,243 files and writes static assets for the app | 2 | ☑ `make data`: 89,104 rows in, 88,617 out, counts reconciled with the profile and pinned in a test of the committed files |
| R2 | Show player journeys on the correct minimap, with world coordinates mapped properly | One tested projection function; UV stored, pixels computed from the real image size | 2, 3, 4 | ◐ the app draws the three minimaps with pan and zoom; its projection matches the pipeline's 13 reference points; journeys arrive in Phase 4 |
| R3 | Tell humans and bots apart visually | Colour and line style and head shape, with a legend | 4 | ☐ |
| R4 | Show kills, deaths, loot and storm deaths as distinct markers | Shape and colour per event type, tooltip names the event | 4 | ☐ |
| R5 | Filter by map, date and/or match | All three, plus human/bot and event toggles | 5 | ☐ |
| R6 | Timeline or playback to watch a match unfold | Play/pause, speeds, scrubber with an event-density strip | 6 | ☐ |
| R7 | Heatmap overlays for kill zones, death zones or high-traffic areas | All three, plus storm deaths and never-visited areas | 7 | ☐ |
| R8 | Hosted and reachable through a shareable link | Static site on Vercel, deep links for every view | 9 | ◐ hosted at https://lila-player-journeys-psi.vercel.app, production follows `main`; deep links come in Phase 5 |

## Not prescribed (our choice, to be justified in ARCHITECTURE.md)

| # | Left open | Our choice |
|---|---|---|
| N1 | Tech stack: "pick what lets you move fast and deliver something polished" | Python pipeline, then Vite + React + TypeScript + Tailwind + Zustand on Canvas 2D |
| N2 | Design and UX (no mockups given) | Designed for Level Designers: map first, plain language, sensible defaults |
| N3 | Architecture of pipeline, frontend, hosting | Offline preprocessing to static files, single-page app, static hosting |

## Instructions and guidelines

| # | Guideline | What it means here |
|---|---|---|
| G1 | Responses should be clear, concise and well thought out | Short docs, tables, real numbers |
| G2 | AI tools are allowed and expected. The test is whether you can use the right tools to ship something that works, not whether you can write code from scratch | Built with Claude Code; the README says so. What counts is a working, hosted tool |
| G3 | Attention to detail: coordinate mapping, bytes encoding, bot detection, timestamps | Each has a measured answer in DATA_NOTES.md and a test |
| G4 | Quality over quantity: four polished features beat ten half-working ones | Fixed scope; nothing ships half-done |
| G5 | Document assumptions and do not get blocked | DATA_NOTES.md now, the assumptions table in ARCHITECTURE.md later |
| G6 | Deadline: 5 days from receipt; expected effort 10 to 15 focused hours | Received 21 Nov 2026 (assumed), so due 26 Nov 2026 |

## What is evaluated

| # | Area | What they look for | Where we answer it |
|---|---|---|---|
| E1 | System design | Sensible architecture and stack; a data pipeline that makes sense | ARCHITECTURE.md, `pipeline/` |
| E2 | Attention to detail | Correct coordinates, accurate events, edge cases handled | DATA_NOTES.md, `docs/profile/`, `docs/img/`, tests |
| E3 | End-to-end execution | It works, it is hosted, usable without our help | Deployed URL, incognito test, fresh-clone test |
| E4 | Product thinking | Useful to a Level Designer; the right things are filterable and interactive | The app itself, the walkthrough, INSIGHTS.md |
| E5 | Code quality | Organised, readable, reasonably structured | Small typed modules, pure logic separate from UI, tests, CI |
| E6 | Communication | Clear architecture doc; trade-offs articulated | ARCHITECTURE.md (one page, trade-offs table) |

## What to submit

One GitHub repository link that contains everything. Links to documents or drives are not accepted.

| # | Item | Detail | Status |
|---|---|---|---|
| S1 | Source code | All of it, in the repo | ◐ |
| S2 | Working deployment | A deployed URL, written in the repo (top of the README), that the reviewers can open and use | ◐ live, and written at the top of the README; it shows each phase once it is merged |
| S3 | README | Tech stack, setup steps, environment variables | ◐ setup for the app and the pipeline written; tech stack and walkthrough in Phase 10 |
| S4 | ARCHITECTURE.md, one page | (a) what it is built with and why; (b) data flow from parquet to screen; (c) how game coordinates are mapped to the minimap, walked through; (d) assumptions where the data was ambiguous; (e) major trade-offs, a simple table is fine | ◐ first draft |
| S5 | INSIGHTS.md, three things learned about the game, using the tool we built | For each: (a) what caught the eye; (b) evidence: a pattern or statistic; (c) is it actionable, which metrics move, what to do; (d) why a Level Designer should care | ☐ |

## Their pre-submission checklist

| # | Check | Status |
|---|---|---|
| C1 | Tool is live at the hosted URL | ◐ live since 23 Nov with the first screen; checked again in step 9.2 |
| C2 | Player paths render correctly on the minimap | ☐ |
| C3 | Humans can be told apart from bots visually | ☐ |
| C4 | Kill, death, loot and storm events are marked | ☐ |
| C5 | Filtering by map/date/match works | ☐ |
| C6 | Timeline or playback shows match progression | ☐ |
| C7 | Heatmaps show kill zones, death zones and traffic | ☐ |
| C8 | Architecture doc covers the coordinate mapping approach | ☐ |
| C9 | Three insights with supporting evidence | ☐ |
| C10 | Walkthrough covers all major features | ☐ |

## Inconsistencies in the brief and how we resolve them

| # | Inconsistency | Resolution |
|---|---|---|
| I1 | R7 says kill zones, death zones **or** traffic; C7 says kill zones, death zones **and** traffic | Build all three |
| I2 | R5 says map, date **and/or** match; C5 says map/date/match | Build all three filters |
| I3 | C10 asks for a walkthrough that the "what to submit" section never defines | A Walkthrough section in the README: numbered steps, each with a deep link and a screenshot, plus a short GIF or MP4 committed in the repo (no external links) |
| I4 | The brief says the README contains everything needed to understand the data; four of the README's statements do not match the files (the timestamp unit, the minimap size, the human/bot rule, the share of position rows) | Measured data wins; every difference is recorded in DATA_NOTES.md |
| I5 | The brief calls the game an extraction shooter; the dataset README opens with "battle-royale style" | Treat it as an extraction shooter with a storm. The data has no extraction event, so "survived" is inferred from the absence of a death |
| I6 | S4 demands one page but asks for five topics including a walk-through of the hardest part | Tables and one diagram; depth lives in DATA_NOTES.md, which ARCHITECTURE.md links to |
