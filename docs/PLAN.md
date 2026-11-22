# Build plan

**DRAFT, awaiting approval.** Phase 1 (data discovery) is complete. No application code is written until this plan is approved.

Requirements: [BRIEF.md](BRIEF.md). Data facts and decisions: [DATA_NOTES.md](DATA_NOTES.md). Status: [PROGRESS.md](PROGRESS.md).

This is the second version. The first was reviewed by an independent agent acting as a studio reviewer (6 blockers, 22 should-fix); see [profile/crosscheck.md](profile/crosscheck.md). What changed is listed at the end.

## Schedule

Assumed deadline: **Thu 26 Nov 2026**, five days after the assignment arrived on Sat 21 Nov. The hour is not known yet.

| Day | Work | Hours |
|---|---|---|
| Sun 22 Nov | 1 Data discovery (done) | |
| Mon 23 Nov | 2 Pipeline, first draft of ARCHITECTURE.md · 3 App shell and map canvas · **9.1 first deployment** | 4.5 |
| Tue 24 Nov | 4 Journeys and markers · 5 Filters and URL · 6 Playback | 4 |
| Wed 25 Nov | 7 Heatmaps · 8 Polish · draft INSIGHTS.md · independent review of the hosted tool | 3.5 |
| Thu 26 Nov | 10 Walkthrough and final docs · 11 Final QA · 9.2 final deployment check · submit | 2.5 |

The hosted link exists from Monday, so every later phase is checked on the real URL. Thursday holds only the walkthrough, fixes and submission.

## Scope: core first, then in this order

Cut from the bottom when time runs short. Polish of what is already built is never cut.

| Tier | Feature | Why |
|---|---|---|
| **Core** | Journeys on the right minimap; humans and bots told apart; kill, death, storm and loot markers; filters by map, day and match; single-match playback; heatmaps for traffic, kills and deaths; shareable URLs; hosted | Requirements R1 to R8 and checklist C1 to C7 |
| Should 1 | "No recorded path" layer (ignored areas) | The fourth question in the brief's background |
| Should 2 | Loot heatmap | Loot is 14.5% of rows and a level-design lever; its markers are unreadable in aggregate |
| Should 3 | Fate filter (killed by bot, by storm, no death recorded) | Fate is already computed; it answers "show me the players the storm killed" |
| Should 4 | World coordinates under the cursor and a scale bar | Lets a designer carry a location back to the editor |
| Should 5 | All-matches playback, aligned at each match's first second | Most matches are one path; overlaying them shows flow over time |
| Could 1 | Time-spent (dwell) heatmap | Position sampling pauses while standing still, so samples hide waiting |
| Could 2 | Event-density strip on the timeline | Jump to the fights |
| Could 3 | Colour paths by elevation | Floors overlap in 2D |
| Could 4 | GIF or MP4 in the walkthrough | Deep links and screenshots already satisfy C10 |

Storm deaths are markers only: 39 points, 5 on Grand Rift, are not a heatmap.

## Phase 2: Pipeline (2.5 h)

**Goal:** one command turns the zip into the static files the app needs, with every cleaning step counted and tested.

