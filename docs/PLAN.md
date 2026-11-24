# Build plan

**Approved on 23 Nov 2026**, with the recommended answers to questions 1 to 6 at the end. Phase 1 (data discovery) is complete.

Requirements: [BRIEF.md](BRIEF.md). Data facts and decisions: [DATA_NOTES.md](DATA_NOTES.md). Status: [PROGRESS.md](PROGRESS.md).

This is the second version. The first was reviewed by an independent agent acting as a studio reviewer (6 blockers, 22 should-fix); see [profile/crosscheck.md](profile/crosscheck.md). What changed is listed at the end. **The review of Phase 2 changed a few lines after the approval; they are listed in the last section and wait for your review.**

## Schedule

Assumed deadline: **Thu 26 Nov 2026**, five days after the assignment arrived on Sat 21 Nov. The hour is not known yet.

| Day | Work | Hours |
|---|---|---|
| Sun 22 Nov | 1 Data discovery (done) | |
| Mon 23 Nov | 2 Pipeline, first draft of ARCHITECTURE.md · 3 App shell and map canvas · **9.1 first deployment** | 4.5 |
| Tue 24 Nov | 4 Journeys and markers · 5 Filters and URL · 6 Playback | 4 |
| Wed 25 Nov | 7 Heatmaps · 8 Polish · draft INSIGHTS.md · independent review of the hosted tool | 3.5 |
| Thu 26 Nov | 10 Walkthrough and final docs · 11 Final QA · 9.2 final deployment check · submit | 2.5 |

