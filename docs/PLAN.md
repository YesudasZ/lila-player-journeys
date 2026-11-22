# Build plan

**DRAFT, awaiting approval.** Phase 1 (data discovery) is complete. No application code is written until this plan is approved.

Requirements: [BRIEF.md](BRIEF.md). Data facts and decisions: [DATA_NOTES.md](DATA_NOTES.md).

## Schedule

Assumed deadline: **Thu 26 Nov 2026**, five days after the assignment arrived on Sat 21 Nov.

| Day | Phases | Hours |
|---|---|---|
| Sun 22 Nov | 1 Data discovery (done) | |
| Mon 23 Nov | 2 Pipeline · 3 Scaffold, theme, map canvas | 3.5 |
| Tue 24 Nov | 4 Journeys and markers · 5 Filters and URL · 6 Playback | 4 |
| Wed 25 Nov | 7 Heatmaps · 8 Polish · 9 Deploy | 3 |
| Thu 26 Nov | 10 Insights and docs · 11 Final QA · submit | 3 |

The hosted link exists on Wednesday, a day before the deadline. Every phase ends the same way: checks green, this file updated, commit, summary, stop for review.

## What Phase 1 changed

| Original idea | Change | Why |
|---|---|---|
| One JSON file per match, fetched on demand | **One bundle per map**, loaded once | 743 of 796 matches are a single journey of about 60 rows. The "all matches" view would need hundreds of requests, and the whole dataset is only 88,826 rows after cleaning |
| Heatmap grids precomputed per map, day and layer | **Binned in the browser** from the map bundle | At most 61,013 rows per map bin in a few milliseconds, and the heatmap then follows every active filter (days, humans or bots, one match) instead of a fixed set |
| Human or bot from the user_id format | From the journey's movement event | 17 numeric-id journeys are human; one numeric id plays both roles |
| Traffic heatmap from sample counts only | Add a **dwell time** layer | Position is sampled only while moving, so sample counts show movement and hide where players stand still (30% of human time sits in gaps longer than 6 s) |
| Single-match playback as a headline feature | Aggregated views first; match list sorted busiest first, with the 52 matches that have bots flagged | In 93% of matches there is one path to watch |
| Kill zones as player-versus-player hot spots | Kill zones are where players stood when they killed **bots** | Three Kill rows in five days, none against a recorded player |
| "Extracted" as a fate | "Survived (no death recorded)" | The data has no extraction event |
| Player ids as-is | Short aliases in everything published | Production ids in a public repo and on a public site |

## Phase 2: Pipeline (2 h)

**Goal:** one command turns the zip into the static files the app needs, with every cleaning step counted and tested.

**Deliverables**
- `pipeline/clean.py`: drop the journey stored twice, drop the second half of files written twice, drop Position rows after a death. Each step returns what it removed.
- `pipeline/build_data.py` writing `web/public/data/`:
  - `manifest.json`: per-map scale, origin and minimap size (from `maps.py`); day folders; one entry per match (map, day, start time in UTC, duration, human and bot journeys, counts of kills, deaths, storm deaths and loot).
  - `maps/<Map>.json`: every journey of the map as compact arrays (seconds since match start, u, v, event), with actor type, fate and a player alias.
  - `minimaps/<Map>.webp` at about 2048 px, aspect ratio kept, and a playable-area mask per map for the "ignored areas" layer.
  - `cleaning_report.json`: rows in, rows out, rows removed by reason.
- Tests on synthetic files: each cleaning step, the human/bot rule including a numeric-id human, fate, relative time, repeated Loot rows kept, posthumous kill kept, no full UUID in any output.
- `make data`, and a GitHub Actions workflow running `make test`.

**Acceptance**
- `make data` rebuilds everything from `data/raw/` in under a minute.
- Rows in equal 89,104; rows out plus rows removed by reason equal rows in; the removals match DATA_NOTES.md.
- Each map bundle is under 500 KB gzipped.
- Per-match counts in the manifest sum to the totals in `docs/profile/profile_report.json`.

**Verify locally:** `make data && make test`, then read `web/public/data/cleaning_report.json`.

## Phase 3: App scaffold, theme and map canvas (1.5 h)

**Goal:** the app shell with the three minimaps drawn correctly and a pan/zoom canvas.

**Deliverables**
- Vite + React + TypeScript (strict) + Tailwind v4 + Zustand + ESLint + Vitest + Playwright in `web/`. Versions confirmed with `npm view` first; nothing installed without asking.
- Theme tokens from CLAUDE.md, the layout shell (top bar, left sidebar, map, timeline), map tabs.
- `MapCanvas`: device-pixel-ratio aware, fit to screen, wheel zoom, drag pan, double-click reset.
- `uvToPixel` in `web/src/lib/` with tests, including the non-square Grand Rift image.
- Debug overlay (`D` key): world grid and a cursor read-out in world coordinates through the inverse transform.
- `npm run check` = tsc + eslint + vitest. A Playwright script that screenshots each map.

**Acceptance**
- Each minimap renders at its true aspect ratio; drawing all samples through `uvToPixel` reproduces `docs/img/overlay_*.jpg`.
- The cursor read-out at a known landmark matches the world coordinate computed in Python.
- `npm run check` green; no console errors.

**Verify locally:** `cd web && npm run check && npm run dev`, press `D`, compare with `docs/img/`.

## Phase 4: Journeys, humans versus bots, markers (1.5 h)

**Goal:** paths and events on the map, readable at a glance.