**Deliverables**
- `pipeline/clean.py`: the four rules of DATA_NOTES.md ("Cleaning"), each returning what it removed.
- `pipeline/build_data.py` writing `web/public/data/`, which **is committed** (the host builds from the repo and has no raw data):
  - `manifest.json`: per map the scale and origin from `maps.py` and the shipped minimap's width and height, measured after encoding; the day folders; one entry per match with id, map, day, start time, observed span, file count, and counts as defined below.
  - `maps/<Map>.json`: every journey of the map as integer arrays: seconds since match start, u and v on a 0 to 65,535 grid, elevation, event code. Per journey: match id, public id, actor (human or bot), an "anonymous" flag for the 17 placeholder-id journeys, fate.
  - `minimaps/<Map>.webp`, about 2048 px wide, aspect ratio kept.
  - `cleaning_report.json`: rows in, rows removed per rule, rows left per event.
  - `web/src/lib/__fixtures__/projection.json`: reference points for the TypeScript projection tests (the README's worked example and the extreme u and v of each map).
- Public ids: a match is its first 8 characters and so is a UUID player (both unique, checked by the build: 796 and 245). Bots keep their number. No full player UUID is written anywhere.
- Tests on synthetic files: each cleaning rule including the tie-break of rule 1; ordering by (`ts`, file order); the human/bot rule with a placeholder-id human; fate for humans and for bots without a death; a Kill/Killed twin counted as one death; repeated Loot rows kept; a late kill kept; no full UUID in any output; positions surviving the integer encoding to within 0.25 world units; the build failing on an unknown event or an unreadable file.
- `make data`. A GitHub Actions workflow running `make test` and a check that no raw data, PDF or full player UUID is in the tree.
- First draft of `ARCHITECTURE.md` (stack, data flow, coordinate mapping, assumptions): its content already exists in DATA_NOTES.md.

**Manifest counts, per match:** human journeys, anonymous human journeys, bot journeys; kills = BotKill rows in human journeys; deaths = BotKilled and Killed rows in human journeys; storm deaths; loot rows; bot deaths = BotKilled rows in bot journeys.

**Acceptance** (expected values are the profiler's `cleaning` metrics)
- `make data` rebuilds everything from `data/raw/` in under a minute and exits non-zero if `cleaning_report.json` differs from the profiler: 88, 190, 3 and 206 rows removed, 88,617 left.
- Manifest totals: 796 matches, 284/201/162/112/37 per day folder, 798 human journeys of which 17 anonymous, 444 bot journeys, 2,236 kills, 404 deaths, 39 storm deaths, 12,829 loot rows, 296 bot deaths.
- Each map bundle is under 700 KB gzipped.
- CI is green on `main`.

**Verify locally:** `make data && make test`, then read `web/public/data/cleaning_report.json`.

## Phase 3: App shell and map canvas (1.5 h)

**Goal:** the three minimaps on a pan and zoom canvas, hosted.

**Deliverables**
- Vite + React + TypeScript (strict) + Tailwind v4 + Zustand + ESLint + Vitest in `web/`. Versions confirmed with `npm view` first; nothing installed without asking.
- Theme tokens from CLAUDE.md. Only what works ships: top bar with map tabs, and the canvas. The sidebar arrives in Phase 5 and the timeline in Phase 6.
- `MapCanvas`: device-pixel-ratio aware, fit to screen, wheel zoom, drag pan, double-click reset.
- `web/src/lib/projection.ts`: `uvToPixel` and its inverse, the only projection code in the app.
- Should 4: world coordinates under the cursor, and a scale bar.
- `npm run check` = tsc + eslint + vitest, added to CI.
- **Step 9.1, first deployment** (see Phase 9).

**Acceptance**
- `uvToPixel` matches every point of `projection.json` to within 0.5 px, including on the 2160×2158 image; pixel to world and back returns the same point to within 0.01 world units.
- Each minimap is drawn at the aspect ratio recorded in the manifest (unit test on the layout function).
- `npm run check` green, CI green, no console errors on the hosted URL.

**Verify locally:** `cd web && npm run check && npm run dev`; hover over a road and read the coordinates.

## Phase 4: Journeys, humans versus bots, markers (1.5 h)

**Goal:** paths and events on the map, readable at a glance.

**Deliverables**
- Path layer, cached per filter state. Humans: solid sky-blue line, round head. Bots: dashed orange line, square head.
- Markers by shape and colour: kill, death, storm death, loot. Identical events at the same spot and second collapse into one marker with a count.
- Loot markers are on in single-match view and off in all-matches view; the toggle is always visible in the legend.
- Hover tooltip: event, who, time, world coordinates and elevation. An anonymous journey reads "human (no account id)". Click a journey to focus it and dim the rest. Legend.

**Acceptance**, on three named matches: `fbbc5d02` (16 journeys, one of them anonymous), `a476eb57` (one journey, 218 rows), `5a081fe4` (ends in a storm death)
- For each journey the path has as many vertices as the bundle has movement rows, and a journey with a death ends at the death's position (unit test on the function that builds draw lists).
- Per marker type, the counts shown add up to the manifest entry of the match.
- In a greyscale screenshot of `fbbc5d02`, humans, bots and each marker type can still be told apart. If the loot square and the bot's square head cannot, loot becomes a ring.
- Hover picks the nearest marker within 10 screen pixels.

**Verify locally:** open the three matches and compare the legend counts with `manifest.json`.

## Phase 5: Filters and URL state (1 h)

**Goal:** every view is reachable and shareable.

**Deliverables**
- Sidebar: day chips (multi-select, labelled as UTC days, "partial" on 14 Feb), match list sorted busiest first with a "has bots" flag, single-match or all-matches mode, toggles for humans, bots and each event type. Should 3: fate filter.
- "N matches, M journeys" on every aggregated view.
- State in a Zustand store synced with the URL: `map`, `days`, `match`, `mode`, `show`, `fate`, and the viewport. Phase 6 adds `t`, Phase 7 adds `heat`. A "copy link" button. Designed empty states.
- First visit lands on Ambrose Valley, all matches, traffic heatmap (from Phase 7).

**Acceptance**
- Encoding the state to a URL and decoding it returns the same state (unit test, extended in Phases 6 and 7).
- Selecting each day alone lists 284, 201, 162, 112 and 37 matches; each map alone lists 566, 171 and 59 (unit test on the selector, against the manifest).
- A combination with no data shows an explanation, not a blank map.

**Verify locally:** change filters, reload, paste the URL into a private window.

## Phase 6: Timeline and playback (1.5 h)

**Goal:** watch a match unfold smoothly.

**Deliverables**
- A `requestAnimationFrame` clock outside React; React receives throttled updates for the read-out only.
- Position at a time (assumption A6): linear across a 5 s step; across a longer gap the player holds still and moves during the last 5 s; after the last sample the player stays put until the death row or the end of the journey.
- Play and pause, speeds 1x to 60x, scrubber with event ticks, keyboard shortcuts (space, arrows). Markers appear as time passes. `t` joins the URL.
- Should 5: all-matches playback. Could 2: density strip.

**Acceptance**
- Unit tests of position-at-time: a 5 s step, a long gap, a death long after the last sample, a journey with one sample.
- The scrubber's end equals the manifest's observed span for the three named matches.
- No React render per frame. Frame time under 16 ms while playing `fbbc5d02` at 20x for 10 s, measured in Chrome's Performance panel without throttling; the reading is written into PROGRESS.md.
- Scrubbing to a death shows the death marker at the head of that path.

**Verify locally:** play `fbbc5d02` at 1x and 60x; scrub hard.

## Phase 7: Heatmaps (1.5 h)

**Goal:** answer "where" questions for a whole map at once.

**Deliverables**
- Core layers, binned in the browser from the map bundle so they follow the active filters: traffic (movement samples, labelled as such), kills (where players stood when they killed), deaths (where they fell). Human journeys by default; the sidebar toggles decide, there is no second switch.
- Grid cells of a fixed size in world units, a blur, one perceptual colour ramp per layer, opacity, a legend with the real counts and the number of matches behind them. `heat` joins the URL.
- Should 1: "no recorded path" layer. Path segments, not samples, are rasterised; a cell counts as crossed if any human segment passes through it; the layer is limited to the map artwork and says in its legend that roofs, rocks and water are included.
- Should 2: loot layer. Could 1: time-spent layer, where each gap's seconds go to the cell of its earlier sample, capped at 60 s.

**Acceptance**
- Before blur, the sum of each count grid equals the number of rows that fed it (unit test). The time-spent grid sums to the seconds assigned. A synthetic path that jumps over a cell marks that cell as crossed.
- Binning Ambrose Valley, all matches, takes under 50 ms on the development machine (Vitest benchmark; the reading goes into PROGRESS.md).
- The "no recorded path" layer marks nothing on the black surround.

**Verify locally:** toggle each layer on each map; compare the kill hot spots with `docs/img/overlay_*.jpg`.

## Phase 8: Polish (1 h)

**Deliverables:** an "About the data" panel in plain language (what the README gets wrong, what the tool does about it, what "anonymous" and "no death recorded" mean); loading and error states; visible focus and labels on every sidebar, top-bar and timeline control; a notice on small screens that the tool is built for desktop; a pass over all UI text.

**Acceptance:** Lighthouse performance at least 90 on the hosted URL (desktop preset); no console errors; sidebar, top bar and timeline fully usable by keyboard, including choosing a journey from the list.

## Phase 9: Deployment (0.5 h, in two steps)

- **9.1, at the end of Phase 3.** You create the Vercel project from the GitHub repo with root directory `web` (one-time, in the browser). The URL goes at the top of the README and into the repo's About field. From here on every push deploys.
- **9.2, on Thursday.** The site and three deep links open in a private window; on a phone the page loads and shows the desktop notice.

## Phase 10: Insights and docs (2 h, spread over Wednesday and Thursday)

**Deliverables**
- `analysis/insights.py`: reads the published bundles, the same data the tool draws, and prints every number used in INSIGHTS.md.
- `INSIGHTS.md`: three things learned about the game, each with what caught the eye, the evidence, what to do and which metrics would move, and why a Level Designer should care. Each has a deep link and a screenshot of the tool showing it.
- `ARCHITECTURE.md` finished: stack and why, data flow, the coordinate mapping walked through, assumptions, trade-offs table.
- README: deployed URL at the top, tech stack, "run the app" (no data needed), "rebuild the data" (needs the zip), environment variables: none, and the walkthrough: numbered steps with deep links and screenshots covering C1 to C10.

**Candidate insights.** To be found with the tool, not assumed. Seen so far in the overlay images, not yet measured: kills concentrate in a few zones of each map; parts of each map carry almost no traffic. Measured: storm deaths come only after 10 min 55 s; 43% of identified human journeys record no death. Any kill-zone insight must say that the kills are of bots.

**Acceptance:** every number in INSIGHTS.md is printed by `analysis/insights.py` and visible in the tool at its deep link; ARCHITECTURE.md prints to one A4 page from GitHub's rendered view; each checklist row C1 to C10 has a walkthrough step.

## Phase 11: Final QA (0.75 h)

**Deliverables:** a fresh clone into a temporary folder, following the README literally: the app runs from the committed data, and the data rebuild runs once the zip is added. All tests. BRIEF.md statuses for R, S and C rows set, each with a link to its evidence. An independent agent reviews the hosted tool and the repo as a strict LILA reviewer (first run on Wednesday evening, so its findings can be fixed). The repo opens logged-out and its page lists a single contributor.

**Acceptance:** every R, S and C row of BRIEF.md is ☑ with evidence; you submit the single GitHub link.

## Risks

| Risk | Mitigation |
|---|---|
| Four days, ten phases, about 14 hours | The scope ladder above. Hosting from Monday. Documents drafted as their content appears |
| Each phase waits for a review | One review per day is enough if you prefer; see the open questions |
| A reviewer expects numeric ids to look like bots | The tooltip says "human (no account id)"; the About panel and ARCHITECTURE.md show the evidence |
| The README's map constants may be 1 to 2% off | Kept as documented; stated in ARCHITECTURE.md; a calibration is an open question |
| The repo is public while work is in progress | Leak check in CI; no raw data, PDF or full player UUID is ever committed |
| The minimap artwork is the studio's | It came with the assignment and the tool cannot work without it; it is published only as part of this submission |

## Open questions for you

1. Is Thu 26 Nov the right deadline, and at what hour?
2. The scope ladder: agreed? It moves the storm heatmap to markers, adds a loot heatmap, and puts the dwell layer, density strip and all-matches playback below the core.
3. One data bundle per map and heatmaps binned in the browser, instead of one file per match and precomputed grids: agreed?
4. Public ids as 8-character prefixes: agreed?
5. Map constants: keep the README's (my recommendation), or apply the fitted x scale on Ambrose Valley and Lockdown?
6. One review per phase, or one per day?
7. Should `docs/PROGRESS.md`, `CLAUDE.md` and `.claude/` stay in the repo at submission?

## What changed from the first version

| Was | Now | Why |
|---|---|---|
| Counts checked against raw totals | Checked against the profiler's post-cleaning numbers, written into this plan | Raw and cleaned counts differ by design |
| Three cleaning rules, 88,826 rows | Four rules, 88,617 rows | The cross-check found the mirrored Kill rows and 33 rows in the death's own second |
| Marker counts compared with `cleaning_report.json` on unnamed matches | Compared with the manifest on three named matches, plus a test on path vertices | The old check could not be run |
| "Ignored areas" = non-black cells with no samples | "No recorded path" from path segments, limited to the artwork | Players cross cells between samples; black is not "unplayable" and colour is not "playable" |
| Hosting on Wednesday, Lighthouse before deployment | First deployment on Monday; Lighthouse on the hosted URL | The hosted tool is what gets evaluated |
| All documents on deadline day | ARCHITECTURE.md drafted Monday, INSIGHTS.md Wednesday | Thursday is for the walkthrough and fixes |
| Six heatmap layers at once | Three core layers, the others by priority | The brief asks for three |
| Loot markers off by default | On in single-match view | Checklist C4 expects to see them |
| Empty sidebar and timeline in Phase 3 | Each panel ships with the phase that fills it | No placeholder UI |
| World coordinates behind a debug key | Always visible, with a scale bar | It is useful to a designer |
| Elevation dropped | Kept in the data and shown in the tooltip | Floors overlap in 2D |
| "Duration" of a match | "Observed span" | Match length is not in the data |
| Insights from a script on the raw data | From the published bundles, each visible in the tool | They must be learned with the tool |