The hosted link exists from Monday. Every later phase is checked on the preview link of its pull request before it is merged, and on the real URL after. Thursday holds only the walkthrough, fixes and submission.

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
  - `manifest.json`: per map the scale and origin from `maps.py` and the shipped minimap's width and height, measured after encoding; the day folders; one entry per match with id, map, day, start time, observed span, and the counts defined below (humans plus bots is the file count).
  - `maps/<Map>.json`: every journey of the map as integer arrays: seconds since match start, u and v on a 0 to 65,535 grid, elevation, event code. Per journey: an id of its own, match id, public id, actor (human or bot), an "anonymous" flag for the 17 placeholder-id journeys, fate.
  - `minimaps/<Map>.webp`, about 2048 px wide, aspect ratio kept.
  - `cleaning_report.json`: rows in, rows removed per rule, rows left per event.
  - `web/src/lib/__fixtures__/projection.json`: reference points for the TypeScript projection tests (the README's worked example and the extreme u and v of each map, each with its integer codes and what they decode to).
  - [DATA_FORMAT.md](DATA_FORMAT.md): these files, field by field, and what the app may rely on.
- Public ids: a match is its first 8 characters and so is a UUID player (both unique, checked by the build: 796 and 245). Bots keep their number. No full player UUID is written anywhere.
- Tests on synthetic files: each cleaning rule including the tie-break of rule 1; ordering by (`ts`, file order); the human/bot rule with a placeholder-id human; fate for humans and for bots without a death; a Kill/Killed twin counted as one death; repeated Loot rows kept; a late kill kept; no full UUID in any output; positions surviving the integer encoding to within 0.25 world units; the build failing on an unknown event or an unreadable file.
- `make data`. A GitHub Actions workflow running the tests, among them a check that no raw data, PDF or full player UUID is in the tree.
- First draft of `ARCHITECTURE.md` (stack, data flow, coordinate mapping, assumptions): its content already exists in DATA_NOTES.md.

**Manifest counts, per match:** human journeys, anonymous human journeys, bot journeys; kills = Kill and BotKill rows in human journeys; deaths = Killed and BotKilled rows in human journeys; storm deaths; loot rows; bot kills and bot deaths = the same rows in bot journeys. Every marker is counted exactly once.

**Acceptance** (expected values are the profiler's `cleaning` metrics)
- `make data` rebuilds everything from `data/raw/` in under a minute. If its counts differ from the profiler it exits non-zero and writes nothing: 88, 190, 3 and 206 rows removed, 88,617 left.
- Manifest totals: 796 matches, 284/201/162/112/37 per day folder, 798 human journeys of which 17 anonymous, 444 bot journeys, 2,236 kills, 404 deaths, 39 storm deaths, 12,829 loot rows, 170 bot kills, 296 bot deaths. `pipeline/tests/test_committed_data.py` holds these numbers and checks the committed files against them.
- Each map bundle is under 700 KB gzipped.
- CI is green on `main`.

**Verify locally:** `make data && make test`, then read `web/public/data/cleaning_report.json`.

## Phase 3: App shell and map canvas (1.5 h)

**Goal:** the three minimaps on a pan and zoom canvas, hosted. The detailed plan below was approved on 23 Nov 2026; it is built on the branch `phase-3-app-shell`.

**Deliverables**
- Vite + React + TypeScript (strict) + Tailwind v4 + Zustand + ESLint + Vitest in `web/`, with the exact versions of the table below. Nothing else is installed without asking.
- Theme tokens from CLAUDE.md. Only what works ships: top bar with map tabs, and the map. The sidebar arrives in Phase 5 and the timeline in Phase 6.
- The map: device-pixel-ratio aware, the artwork fitted to the window, wheel zoom at the cursor, drag pan, double-click zoom in, Fit button.
- `web/src/lib/projection.ts`: `uvToPixel` and its inverse, the only projection code in the app.
- Should 4: world coordinates under the cursor, and a scale bar.
- Pipeline: the box of the artwork inside each minimap (`minimap.artwork` in the manifest), found with the flood fill the mapping proof already uses.
- `npm run check` = tsc + eslint + vitest, added to CI as a second job together with `npm run build`.
- **Step 9.1, first deployment** (see Phase 9).

**Packages** (read from npm on 23 Nov, all pinned exactly)

| Runs in the browser | Version | Development only | Version |
|---|---|---|---|
| react, react-dom | 19.3.1 | vite | 8.3.8 |
| zustand | 5.1.0 | @vitejs/plugin-react | 6.3.0 |
| @fontsource-variable/inter | 5.3.0 | typescript | 6.0.3 |
| @fontsource-variable/space-grotesk | 5.3.0 | tailwindcss, @tailwindcss/vite | 4.3.5 |
| @fontsource-variable/jetbrains-mono | 5.3.0 | vitest | 5.1.1 |
| | | eslint, @eslint/js | 10.15.0, 10.0.1 |
| | | typescript-eslint | 8.73.0 |
| | | eslint-plugin-react-hooks, eslint-plugin-react-refresh | 7.1.1, 0.5.8 |
| | | globals | 17.14.0 |
| | | @types/react, @types/react-dom, @types/node | 19.3.0, 19.3.0, 22.20.5 |

TypeScript is 6.0.3, not the newest 7.0.2: typescript-eslint 8.73 accepts TypeScript below 6.1 only (your choice on 23 Nov: ESLint with TypeScript 6.0). Fonts are bundled, so the page makes no third-party request.

**Files**

```
web/src/lib/         projection.ts, view.ts, scaleBar.ts, manifest.ts, readout.ts, mapKeys.ts: pure functions, each with a Vitest file beside it
web/src/state/       store.ts: manifest load state, selected map, one view per map (Zustand), with a test file
web/src/data/        fetch of the manifest, loading of a minimap image, the kind of a failure
web/src/components/  TopBar, MapTabs, MapPanel, MapView, MapReadout, ZoomControls, StatusMessage, ErrorBoundary;
                     mapSurface.ts is plain DOM code: it draws the canvas and handles pointer, wheel and keys without a React render
web/src/testing/     the committed manifest, for tests
```

**The screen**

- Page grid, fixed now so later phases slot in without moving the map: columns `320px | 1fr`, rows `48px | 1fr | auto`. In Phase 3 the map cell spans both columns. The sidebar (Phase 5) takes column 1 and the timeline (Phase 6) row 3; both are grid tracks, never overlays.
- Top bar, 48 px, on `surface` with a `border` line below. Brand cell 320 px wide: "LILA BLACK" (Space Grotesk 600, 15 px, letter-spacing 0.08em) and "Player Journeys" (Inter 13 px, `text-muted`). The tabs start at x = 320.
- Tabs: the three map names from the manifest, Inter 500 14 px. Rest: label `text-muted`. Hover: label `text` on a `surface-2` pill. Selected: label `text` and a 2 px `accent` line. Focus: 2 px `accent` outline. Left and Right move and wrap, Home and End jump; selection follows focus. No match count yet: it arrives with the match list in Phase 5.
- Map cell on `bg`. The image is drawn with the `lighten` blend, so its pure black surround becomes exactly `bg` and no square edge shows. Cursor: crosshair, and a closed hand while a drag moves the map. The focus ring is drawn inside the cell: 2 px `accent` with 2 px `bg` inside it.
- Bottom left, 16 px in: a fixed panel (216 by 56, `surface`, `border`, radius 6, JetBrains Mono 12 px) that the pointer passes through. Row 1: `x  123  z  −57` in whole world units, `—` when the pointer is off the image. Row 2: the scale bar and its label, for example `100 units`. The bar is the largest of 1, 2 or 5 times a power of ten that is at most 120 px long.
- Bottom right, 16 px in: zoom in over zoom out, then `Fit`; each 32 by 32. Tooltips: `Zoom in (+)`, `Zoom out (−)`, `Fit map to window (0)`. At a zoom limit the button is marked unavailable but stays focusable.
- Centre of the cell: loading and error states. `Loading maps…`, `Loading Grand Rift…` (shown only after 250 ms). `The maps did not load` or `Grand Rift did not load`, then `Check your connection and try again.` and a `Try again` button, which stays in place while it runs; when the retry works, the keyboard focus goes to the map. A data file this version cannot read gets `The map data does not fit this version of the tool. Reload the page to get the current version.` and a `Reload` button. A fault in the page itself shows `Something went wrong` with `Reload`, not an empty page. The reason of a failure is written to the console. No spinner, no skeleton, no toast.
- Page title: `Ambrose Valley · LILA BLACK Player Journeys`.

Contrast of the tokens used (WCAG): `text` 16.25 and `text-muted` 6.73 on `surface`; `text-muted` 7.16 on `bg`; `accent` 4.60 on `surface` and 4.90 on `bg`. `border` is 1.4 on `bg`: decoration only, no control depends on it.

**How the map view works**

- A view is the image point at the centre of the viewport plus a zoom relative to "fit" (1 = the artwork fits with 24 px free on every side). It does not depend on the window size: a resize keeps the framing, and Phase 5 can put the view into the URL.
- Wheel: zoom by `exp(-deltaY * 0.0015)` about the pointer, `0.01` for a trackpad pinch (wheel with ctrl). The listener is native and not passive, so the page neither scrolls nor zooms. Double-click: zoom in by 2 about the pointer. Buttons and `+` `-`: by 1.5 about the centre. Arrows: 64 px. `0` and Fit: back to fit. Keys act only without Ctrl, Cmd or Alt, and while the focus is on the map or on one of its buttons. A drag starts after 3 px.
- Zoom runs from fit to 4 screen pixels per image pixel. No side ever shows more empty space than the fitted map has there, so the centre of the viewport stays inside the artwork box and the map cannot be lost.
- The canvas is sized in device pixels and resized when the window moves to another screen. Layers are stacked canvases sharing one view; Phase 3 has one, the minimap. From Phase 4 the surface holds a list of layers, one canvas and one draw function each, all drawn with the same view; a layer is redrawn when the view, the size or its own data changed, and a pointer that only moves redraws none.
- Pan and zoom cause no React render: the canvas listens to the store, and the coordinates are written straight into the page.
- Loading order: the manifest, the image of the open map (decoded before its first draw), then the other two. Each map remembers its view.
- Accessibility: `header` with the `h1` and the tab list; `main` with one tab panel; the map is focusable, named after its map, with its keys described; the coordinates are not announced; loading is a status, an error an alert.

**Acceptance**
- From the integer codes of every point of `projection.json`, `uvToPixel` gives the fixture's pixel to within 0.5 px, including on the non-square 2048×2046 image (the shipped Grand Rift minimap); pixel to world and back returns the same point to within 0.01 world units.
- Each minimap is drawn at the aspect ratio recorded in the manifest, and the artwork box is centred in the viewport (unit tests on the fit function, on a wide, a tall and a square viewport).
- Zooming keeps the point under the cursor in place; the viewport centre never leaves the artwork box (unit tests).
- The three artwork boxes are pinned in `pipeline/tests/test_committed_data.py`; `make overlay` leaves the proof images unchanged.
- `npm run check` green and CI green on the pull request; after the merge and step 9.1, no console errors on the hosted URL.

**Verify locally:** `cd web && npm run check && npm run dev`; hover over a road and read the coordinates.

## Phase 4: Journeys, humans versus bots, markers (1.5 h)

**Goal:** paths and events on the map, readable at a glance, and a first way to choose what is shown. The detailed plan below was approved on 23 Nov 2026; it is built on the branch `phase-4-journeys`.

**Deliverables**
- Path layer, cached per filter state. Humans: solid sky-blue line, round head. Bots: dashed orange line, square head. Until Phase 6 a head sits at the end of its path. Lines are thinner and half transparent in the all-matches view, so density reads.
- Markers by shape and colour, at one size on screen at every zoom, each with a dark outline: kill triangle, death cross, storm-death diamond, small loot ring (a ring, not the square first planned: see the acceptance). While all matches are open, heads and markers are drawn at 70% of that size, so that hundreds of them leave the paths visible. The events of one kind that one journey has at one spot are one marker with a count, whatever their second (changed after the review, see the last section): in the tooltip, with the first and the last time, and in a single match also as a small number beside the marker.
- The sidebar, in the 320 px column the page grid has reserved since Phase 3 (moved here from Phase 5):
  - **Matches:** "All matches" or one match; a box to find a match by typing its id; every match of the open map, busiest first (most journeys, then most rows), each with its id, day, number of journeys and its bots.
  - **Journeys**, when one match is open: "human 5e3a91c2", "human (no account id)", "bot 1432", each with its fate in words. Choosing one focuses it on the map, so focus also works by keyboard.
  - **Legend:** what is shown ("566 matches, 836 journeys"), then one row per thing drawn with its sample, its count and a switch. Loot starts hidden in the all-matches view and shown in a single match; a choice made by hand stays.
- Hover: the nearest marker within 10 screen pixels gets a ring and a tooltip with the event, who, the time into the match, world x and z, and elevation; a death says how. With no marker near, the nearest path within 6 pixels says who and when. Click focuses the journey under the pointer and dims the rest; a click on empty map or Esc clears. A drag is still a drag.
- Human or bot comes from the journey's `actor`, marker kinds from the manifest's `event_groups`, a fate's wording from its own text; no event name or id pattern is repeated in the app. The decoder of an elevation code comes back into `projection.ts` with the tooltip, tested against the fixture's elevation codes (it left in Phase 3, where nothing used it).
- A map's journeys load when its tab is first opened. If they fail, the sidebar says so with "Try again" and the map stays usable. A bundle this version cannot read is refused like the manifest.

**Files**

```
web/src/lib/journeys.ts            types of a journey; parseBundle with its refusals
web/src/lib/drawList.ts            paths to the death row, collapsed markers, heads, legend counts
web/src/lib/pick.ts                nearest marker and nearest path
web/src/lib/matches.ts             the matches of a map, busiest first, found by typed id
web/src/lib/labels.ts              who, fate, event and time as text
web/src/lib/markerShapes.ts        the shapes, shared by canvas and legend
web/src/lib/projection.ts          the elevation decoder comes back, with its fixture test
web/src/data/fetchBundle.ts        fetch and check of a map's journeys
web/src/state/store.ts             journeys per map, open match, switches, focus
web/src/components/mapSurface.ts   a list of layers; hover and click
web/src/components/layers/         minimapLayer.ts, journeysLayer.ts
web/src/components/                Sidebar, MatchList, JourneyList, Legend, MapTooltip
```

**How it works**
- The draw list (`drawList.ts`, pure) is everything the map and the legend need for the open match and the switches: each path as its rows up to and including the death row with its points in image pixels, the markers with their counts, and the legend's numbers. It is built once per change of match or switch.
- A second canvas above the minimap draws it. Paths are built once per draw list as shapes in image pixels and drawn under the view's transform, so panning and zooming rebuild nothing. Markers and heads are drawn at screen size each frame. The surface holds a list of layers, one canvas and one draw function each.
- Picking (`pick.ts`, pure) works in image pixels with the reach divided by the scale, so it means the same number of screen pixels at every zoom.
- Hover stays inside the map surface and reaches React only when the hovered thing changes. The open match, the switches and the focused journey are in the store.
- The canvas and the legend draw markers from the same shape definitions. On the canvas a marker is drawn once, with its outline, and then stamped wherever it is needed.
- The ring around what is under the pointer has a canvas of its own, so a pointer that moves redraws no journey.

**Acceptance**, on three named matches: `fbbc5d02` (16 journeys, one of them anonymous), `a476eb57` (one journey, 218 rows), `5a081fe4` (ends in a storm death)
- For each journey the path's points are its rows up to and including its death row: every row holds where its owner stood ([DATA_FORMAT.md](DATA_FORMAT.md)). A journey with a death therefore ends at the death's position (unit test on the function that builds draw lists).
- Per marker type, the counts shown add up to the manifest entry of the match: kill markers = kills + bot kills, death markers = deaths + bot deaths. A unit test checks this for all 796 matches on the committed files. In the browser the legend reads: `fbbc5d02` 2 humans, 14 bots, 5 kills, 8 deaths, 7 loot; `a476eb57` 1 human, 10 kills, 58 loot; `5a081fe4` 4 kills, 1 storm death, 37 loot.
- In a greyscale screenshot of `fbbc5d02`, humans, bots and each marker type can still be told apart. If the loot square and the bot's square head cannot, loot becomes a ring. Checked on 23 Nov: they could not, so loot is a ring; every kind now differs by its form (solid or dashed line, disc or square head, triangle, cross, diamond, ring).
- Hover picks the nearest marker within 10 screen pixels (unit test).
- Redrawing the journeys of Ambrose Valley, all matches, takes under 16 ms on the development machine; the reading is written into PROGRESS.md. Read on 23 Nov: 4.7 to 8.8 ms with the default switches; with loot switched on by hand 25 ms at fit and 10 to 12 ms from a zoom of 1.5.

**Verify locally:** open the three matches and compare the legend counts with `manifest.json`.

## Phase 5: Filters and URL state (1 h)

**Goal:** every view is reachable and shareable. The detailed plan below was approved on 23 Nov 2026; it is built on the branch `phase-5-filters`.

**Deliverables**
- Filters, a new part at the top of the sidebar (its frame, the match list, the two views and the legend's switches exist since Phase 4):
  - Days: five chips, "10 Feb" to "14 Feb", labelled "Days (UTC)", with "partial" on 14 Feb. None chosen means all days. The chips narrow the match list and the all-matches view.
  - Should 3, fates: one chip per fate of the data, in words. None chosen means all. The filter works on journeys, humans and bots alike; a journey's markers go with it.
  - "Clear filters", shown while a filter is set. Filters always hold: a filter that excludes the open match closes it.
- Each map tab shows the number of matches the day filter leaves on that map; the match list's "All matches" and the legend's "N matches, M journeys" follow the filters.
- The view lives in the URL: `map`, `days`, `match`, `journey` (the focused journey's id), `show` and `hide` (the switches set by hand), `fate`, and `view` (the open map's point and zoom). There is no `mode`: a link with a match shows that match. Every part is left out at its default, so the bare address is the default view. The address is rewritten in place, 300 ms after the last change, so Back and Forward leave the tool. Numbers are rounded: the point to a tenth of an image pixel, the zoom to a thousandth. Phase 6 adds `t`, Phase 7 adds `heat`.
- On opening a link, whatever the data does not have is dropped quietly and the rest is kept.
- "Copy link" at the right end of the top bar: it copies the address of the current view and says "Link copied" for two seconds; if the browser refuses, it says to copy the address from the address bar.
- Nothing to show: when the filters leave no journey on the open map, a note over the map says so in plain words ("No journey on Lockdown has the fate “killed by player”."), with "Clear filters". The map stays visible.
- First visit lands on Ambrose Valley, all matches (the traffic heatmap joins in Phase 7).

**Files**

```
web/src/lib/link.ts            the link's state, encodeLink, decodeLink, checkedLink
web/src/lib/filters.ts         the matches of a map on the chosen days, the counts for the tabs, the wording of the empty note
web/src/lib/drawList.ts        takes the matches the day filter leaves and the chosen fates
web/src/state/store.ts         days, fates, their toggles, "clear filters", applying a link
web/src/state/shown.ts         derives the allowed matches
web/src/state/linkSync.ts      reads the address once, then writes the state into it
web/src/components/            Filters, CopyLink, EmptyNote; MatchList, MapTabs, TopBar, Sidebar and App change a little
```

**Acceptance**
- Encoding the state to a URL and decoding it returns the same state (unit test, extended in Phases 6 and 7). The test includes the match ids `03359228` and `5e373986`, which look like numbers and must stay text. A canonical link decodes and encodes to the same text.
- A link from outside: an unknown map, day, match, fate or switch, a match of another map or outside the chosen days, and a broken view are each dropped while the rest is kept (unit test).
- Selecting each day alone lists 284, 201, 162, 112 and 37 matches; each map alone lists 566, 171 and 59; Ambrose Valley per day 199, 138, 127, 78 and 24 (unit test on the selector, against the manifest). The day filter uses a match's `day`, never the date of its `start`: `e325a53a` starts at 23:58 UTC on 9 Feb and belongs to February_10.
- A combination with no data shows an explanation, not a blank map: Lockdown has no journey killed by a player (unit test on the draw list and on the note's wording; checked in the browser).
- In the browser: after a reload the view is the same, and a copied link opens the same view in a second tab.

**Verify locally:** change filters, reload, paste the URL into a private window.

## Phase 6: Timeline and playback (1.5 h)

**Goal:** watch a match unfold smoothly. The detailed plan below was approved on 24 Nov 2026; it is built on the branch `phase-6-timeline`.

**Deliverables**
- A bar under the map, in the map's column: Play and Pause, the time (`2:05 / 8:43`), a slider, and the speed (1x, 2x, 5x, 10x, 20x, 60x; 10x at first, which plays a median match of 380 s in 38 s).
- The whole match is the resting state: opening a match shows everything, as before, with the timeline at its end. Play at the end starts again from 0:00.
- While the time is before the end, each path is drawn up to the time and its head moves along it. A journey is not on the map before its first row. A marker appears at the second of its event; a marker that stands for several events counts those that have happened. Only what is drawn can be pointed at.
- Position at a time (assumption A6; rule 4 of [DATA_FORMAT.md](DATA_FORMAT.md)): the head moves along the journey's path, whose points are all its rows up to the death row. It moves in a straight line across a gap of up to 5 s; across a longer gap it holds still and moves during the last 5 s; after the last point it stays put; of two rows in the same second the later one counts. The pipeline has the reference implementation, a small pure function (`pipeline/playback.py`), and writes a fixture of journeys with the expected heads; the TypeScript function is tested against every one of them.
- At the slider's track, one mark per kind and second in which something happened to the journeys that are drawn, in the colours of the map, following the legend's switches: kills and loot stand on the track, deaths hang below it. The thumb is the time needle.
- The clock lives outside React, in a plain Zustand store (`time`, `end`, `playing`, `speed`). It runs on `requestAnimationFrame` only while playing and follows the open match: a new match resets it to the end, paused. A frame never counts for more than 100 ms of real time, and playback pauses when the tab is hidden, so coming back to the tab never jumps ahead. Nothing in React renders per frame: the slider and the time are written straight into the page, as the map's read-out is, and the map is drawn in the clock's own frame, so each frame shows one time.
- Keys: Space plays and pauses while the focus is on the map or on the slider. On the map the arrow keys keep moving the map, as reviewed in Phase 3. On the slider, left and right step 5 s (one recorded step), with Shift 1 s, Page Up and Page Down 60 s, Home and End jump to the start and the end. Dragging the slider pauses. The Play button's title reads "Play/Pause (Space when the map or timeline is focused)"; the slider's keys are in its title and in the key help that assistive technology reads, since the tool has no visible key help.
- `t` joins the address, after `match`, to a tenth of a second, and only when the time is not the end. A link opens paused; speed is not part of a link. The address is rewritten after a pause or a seek, never while playing, and always in place (`replaceState`, never `pushState`). History entries for the user's steps are a Phase 8 item; until then Back and Forward leave the tool.
- Single match only: in the all-matches view the bar says "Open a match to play it back." Should 5 (all-matches playback) and Could 2 (density strip) are not built in this phase: by the scope ladder Should 1 and 2, which belong to Phase 7, come first.

**Files**

```
pipeline/playback.py                         head_at, the reference; the fixture's cases
pipeline/build_data.py                       writes web/src/lib/__fixtures__/playback.json with the projection fixture
web/src/lib/playback.ts                      headAt, the heads of a draw list at a time, a marker's count at a time, the clock's step, the slider's ticks and keys
web/src/lib/drawList.ts                      a marker keeps the times of its events
web/src/lib/pick.ts                          picks only what has happened by the time
web/src/lib/link.ts                          t
web/src/lib/mapKeys.ts                       Space
web/src/state/playback.ts                    the clock
web/src/state/linkSync.ts, shown.ts          t in the address
web/src/components/Timeline.tsx              the bar
web/src/components/layers/journeysLayer.ts   draws the moment
web/src/components/                          mapSurface, MapView and App change a little; the slider's look is in styles.css
```

**Acceptance**
- Unit tests of position-at-time, from the pipeline's fixture: a 5 s step, a long gap, a death long after the last sample, two rows in the same second, a journey that is not on the map at 0:00, and a journey with one row. The first five are real journeys, the shortest that show each case; the last is made up and marked so, since no path in the data has a single row (0 of 1,242).
- The scrubber's end equals the manifest's observed span for the three named matches: 523 s for `fbbc5d02`, 780 s for `a476eb57`, 878 s for `5a081fe4`.
- No React render per frame. Frame time under 16 ms while playing `fbbc5d02` at 20x for 10 s, and the same for `d0a38c30` on Lockdown: `fbbc5d02` is itself the match with the most journeys (16), `d0a38c30` has the most rows (1,216, in 15 journeys). The reading is taken from the page itself (the time between frames, the time per draw and a count of React commits), not in Chrome's Performance panel, and is written into PROGRESS.md.
- Scrubbing to a death shows the death marker at the head of that path.
- The clock's step is clamped to 100 ms of real time, and playback pauses when the tab is hidden (unit tests).
- [DATA_NOTES.md](DATA_NOTES.md) records the long-gap rule (A6) and the journey of one row as assumptions, for ARCHITECTURE.md.

**Verify locally:** play `fbbc5d02` at 1x and 60x; scrub hard; pause in the middle and reload.

## Phase 7: Heatmaps (1.5 h)

**Goal:** answer "where" questions for a whole map at once. The detailed plan below was approved on 24 Nov 2026; it is built on the branch `phase-7-heatmaps`.

**Deliverables**
- One heat layer at a time: Traffic, Kills, Deaths or Loot (Should 2), chosen with a row of buttons at the top of the sidebar, above the filters, where it is easy to find. None is on at first, so the bare address stays the view it was.
- What feeds it: the journeys that are drawn. So the heat follows the map, the days, the fates, the open match and the switches for humans and bots; there is no second switch. Its kinds stand for event groups of the manifest: `movement`, `kill`, `death` with `storm_death`, and `loot`. Deaths include storm deaths, and the legend says how many ("incl. 39 storm deaths").
- Cells of 10 x 10 world units (90 x 90 on Ambrose Valley, 58 x 58 on Grand Rift, 100 x 100 on Lockdown), smoothed once. One colour per layer, taken from the tokens: traffic teal, kills yellow, deaths vermilion, loot green. The strength of the colour says how much, on a square-root scale.
- A legend with the real numbers: the rows counted, the matches behind them, the largest count in a cell and the cell's size. It says exactly what the layer counts and where: kills of players and of bots at the killer's position, deaths in combat and in the storm where the victim fell, movement samples (not time spent) where the player or bot was, and the count of each event by its name in the data. DATA_NOTES.md has the same as a table.
- While a heat layer is on, the minimap under it is dimmed by about 40%, so that the colour reads clearly. There is no switch for it.
- `heat` joins the address, written in place like the rest.
- The heat lies between the minimap and the journeys and does not follow playback: it shows the whole selection.
- Not built in this phase: the "no recorded path" layer (Should 1), which needs a mask of the map's artwork from the pipeline and a second way of counting, by path segments; the time-spent layer (Could 1); an opacity slider. The traffic layer shows unused areas as cells without colour. For ARCHITECTURE.md, as a trade-off: the ignored-areas layer is not built, since it needs a mask of the playable area; empty traffic cells show the unused areas instead.

**Files**

```
web/src/lib/heat.ts                       the kinds, the grid's size, counting, smoothing, strength, a token colour as numbers, the legend's sentence
web/src/state/store.ts, shown.ts          heat, setHeat; selectHeat builds the grid once per draw list and kind
web/src/lib/link.ts                       heat
web/src/components/layers/heatLayer.ts    paints the grid into a small image and draws it scaled into the map's rectangle
web/src/components/HeatControl.tsx        the buttons and the legend; Sidebar and MapView change a little
```

**Acceptance**
- Before smoothing, the sum of each count grid equals the number of rows that fed it, for every kind on every map; over the three maps the sums equal the manifest's totals (unit tests). Smoothing keeps the total.
- A row at each corner of the map lands in the corner cell, also on Grand Rift, whose image is not square.
- Counting Ambrose Valley with all matches takes under 50 ms on the development machine (a test takes the median of 15 runs; the reading goes into PROGRESS.md).
- In the preview: each layer on each map, and the legend's numbers follow a day filter, a fate filter and the bots switch.

**Review:** no review agents in this phase (the user's decision with the plan: this model's weekly limit stood at 76% with five phases to go). Instead: the grid sums against the manifest's totals, one-line faults put into the new code, and every layer on every map in the preview.

**Verify locally:** switch each layer on, on each map; compare the kill hot spots with `docs/img/overlay_*.jpg`.

## Phase 8: Polish (1 h)

**Deliverables:** an "About the data" panel in plain language (what the README gets wrong, what the tool does about it, what "anonymous" and "no death recorded" mean); loading and error states; visible focus and labels on every sidebar, top-bar and timeline control; a notice on small screens that the tool is built for desktop; a pass over all UI text. From the Phase 3 review: the panel says that the read-out's `x` and `z` are the ground plane and `y` is height; the map's keys are shown where a sighted keyboard user finds them (today they are in the buttons' tooltips and in the text for screen readers); decide whether pinch on a touch screen and Safari's trackpad pinch are supported or named as limits in the desktop notice. From the Phase 4 review: the events of a focused journey as text in the sidebar, so that what a tooltip says can also be reached by keyboard.

**Acceptance:** Lighthouse performance at least 90 on the hosted URL (desktop preset); no console errors; sidebar, top bar and timeline fully usable by keyboard, including choosing a journey from the list.

**Carried over from Phase 5** (the changes its plan was approved with; the note reached the session on 24 Nov, after the merge, and the user set them aside for this phase so that Phase 6 could go on):
- History: `pushState` for discrete changes (map, match, focus, days, fates, switches), `replaceState` for moving, zooming and `t`, so that Back and Forward walk through the views.
- A notice when a filter hides the open match.
- A test that the 8-character match id prefixes are unique.
- Filter chips as `<button>` with `aria-pressed` and focus styles. They are so since Phase 5; to be confirmed here.
- The journey id's format ("-anon", "botNNNN") in a comment and in DATA_NOTES.md.
- The folder-day assumption (`e325a53a` belongs to February_10) in DATA_NOTES.md.

The first, second, third, fifth and sixth were already built and tested when the user set them aside. They wait on the local branch `fix-phase-5-approved-changes` (commits `9a2f0a4` and `8e13ce5`, cut from `phase-6-timeline` at `728ea77`; not pushed, no pull request). Phase 8 takes them from there instead of building them again; the journey id's format still has to go into DATA_NOTES.md.

**The plan as approved (24 Nov 2026), built on the branch `phase-8-polish`.** This model's weekly usage limit stood at 80% with Phases 8 to 11 ahead, so the phase is lean and says what it cuts.

1. The Phase 5 changes come first: history entries for the user's steps (`pushState`); in-place rewrites (`replaceState`) for moving, zooming, the time of playback and what a link or arriving data corrects; Back and Forward open the view of the entry they land on, with its time of playback, paused. Choosing a heat layer is a step too. The notice "Match hidden by your filters — showing all matches". Tests that match and journey ids are unique. The journey id's format in a comment and in DATA_NOTES.md, and the day-folder assumption there (as A10: A9 is the journey of one row).
2. The events of the focused journey as text in the sidebar, so that what a tooltip says can be reached by keyboard.
3. "About the data and the keys", one panel opened from the top bar: what the data is and where it differs from its README, what "no account id" and "no death recorded" mean, that `x` and `z` are the ground plane and `y` is height, what each heat layer counts, the keys of the map and of the time slider, and the limits (a desktop browser, no pinch zoom). A notice on screens narrower than 900 px that the tool is built for desktop.
4. Cut: pinch zoom on touch screens and on Safari's trackpad, which cannot be tried in the preview and is named as a limit; a pass over every UI text.
5. Left to the user, since the browser pane cannot do them: Lighthouse on the hosted URL (at least 90 for performance, desktop preset), the frame-time reading at 60 Hz, one real drag of the time slider, one click on "Copy link".
6. No review agents: one-line faults against the tests, a keyboard pass and a look in the preview. No new dependency, no change to the data files.

If the usage runs short, the order above is the priority: 1 is done first, 2 and 3 are cut from the bottom.

**The scope as the user set it (24 Nov 2026, in a note that reached the session while the phase was being built).** Parts 1 and 3 of the plan above; part 2 is cut. The panel is to be short and plain: the data against its README, what each heat layer counts, the ground plane, the keys, desktop only. The user runs Lighthouse, the reading at 60 Hz, the drag of the slider and the click on "Copy link", and sends the results.

**As built (24 Nov 2026).**

| Part | Built |
|---|---|
| History | A step of the user (a map, a match, a focus, a day, a fate, a switch, a heat layer) adds an entry (`pushState`), at once, after the entry it leaves has been given its last view and time. Moving, zooming, the time of playback, and what a link or arriving data corrects rewrite the entry in place (`replaceState`) after 300 ms. Back and Forward open the view of the entry they land on, at its time of playback, paused |
| Notice | "Match hidden by your filters — showing all matches" over the map for 6 s, or until something else is chosen, when a day or fate filter closes the open match |
| Ids and notes | Tests on both sides that the 796 match ids and the 1,242 journey ids are unique and that a journey id has one of three forms; the forms in a comment and in DATA_NOTES.md; the day-folder rule as assumption A10 |
| Panel | "Data and keys" in the top bar opens the browser's own dialog: four sections and 14 entries, its numbers from the manifest, the heat layers' sentences from their legend, the key help from the code that takes the keys |
| Narrow window | A line above the tool below 900 px; the map tabs scroll sideways there, so the top bar's two buttons stay in view |
| Events of the focused journey as text | **Not built — tooltips cover it** (the user's scope). For the trade-offs in ARCHITECTURE.md: what a tooltip says about a single event can be reached with a pointer only |

| Acceptance criterion | Evidence |
|---|---|
| Lighthouse performance at least 90 on the hosted URL (desktop preset) | Not run in the session: the user runs it and sends the result |
| No console errors | None in the preview on the three maps, with a heat layer, an open match, a focused journey and the panel open. Two errors seen once came from the dev server's hot reload when a source file was removed under it; the page load after it had no failed request |
| Sidebar, top bar and timeline fully usable by keyboard, including choosing a journey from the list | Real Tab presses went through every control in the order of the page, each with a visible focus (the stops are listed in PROGRESS.md, step 8.6); a journey was chosen from the list with Enter; the panel was opened with Enter, scrolled with the arrow keys and closed with Escape, and the focus was back on its button |
| The changes carried over from Phase 5 | All six are in: steps 8.2 and 8.3 for five of them; the fourth (chips as buttons with `aria-pressed` and a visible focus) was confirmed in the keyboard pass |

Checks: 476 Vitest tests, 254 pytest tests, type check and ESLint clean, build 91.57 kB of JavaScript gzipped. 86 one-line faults were put into the new code in five runs (41 for the history code; 11, of which 10 were for the step that was cut; 14 and again 14 for the panel's text, before and after it was shortened; 6 for the last change to the address code). Every one was noticed.

## Phase 9: Deployment (0.5 h, in two steps)

- **9.1, right after the Phase 3 pull request is merged** (before that, `main` has no `web/` folder to build). You create the Vercel project from the GitHub repo with root directory `web` (one-time, in the browser). Production follows `main`, so only merged phases are live; every later pull request gets its own preview link. The URL goes into the repo's About field and, through a one-line pull request, to the top of the README. **Done on 23 Nov:** https://lila-player-journeys-psi.vercel.app. Vercel offered the whole repo as a multi-service project, the Python pipeline next to the app; the `web` folder was imported as a single project with the Vite preset instead. The plain project name was taken, hence the `-psi` in the address.
- **9.2, on Thursday.** The site and three deep links open in a private window; on a phone the page loads and shows the desktop notice. **Checked on 24 Nov**, on the branch of Phase 10: the evidence is in PROGRESS.md, step 9.2.

## Phase 10: Insights and docs (2 h, spread over Wednesday and Thursday)

**Deliverables**
- `analysis/insights.py`: reads the published bundles, the same data the tool draws, and prints every number used in INSIGHTS.md.
- `INSIGHTS.md`: three things learned about the game, each with what caught the eye, the evidence, what to do and which metrics would move, and why a Level Designer should care. Each has a deep link and a screenshot of the tool showing it.
- `ARCHITECTURE.md` finished: stack and why, data flow, the coordinate mapping walked through, assumptions, trade-offs table.
- README: deployed URL at the top, tech stack, "run the app" (no data needed), "rebuild the data" (needs the zip), environment variables: none, and the walkthrough: numbered steps with deep links and screenshots covering C1 to C10.

**Candidate insights.** To be found with the tool, not assumed. Seen so far in the overlay images, not yet measured: kills concentrate in a few zones of each map; parts of each map carry almost no traffic. Measured: storm deaths come only after 10 min 55 s; 43% of identified human journeys record no death. Any kill-zone insight must say that the kills are of bots.

**Acceptance:** every number in INSIGHTS.md is printed by `analysis/insights.py` and visible in the tool at its deep link; ARCHITECTURE.md prints to one A4 page from GitHub's rendered view; each checklist row C1 to C10 has a walkthrough step.

**As the user set Phases 9 and 10 on 24 Nov 2026** (done together on the branch `phase-10-docs`; no review agents, small commits). Step 9.2: confirm that the production URL serves the merged `main`, has no console errors and opens deep links; the URL at the top of the README and in the repo's About field. Phase 10: (1) `analysis/insights.py` computes six to eight candidate findings from the committed data and prints the numbers; the user picks three before INSIGHTS.md is written. (2) INSIGHTS.md: for each of the three, what caught the eye, the evidence (numbers from the script and a deep link into the tool), what to do and which metrics it affects, and why a Level Designer should care. (3) ARCHITECTURE.md on one page: stack and why; the data's way from parquet to the canvas layers; the coordinate mapping walked through; assumptions as "README says / data shows / decision"; trade-offs. (4) README: the live URL first, what the tool does in three lines, tech stack, setup, "Env vars: none", tests, project structure, a walkthrough of numbered steps with deep links and screenshots (Playwright, in `docs/img/walkthrough/`), `docs/media/walkthrough.mp4` recorded and added by the user, links to ARCHITECTURE.md and INSIGHTS.md, and a note that AI tools (Claude Code) were used.

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

## Questions and answers

Answered on 23 Nov 2026 (the plan was approved with the recommended answers):

1. Deadline: Thu 26 Nov, treated as end of day until the hour is known.
2. Scope ladder: as written above.
3. Data format: one bundle per map; heatmaps binned in the browser.
4. Public ids: 8-character prefixes of player and match ids.
5. Map constants: the README's, unchanged.
6. Reviews: one per phase.

Still open, to settle before submission:

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

## Changed after the Phase 2 review (23 Nov 2026), for your review

Three independent reviewers checked Phase 2 (recomputation from the raw files, mutation testing, and a reading as the app's developer). No blocker; the fixes changed these lines of the approved plan.

| Was | Now | Why |
|---|---|---|
| A path's points are the movement rows | They are all rows of the journey up to its death row | Every row holds where its owner stood. A path of movement rows alone ends 2.4 units short of the death marker at the median and 25.6 at most, and Phase 4 asked for both "movement rows only" and "ends at the death" |
| kills = BotKill rows of humans; bots' kills counted nowhere | kills = Kill and BotKill rows of humans; new count: bot kills (170) | "Marker counts add up to the manifest" could not hold: `fbbc5d02` has 0 kills by humans and 5 by bots |
| Per journey: the raw death event | Per journey: a `fate` from a closed list, and an id | "BotKilled" meant "killed by a bot" for a human and "this bot died" for a bot; a link to one journey needs an id |
| Projection test on the 2160×2158 image | On the shipped 2048×2046 image, from integer codes | The app never sees the original image, and it only ever gets integer codes |
| Playback rule written once, in this plan | Reference implementation and fixture in the pipeline (Phase 6) | The rule contradicted itself; one tested function per language, as for the projection |
| A match with files in two day folders stops the build | It is filed under the later folder | A match can end around midnight. After cleaning there is none in this data |
| CI runs `make test` | CI runs pytest directly | Same tests; no virtual environment needed on the runner |
| URL state without a journey | `journey` joins the URL state | Focusing a journey is a view worth sharing |
| Phase 3: double-click resets the view | Double-click zooms in at the pointer; the Fit button and `0` reset | Approved with the Phase 3 plan on 23 Nov. It is what web maps do, an accidental double-click should not lose the place, and Phase 4 puts click-to-focus on the same surface |
| Phase 3: the map is fitted to the screen | The artwork inside the image is fitted; the pipeline writes its box into the manifest | Approved with the Phase 3 plan. The artwork fills only part of each image: fitting it draws the maps 10%, 46% and 16% larger |
| Every commit pushed to `main` | From Phase 3: one branch and one pull request per phase, merged by you after review; Vercel production follows `main` | Your decision on 23 Nov. Once the site is hosted, `main` is what the reviewers see, so it should hold reviewed work only |

## Changed after the Phase 3 review (23 Nov 2026), for your review

Two independent reviewers checked Phase 3. One drove the app in a real browser and tested the view maths (12,000 random zooms, 9,000 pans, 63 one-line faults put into the code). One read the code for quality and accessibility. No blocker; 7 findings to fix and 25 small ones, several raised by both. All are fixed except the rows of the second table.

| Was | Now | Why |
|---|---|---|
| The map's keys act while the map has the focus | They act while the focus is on the map or on one of its buttons | A click on Zoom in moved the focus to the button, and the `+` its tooltip names did nothing |
| One error message: "Check your connection and try again." | A data file this version cannot read says so and offers Reload; a fault in the page shows a message, not an empty page; the reason is written to the console | A retry cannot repair a file the app refuses, and nobody could see what was refused |
| "Try again" left the page while it ran | It stays in place; when the retry works, the focus goes to the map | The keyboard focus fell back to the top of the page on every try |
| The manifest check looked at kinds only | It also refuses a size or scale of zero, an artwork box outside its image, two maps with one id, an event code that stands for no event | These would draw a wrong or empty map without an error |
| The read-out showed "—" until the pointer moved | It shows the position after a wheel turn or a press as well | A mouse resting on the map, and every tap, read "—" |
| A drag ended only on release | It also ends when the button is no longer held or the capture is lost; a second finger does not take it over; the closed hand shows only once the map moves | The map could stay glued to the pointer; on a fitted map the hand closed and nothing moved |
| Every pointer move redrew the canvas | Only a changed view or size does | Phases 4 and 7 stack more layers on the same view |
| The tabs took Left and Right with any modifier | Keys held with Ctrl, Cmd or Alt stay the browser's | Alt+Left is Back on Windows and Linux |
| Tests in `web/src/lib/` only (111) | The read-out's chain from pointer to world units, the key table and the zoom limits are pure functions with tests; the store has a test file (196 tests) | A swapped axis in the read-out or a reversed arrow key left the checks green. 25 one-line faults, the reviewers' among them, are now all noticed |
| `eslint .` | `eslint . --max-warnings 0` | A missing effect dependency is only a warning |
| Read-out panel 216 by 54 | 216 by 56 | The measured size |

Left as it is:

| Finding | Decision | Why |
|---|---|---|
| Turn on `noUncheckedIndexedAccess` | Stays off | Phases 4 to 7 read typed arrays in tight loops, where every read would need a fallback that hides a fault instead of catching it. The manifest's shape is checked where it enters the app |
| Keep the minimap images out of the store | They stay | Nothing serialises the store; the URL of Phase 5 takes chosen fields |
| Pinch on a touch screen, Safari's trackpad pinch | Not handled; decided in Phase 8 | Neither can be tried in the preview pane, and nothing ships untested. Wheel, drag, double-click, keys and buttons cover a desktop |
| Label the read-out as world x and z on the ground plane | In the "About the data" panel (Phase 8) | The panel stays two short rows; `y` is height in this game's data |
| A unit test for `mapSurface.ts` | None | It needs a DOM test library, a new dependency. Its logic moved to `web/src/lib/`; the events and the drawing were checked in the preview with real clicks and keys |
| The guard in `scaleBar` for `Math.log10` landing just under a whole number | Kept, without a test | No input reaches it in this JavaScript engine; another engine may round differently |
| The elevation decoder had no caller in the app | Removed until Phase 4 | It returns with the tooltip that shows elevation |
| The `@v7` versions of the GitHub actions | Proven by the first run on the pull request | The versions were looked up on 23 Nov; only a run can confirm them |

## Changed with the Phase 4 plan (23 Nov 2026, approved in plan mode)

| Was | Now | Why |
|---|---|---|
| The sidebar arrives in Phase 5 | It arrives in Phase 4 with the match list, the journeys of the open match and the legend | Phase 4 needs a way to open one match and a place for the legend. A temporary picker would be thrown away, and the project allows no placeholder UI |
| Only the loot switch in Phase 4; the other switches in Phase 5 | Every legend row is a switch in Phase 4 | The same few lines of code |
| Phase 5: match list, the two views and the switches | Phase 5 keeps the day filter, the fate filter, the counts on the map tabs, the state in the URL, "copy link" and the empty states | They moved to Phase 4 |
| Hover on markers | Hover also on a path: who and when | A path without a marker near it would say nothing |
| All map bundles loaded at the start | A map's journeys load when its tab is first opened | 686 kB gzipped in total, most of it never looked at |
| A review like Phase 3's | Two agents with a fixed budget, about a third of it | The Phase 3 review took 40% of a usage window |
| Loot as a small square | Loot as a small ring | The greyscale check of the acceptance: a square could not be told from a bot's square head |
| Markers at one size | At 70% of it while all matches are open | At full size the 1,772 kill markers of Ambrose Valley hid the paths |
| Markers drawn as shapes on every frame | Drawn once and stamped; the hover ring on a canvas of its own | With loot switched on, 8,988 markers took 28 ms a frame, and every move of the pointer redrew them |

## Changed after the Phase 4 review (23 Nov 2026), for your review

Two independent reviewers checked Phase 4, each held to 40 tool calls: one in a real browser against the data, one on code quality, accessibility and the strength of the tests. No blocker. 6 findings to fix and 9 small ones, several raised by both. The review took about half of what the Phase 3 review did.

What held, as the reviewers measured it: the legend equals the manifest for all three maps and seven matches; marker positions on the non-square Grand Rift map agree with a computation by hand to 0.01 px; every path ends at its death row; picking agrees with an independent computation in 36 probes at two zooms; the default view of Ambrose Valley redraws in 2.5 to 4.4 ms; 11 of 12 one-line faults of the reviewer's own were noticed by the tests.

| Was | Now | Why |
|---|---|---|
| One marker for identical events of a journey in the same second at the same spot | One marker for the events of one kind that a journey has at one spot, with their count and their first and last time | Markers at one spot in different seconds lay exactly on top of each other: 1,522 of 14,747, about a tenth, could never be hovered, and the map showed one marker where the legend counted several. **This changes a rule of the approved plan** |
| Of two markers at one spot the tooltip named the later row | It names the one drawn on top | A kill over a loot read "Loot" |
| The tooltip opened to the right unless within 260 px of the edge | It opens toward the middle of the map | Tooltips are up to 303 px wide and were cut off |
| A double-click cleared or changed the focus | It zooms and leaves the focus as it was | Its two clicks each counted as a click |
| Every match was a stop for the Tab key | Each list is one stop; the arrow keys, Home and End move inside it | Up to 566 presses of Tab lay between the search box and the legend |
| The journey list offered journeys that are hidden | It lists the drawn ones; hiding humans or bots clears the focus | The focus could point at a journey that is not drawn |
| The legend repeated the canvas's stroke sizes | One set of sizes for both | They could drift apart |
| The first map's journeys waited for its minimap | Both are fetched at once | There was no reason to wait |
| No test for a change of match alone | A test opens one match after another | Removing the match from the draw list's memo left every test green |

Left as it is:

| Finding | Decision | Why |
|---|---|---|
| What a tooltip says has no way in by keyboard | Phase 8 | The journey list gives who and fate; a journey's events as text belong with the keyboard pass of Phase 8 |
| With loot switched on by hand, all matches of Ambrose Valley redraw in 14 to 25 ms at fit | Left | The default view takes 2.5 to 9 ms; a moving pointer no longer redraws journeys; only zooming at fit with loot on is slower than a frame |
| Hiding humans or bots clears the focus even when the focused journey is of the other kind | Left | One click brings the focus back; telling the kinds apart would need a search through the journeys in the store |

## Changed after the Phase 5 review (23 Nov 2026), for your review

Two independent reviewers checked Phase 5, each held to 40 tool calls (51 used together): one in a real browser against the data, one on code quality, accessibility and the strength of the tests. No blocker; 6 findings to fix and 7 small ones, several raised by both.

What held, as the reviewers measured it: the tabs, the match list and the legend equal the manifest for three choices of days on all three maps; the fate filter's counts equal the bundles; five views built by hand came back the same after a reload; eleven odd links were handled as promised and the ids `03359228` and `5e373986` stayed text; 40 wheel events gave one rewrite of the address, 302 ms after the last, and no history entry.

| Was | Now | Why |
|---|---|---|
| With a fate chosen, the list still offered every match of the chosen days | The list offers only the matches the filters leave, and the store refuses one they rule out | A match without a journey of the chosen fate could be opened; it was empty, the note said something false about the whole map, and a reload showed another view |
| A focus from a link was kept when its journey exists | It is kept only when its journey is drawn | A journey hidden by a filter or a switch stayed in the address and lit up when the filters were cleared |
| Any three numbers were a view | A view from a link has to be closer than fit, at most 64 times, and centred on the image | `view=1024,1024,0` and `view=-1e9,1e12,9999` stayed in the address although the screen showed something else |
| A switch put back to shown stayed in the address as `show=` | It is forgotten; only loot is kept, since it follows the view | The plan says every part is left out at its default |
| "Clear filters" took the keyboard focus with it | The focus goes to the filters, or from the note to the map | Both buttons remove themselves when pressed |
| A tab read "Ambrose Valley566", the last day "14 Febpartial" | The tab is named "Ambrose Valley, 566 matches"; a real space before "partial" | A margin is not a space for a screen reader |
| The empty note was a status element that appeared with its button inside | The sentence sits in a status element that is always on the page; the button is outside it | Such a region is announced unreliably |
| No test for the address sync or for what happens when a link's journeys arrive | Both are tested | 6 of a reviewer's 12 one-line faults had slipped through there |

After the fixes I checked them once more:

- Of eight one-line faults put into the fixed lines, the tests noticed six. Two tests were added: a view at fit is no view, and the journeys of a map that is not open leave the focus alone, also when they arrive before the open map's own. Both faults are noticed now; the app has 347 tests.
- Looking at the fixes in the preview showed two faults in the first row above, which made the list follow the fate filter. Both are fixed:

| Was | Now | Why |
|---|---|---|
| With no match left, the list said "No match id contains “”." | "No match on Lockdown passes the filters."; the search box is blamed only when there was something to search | Before the list followed the fate filter, only a search could empty it |
| The button above the list read "All 566 matches" | "All matches (566)" | With one match left it read "All 1 matches" |

Left as it is: a reload within 300 ms of a change loses that change (the price of not rewriting the address on every frame); the wording of the note follows the fate's own text ("has the fate “killed by player”") rather than the plan's first sentence, which PLAN.md now quotes as built.

## Changed while building Phase 6 (24 Nov 2026), for your review

The independent review is still to come; what it changes gets a section of its own.

| Plan | Built | Why |
|---|---|---|
| The time reads `02:05 / 08:43` | `2:05 / 8:43` | It is written as the tooltip writes a time, which has no leading zero |
| One tick per event above the slider's track | One mark per kind and second in which something happened | The 58 loot events of one journey would be a block. `fbbc5d02` has 19 marks |
| A dragged time is kept to a tenth of a second | A dragged time is a whole second; the keys, a pause and a link keep tenths | Events are recorded in whole seconds, so a dragged time lands where something can have happened |
| A marker keeps the times of its events in place of `last` | It keeps `count` as well | `count` is the length of `times`; the legend, the layer and the tests read it |
| The clock starts counting with Play | The first frame after Play counts for no time and only sets the moment to count from | The clock then needs no second clock to start by, and neither do its tests |
| Frame time under 16 ms, read from the page | Shown for the work per frame: a draw takes 0.7 ms at most and React commits nothing while a match plays. The time between frames was 33 ms | The browser pane shows about 30 frames a second, whatever the page does. A reading at 60 Hz is still to take |
| The slider's keys shown where key help exists | They are in the slider's title and in a description for assistive technology | The tool has no visible key help |
| Back and Forward step between matches and filters, not between pauses | Back and Forward leave the tool, as since Phase 5; `t` is written in place like everything else | The history entries for the user's steps are set aside for Phase 8, where the built work waits (see "Phase 8") |

What the fault check found: of thirty one-line faults put into the new code, the tests noticed 27. Two were real gaps and have a test each now (Play pressed twice must not start a second clock; a tab that stays shown must not pause). The third changes nothing that can be observed.

## Changed after the Phase 6 review (24 Nov 2026), for your review

Two independent reviewers checked Phase 6, each held to 40 tool calls (49 used together): one in a real browser against the data, one on the code, the accessibility of the timeline and the strength of the tests. No blocker; 4 findings to fix and 12 small ones.

What held, as the reviewers measured it:

- The app's head positions equal a computation written afresh from rule 4, in Python, for 1,094,028 heads of all 1,242 journeys on a grid of 0.5 s, and for 170,291 heads of five matches on a grid of 0.1 s: the same journeys on the map, the same rows, positions within 0.005 px.
- All 13,247 markers appear in the second of their first event, with the right count at every time.
- On the canvas every head and every marker that has happened is painted at the predicted pixel, and none that is still to come; a path is painted up to its head and no further.
- The slider's end equals the manifest's span: 523, 780 and 878. No match has a span under 13 s, and the shortest plays and stops cleanly at 60x.
- The address is not rewritten while a match plays (0 calls in 3 s), once 302 ms after the pause, and `pushState` is never called. Links with `t` survive a reload; a time past the span, before the start or not a number is dropped.
- The console of a fresh tab has no error and no warning.

| Was | Now | Why |
|---|---|---|
| The rules of a drawn moment (which markers, which counts, how far a path can be pointed at) were lines of the canvas layer | One pure function, `momentAt` in `lib/playback.ts`, with tests; the layer draws what it says | Three one-line faults in the layer passed all tests |
| A head between two rows, and the line just behind it, could not be pointed at or clicked, and a click there dropped the focus | Picking takes the heads: the stretch a head is on answers with the row the head has left | Over a whole match the head was further than the pointer's reach from the line that could be picked in 14% of the samples |
| The slider and the time showed the clock's time, the map the time of the frame before | The map is drawn in the clock's own frame | At 60x the map was 0.96 s of the match behind the slider in every frame |
| The slider's key help said "5 seconds" as a literal | It is built from the manifest's sample step, by `sliderKeysHelp` | Working rule 7: the app repeats nothing that the manifest holds |
| A Space held down flipped play and pause with every key repeat | It plays or pauses once; held arrows go on stepping | It ended in whichever state the last repeat hit |
| A pause from inside a frame left a frame waiting | The clock asks for the next frame only while it still plays | A trap for the next listener; nothing did it yet |
| All marks stood on the track, a kill's over a death's of the same second | Deaths hang below the track; kills and loot stand on it | 77 of 716 death marks share their second with a kill mark |
| What assistive technology is told about the time changed with every second of the match | It is written when the time comes to rest | At 10x a screen reader would be told ten times a second |
| The track had the border colour: 1.3 to 1 against the bar | The colour of muted text: 6.7 to 1 | The track shows how far the slider reaches |
| The heads of a draw list were tested on a match without a row after a death | Tested on `de7378ae`, where a kill is recorded 5 s after the death | Passing every row instead of the path went unnoticed |
| Rule 4 of DATA_FORMAT.md did not say what two rows in one second do | It does: the later one counts | Both implementations did it; the contract did not say so |
| No test for a clock that is started late, for a blank `t`, for a death exactly one step after the last sample | One each | Three of the reviewer's faults passed there |

The tests had noticed one of the reviewer's twelve one-line faults. They notice eight now, and ten more of mine: 18 of 18 in the code that tests can reach. The four that still pass are lines of components that only a browser reaches: the layer drawing the moment it is given (two faults), a press on the slider pausing, and Space on one of the map's buttons. Each was checked in the preview, by the reviewer with real key presses and clicks.

Left as it is:

- Coming back to a map opens its match whole again: the paused time is not kept per map. The rule stays that a match starts whole, whichever way it is opened.
- The frame-time reading at 60 Hz is still missing. The browser pane shows about 30 frames a second, and the reviewer found it slower still.
- The reviewer's tool did not complete a real drag of the slider with the pointer. A real click on the track and a value set by script do what they should.
- In the dev server only: after a hot update of the clock's modules the bar says "Open a match to play it back." until the page is reloaded.

## Changed while building Phase 7 (24 Nov 2026), for your review

No review agents ran in this phase, as approved. In their place:

- **Sums against the data.** Before smoothing each grid sums to the rows that fed it, for every kind on every map. Over the three maps the layers count 72,643 movement samples, 2,406 kills, 739 deaths of which 39 in the storm, and 12,829 loot events: the manifest's totals, event by event. In the preview the legends of the three maps add up to the same: deaths 504 + 52 + 183, storm deaths 17 + 5 + 17.
- **Faults.** Twenty one-line faults were put into the new code, one at a time. The tests noticed all twenty.
- **Preview.** Every layer on Ambrose Valley, deaths and loot on Grand Rift, traffic and deaths on Lockdown. Without bots the traffic layer reads "BotPosition 0"; on 14 Feb it counts 24 matches; with the fate "killed by storm" the deaths are 17, all in the storm. A reload keeps the layer, switching it off leaves nothing painted, and the console has no error. The dim is 40%: alpha 102 of 255 on 1.47 million pixels of the map. Counting Ambrose Valley with all matches takes 1.7 ms at the median.

| Plan | Built | Why |
|---|---|---|
| A Vitest benchmark for the 50 ms criterion | A test that takes the median of 15 runs and expects less than 50 ms | This version of Vitest has no `bench()` |
| The legend gives the rows, the matches and the largest cell | It also lists the rows of each event by its name in the data, for example "Kill 0 · BotKill 1,789" | It answers from the data whether Kills includes kills of bots: every kill that is left is one |
| The sidebar's sections stay in view | The sidebar scrolls when it is taller than the window; the match list may shrink to 128 px and the list of journeys keeps at least 96 px | With a heat legend and a match open the sections need 838 px, more than a window of 800 px has |

Left as it is:

- The layer's painting has no unit test, as no canvas code has; what it paints was read back as pixels in the preview.
- The colour is drawn from the smoothed counts, while the legend's fullest cell is the count before smoothing.
- The kill hot spots were not compared with `docs/img/overlay_*.jpg` one by one; one match was looked at.
- Lockdown's map had not appeared 10 s after a reload in the hidden preview pane, so its heat was seen after a switch of tabs, not after the reload. The legend was right both times.

## Changed while building Phase 8 (24 Nov 2026), for your review

| Plan | Built | Why |
|---|---|---|
| `popstate` calls `applyLink` and a new `restoreTime` | No `restoreTime`: `applyLink` keeps the link as `asked`, and the clock's follower gives the time of every newly asked link to its match, paused | It is how the link the page was opened with already got its time: one path, checked in one place |
| (not in the plan) | A link's time goes to the match of that link only | Started late, the follower could give a link's time to a match that was opened by hand |
| (not in the plan) | A write to the history that the browser refuses is caught and logged as a warning | Safari allows 100 writes in 30 s and throws. Thrown inside the store's listener, it would stop the step that caused it |
| A step adds an entry | A step that changes nothing in the address, as a click on the empty map, adds no entry and writes nothing by itself | There is nothing to step back to |
| The address is left alone while a match plays (Phase 6) | The passing of time is still not written. A step taken while a match plays is written at once, with the moment | A step has to become an entry when it is taken |
| The events of the focused journey as text | Not built — tooltips cover it. It was built first (`f2b9919`) and taken out again (`7ddddbc`) when the user's scope note reached the session; reverting `7ddddbc` would bring it back | The user's scope for the phase |
| A panel with the data, its terms, the heat layers, the keys, the address and the limits | Shorter: the data against its README, the ground plane, what each heat layer counts, the keys, desktop only. 14 entries instead of 20 | The user's scope for the phase |
| (not in the plan) | Two sentences of the heat legend reworded: "Each movement sample is counted…", "Each loot event is counted…" | The panel shows them without the numbers before them, where "Each is counted" said too little |
| (not in the plan) | The map tabs scroll sideways in a narrow window | With a second button in the top bar, "Data and keys" was cut off at 800 px |
| (not in the plan) | The map's key help is one text (`MAP_HELP` in `lib/mapKeys.ts`), for the map's description and for the panel | No second wording |

Left as it is:

- A double-click whose first click changes the focus leaves one history entry; Back then undoes its zoom.
- Back and Forward do not show the notice about a closed match.
- A move of the map that was not yet written when Back was pressed is dropped: it belonged to the entry that was left.
- The panel needs 988 px at a window height of 800 and scrolls there, with the keys too.
- Not verified in the session, as agreed: Lighthouse, the frame-time reading at 60 Hz, a real drag of the time slider, a click on "Copy link". Pinch zoom is not built, and the panel says so. No pass over every UI text was made.