**Deliverables**
- Static path layer, cached per filter state. Humans: solid sky-blue line, round head. Bots: dashed orange line, square head.
- Markers by shape and colour: kill, death, storm death, loot (off by default). Identical events at the same spot and second collapse into one marker with a count. A Kill row with its Killed twin draws as one death.
- A path ends at the death row. Hover tooltip: event, who, time, world coordinates. Click a player to focus and dim the rest. Legend.

**Acceptance**
- For three named matches (one with bots, one single-journey, one with a storm death) the marker counts equal `cleaning_report.json`.
- Hover picks the nearest marker; humans and bots are distinguishable without colour.

**Verify locally:** open the three matches from the match list and compare counts.

## Phase 5: Filters and URL state (1 h)

**Goal:** every view is reachable and shareable.

**Deliverables**
- Map tabs, day chips (folder names, "partial" badge on 14 Feb), match list sorted busiest first with a "has bots" flag, single-match versus all-matches mode, human/bot/event toggles.
- Zustand store synced with URL search parameters; a "copy link" button; designed empty states.

**Acceptance**
- Reloading any URL reproduces the view exactly, including the selected match and toggles.
- Combinations with no data show an explanation, not a blank map.

**Verify locally:** change filters, reload, paste the URL into a private window.

## Phase 6: Timeline and playback (1.5 h)

**Goal:** watch a match unfold smoothly.

**Deliverables**
- A `requestAnimationFrame` clock outside React; React receives throttled updates for the read-out only.
- Position between samples: linear over 5 s steps; over longer gaps the player holds still and moves in the last 5 s, because sampling pauses while standing still.
- Play/pause, speeds 1x to 60x, scrubber with an event-density strip and event ticks, keyboard shortcuts (space, arrows, escape).
- Markers appear as time passes. In all-matches mode every match is aligned at its own time zero.

**Acceptance**
- No React render per frame; frame time under 16 ms on the busiest match (16 journeys) and in all-matches mode on Ambrose Valley, measured in the Performance panel.
- Scrubbing to a death time shows the death marker at the head of the path.

**Verify locally:** play match `fbbc5d02` at 1x and 60x; scrub hard.

## Phase 7: Heatmaps (1.5 h)

**Goal:** answer "where" questions for a whole map at once.

**Deliverables**
- Layers: traffic (movement samples), dwell time, kills, deaths, storm deaths, ignored areas (playable cells nobody entered).
- Binned in the browser from the map bundle, so the heatmap follows the active filters. Blur and a perceptual colour ramp per layer, opacity control, humans-only switch, a legend with real counts.

**Acceptance**
- The sum of each grid equals the number of rows that fed it (unit test).
- Switching layer or filter redraws in under 50 ms.
- The ignored-areas layer never marks the black surround of the minimap.

**Verify locally:** toggle each layer on each map; compare kill hot spots with `docs/img/overlay_*.jpg`.

## Phase 8: Polish and performance (1 h)

**Deliverables:** an "About the data" panel in plain language (what the README gets wrong and what the tool does about it), loading skeletons, error boundary, focus states and labels, a pass over all UI text.

**Acceptance:** Lighthouse performance at least 90 on the hosted build; no console errors; every control reachable by keyboard.

## Phase 9: Deploy (0.5 h)

**Deliverables:** `vercel.json` (build `web/`, single-page rewrite). You import the repo on vercel.com. The URL goes at the top of the README and into the repo's About field.

**Acceptance:** the site and three deep links open in a private window and on a phone.

## Phase 10: Insights and docs (2 h)

**Deliverables**
- `analysis/insights.py`: computes candidate findings; each kept insight has a reproducible number and a deep link into the tool.
- `INSIGHTS.md`: three insights, each with what caught the eye, the evidence, what to do and which metrics move, and why a Level Designer should care.
- `ARCHITECTURE.md`, one page: stack and why, data flow, the coordinate mapping walked through, assumptions, trade-offs table.
- README: deployed URL, tech stack, setup, "environment variables: none", data rebuild command, and the walkthrough with deep links, screenshots and a short committed GIF or MP4.

**Candidates already visible in Phase 1:** storm deaths all fall 655 to 887 s into a match on every map; kills pile up in a few zones (the centre of Ambrose Valley, Mine Pit on Grand Rift); 44% of human journeys record no death; large parts of each map see almost no traffic.

**Acceptance:** every number in INSIGHTS.md is printed by `analysis/insights.py`; ARCHITECTURE.md fits one printed page; every checklist item C1 to C10 of BRIEF.md is demonstrated in the walkthrough.

## Phase 11: Final QA (0.5 to 1 h)

**Deliverables:** a fresh clone into a temporary folder following the README literally; all tests; BRIEF.md statuses updated; an independent review by a fresh-context agent acting as a strict LILA reviewer; a check that no raw data, PDF, secret or full player id is in the history; the repo opens logged-out.

**Acceptance:** every row of BRIEF.md is ☑ with evidence; you submit the single GitHub link.

## Risks

| Risk | Mitigation |
|---|---|
| Four days left for ten phases | Deploy on day four; phases 8 and the dwell layer are the first to shrink |
| A reviewer expects numeric ids to look like bots | The "About the data" panel and ARCHITECTURE.md show the evidence; the legend says "human (numeric id)" in the tooltip |
| Canvas performance in all-matches mode | Static layers cached; only playheads redraw per frame; measured in Phase 6 |
| Vercel or npm versions differ from the plan | Versions confirmed with `npm view` in Phase 3; Cloudflare Pages as fallback |

## Open questions for you

1. Is Thu 26 Nov the right deadline?
2. Per-map bundles and in-browser heatmaps instead of per-match files and precomputed grids: agreed?
3. The dwell-time heatmap is an addition to your list. Keep it, or hold it for the buffer?
4. Player aliases instead of full ids in the published data: agreed?
