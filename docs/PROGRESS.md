# Progress Log

Last updated: 2026-11-24 00:58 IST

## Current phase

Phase 6, Timeline and playback. Status: **IN PROGRESS** on the branch `phase-6-timeline` (plan approved; no pull request yet).

Phases 1 to 5 and step 9.1 are merged: pull requests [#1](https://github.com/YesudasZ/lila-player-journeys/pull/1) (Phase 3), [#2](https://github.com/YesudasZ/lila-player-journeys/pull/2) (step 9.1), [#3](https://github.com/YesudasZ/lila-player-journeys/pull/3) (Phase 4) and [#4](https://github.com/YesudasZ/lila-player-journeys/pull/4) (Phase 5) were reviewed and merged by the user, the last one on 23 Nov, 23:54 IST. The tool is live at https://lila-player-journeys-psi.vercel.app and shows Phase 5; production on Vercel follows `main`.

Repo: https://github.com/YesudasZ/lila-player-journeys (public).

## Phase checklist

| # | Phase | Status | Commit or pull request |
|---|---|---|---|
| 1 | Data discovery and repo setup | APPROVED | `bc63f0e` |
| 2 | Pipeline | APPROVED | `ccc2369` |
| 3 | App shell and map canvas (ends with the first deployment, step 9.1) | APPROVED (merged and hosted) | pull request [#1](https://github.com/YesudasZ/lila-player-journeys/pull/1) |
| 4 | Journeys, humans versus bots, markers | APPROVED (merged) | pull request [#3](https://github.com/YesudasZ/lila-player-journeys/pull/3) |
| 5 | Filters and URL state | APPROVED (merged) | pull request [#4](https://github.com/YesudasZ/lila-player-journeys/pull/4) |
| 6 | Timeline and playback | IN PROGRESS | branch `phase-6-timeline` |
| 7 | Heatmaps | NOT STARTED | |
| 8 | Polish | NOT STARTED | |
| 9 | Deployment (9.1 after Phase 3, 9.2 on the last day) | 9.1 APPROVED (merged); 9.2 on the last day | pull request [#2](https://github.com/YesudasZ/lila-player-journeys/pull/2) |
| 10 | Insights and docs | NOT STARTED | |
| 11 | Final QA | NOT STARTED | |

[PLAN.md](PLAN.md) was approved by the user on 2026-11-23. Phase 2 was approved with the user's go for Phase 3 the same day, the changed plan lines included.

## Current phase task list

Phase 6 deliverables and acceptance criteria are in PLAN.md, "Phase 6". The task lists of Phases 2 to 5 and of step 9.1 are in the history of this file (`git log -p docs/PROGRESS.md`).

- [x] 6.0 The user's go for Phase 6, in this session (24 Nov, 00:00). Branch `phase-6-timeline` cut from `main` at `89dfde3`. This file corrected: Phase 5 is merged as pull request #4; the live site shows it (checked after the merge: day and fate filters, counts on the tabs, the view in the address, "All matches (566)" and "566 matches, 836 journeys", every request answered, empty console). Not seen there either: the clipboard write of "Copy link", which the preview pane refuses
- [x] 6.1 Plan approved by the user in plan mode (24 Nov, 00:09) and recorded in PLAN.md, "Phase 6". Approved with it: the whole match is the resting state and Play at the end starts from 0:00; `t` is in the address only when the time is not the end, and a link opens paused; Space on the map and on the slider, the arrow keys keep moving the map there; speeds 1x to 60x, 10x at first; a single match only, so Should 5 and Could 2 are not built in this phase; no React update per frame at all; the frame-time reading comes from the page itself; five real journeys and one made-up one-row journey in the fixture; no new dependency and no change to the data files; one review by two agents held to 40 tool calls each
- [x] 6.1a The user's five changes to the plan (pasted note, 24 Nov), recorded in PLAN.md: `t` is written with `replaceState`, never `pushState`; a frame counts for at most 100 ms and playback pauses when the tab is hidden; the frame-time reading also covers a second match (`fbbc5d02` is itself the one with the most journeys, 16, so the second is `d0a38c30` on Lockdown, which has the most rows: 1,216 in 15 journeys); the Play button gets the title "Play/Pause (Space when the map or timeline is focused)" and the slider's keys go where key help exists; DATA_NOTES.md records A6 and the journey of one row as assumptions. At the phase's end the closing message carries a short manual test script
- [x] 6.2 Pipeline (24 Nov, 00:35): `pipeline/playback.py` with `head_at`, the rule of DATA_FORMAT.md as code, tested against values worked out by hand. `make data` leaves `web/public/data/` as it was and writes `web/src/lib/__fixtures__/playback.json` (4,876 bytes): five real journeys, the shortest that show each case, and one made-up journey of one row, with 100 heads in all. DATA_NOTES.md: A6 now says the playback rule in full, and A9 is the journey of one row (no path in the data has one: the shortest has 2 rows). `make test`: 252 tests
- [x] 6.3 lib (24 Nov, 00:35): `web/src/lib/playback.ts`. `headAt` gives every head of the fixture exactly, with no rounding; the heads of a draw list at a time; how many of a marker's events have happened by a time; the clock's step, which counts at most 100 ms of real time for a frame; the speeds; the slider's keys. `npm run check`: 364 tests
- [x] 6.4 The clock and the link (24 Nov, 00:39): `web/src/state/playback.ts`, a plain Zustand store with `time`, `end`, `playing` and `speed`. It runs on `requestAnimationFrame` only while playing, follows the open match (523 s, 780 s and 878 s for the three named matches), opens a match whole and paused, takes the time of a link once, counts at most 100 ms for a late frame and pauses when the tab is hidden. `t` is in `lib/link.ts` (after `match`, to a tenth of a second, kept only with its match and below its span) and in the address: written with `replaceState` when the time comes to rest, never while the match plays. The app does not start the clock yet; that comes with the timeline bar. `npm run check`: 391 tests
- [x] 6.5 Marker times and picking (24 Nov, 00:42): in `lib/drawList.ts` a marker keeps the time of each of its events (`times`, which replaces `last`); `lib/pick.ts` finds a marker only from its first event on, and a path only as far as it is drawn. The tooltip gets the count of the events that have happened and the time of the last of them
- [x] 6.6 The layer draws the moment (24 Nov, 00:42): `layers/journeysLayer.ts` listens to the clock. Before the end of a match it draws every path as far as its head has come, the heads where the journeys are, and the markers of what has happened with their counts; what is under a resting pointer is looked up again when the time moves. The whole match and all matches keep their cached paths. Tested in lib: the head of a journey is on its death marker from the second of the death. Not looked at in the preview yet: nothing starts the clock before step 6.7. `npm run check`: 394 tests
- [x] 6.7 The timeline bar (24 Nov, 00:44): `components/Timeline.tsx` in a third grid row under the map: Play and Pause with the title "Play/Pause (Space when the map or timeline is focused)", the time (`2:05 / 8:43`), the slider with a mark for every kind and second in which something happened, and the speed. The slider and the time are written straight into the page; React renders the bar only when play, pause, speed, the match or the journeys drawn change. Space on the map (`lib/mapKeys.ts`, `mapSurface.ts`); the slider's keys in its title and in a description for assistive technology (the tool has no visible key help); the slider's look in `styles.css`. `App.tsx` starts the clock. `npm run check`: 396 tests; build: 87.68 kB of JavaScript gzipped. Not looked at in the preview yet
- [x] 6.8 Checked in the preview (24 Nov, 00:46 and 00:54; pane at 1280 x 800, the second time in a fresh tab):
  - `?match=fbbc5d02`: the bar is 56 px high under the map (grid rows 48, 696 and 56 px; the sidebar spans both). Play has the title "Play/Pause (Space when the map or timeline is focused)"; the time reads "8:43 / 8:43"; the slider runs from 0 to 523 with 19 marks; speeds 1x to 60x, 10x chosen
  - Scrubbing: the journeys layer paints 835 pixels at 0:00 (the heads at their starts), 34,928 at 1:57 and 67,118 for the whole match. The first death of the match (`fbbc5d02-5787de75`, at 118 s): no death colour at its spot at 117 s, death colour there at 118 s. The tooltip at that spot says "Death: killed by bot ... at 1:58" at 118 s and for the whole match; at 117 s it finds only the path that passes there ("at 1:25")
  - The slider's keys, from 118 s: right 123, Shift+left 122, Page Up 182, Page Down 122, Home 0, End 523, left 518. A dragged value of 77.6 becomes 78 s, and a press on the slider pauses
  - Space plays and pauses on the slider and on the map itself, where the focus stays; on a zoom button it does not. 27 s of the match pass in 3.2 s at 10x. The address stays `?match=fbbc5d02&t=118` while it plays and reads `&t=127` after the pause (the time was 126.997 and is rounded)
  - The slider's end is 523 for `fbbc5d02`, 780 for `a476eb57` and 878 for `5a081fe4`; with all matches the bar says "Open a match to play it back."
  - A reload at `?match=fbbc5d02&t=120.5` opens paused at "2:00 / 8:43" with the slider at 120.5, keeps the address and draws that moment: 34,002 pixels, about half of the whole match
  - The console of the fresh tab holds no error and no warning: two lines of Vite, and React's hint about its developer tools. The errors seen the first time were Vite's hot reload after this session's branch switches
  - **The frame-time reading**, playing at 20x for 10 s, taken from the page itself:

    | Match | Journeys | Time per draw: median, 95th, largest | React commits while playing | Time between frames: median, 95th |
    |---|---|---|---|---|
    | `fbbc5d02`, which has the most journeys | 16 | 0.2, 0.3 and 0.7 ms (225 draws) | none; one at Play, one at Pause | 33.3 and 34.2 ms |
    | `d0a38c30` on Lockdown, which has the most rows | 15 | 0.2, 0.3 and 0.4 ms (161 draws) | none; one at Play, one at Pause | 33.3 and 34.3 ms |

    The app's work per frame is far under 16 ms, and React renders nothing while a match plays. The time between frames is the pane's and not the app's: the browser pane shows about 30 frames a second and stood still for up to a second several times (21 and 20 frames longer than 34 ms). So "frame time under 16 ms" is shown for the work and not for the pacing; a reading in a browser window at 60 Hz is still missing. The stalls showed the 100 ms limit at work: at 20x the matches reached 147 s and 110 s instead of 200 s, and neither jumped
- [ ] 6.9 Independent review by two agents, each held to 40 tool calls; fixes
- [ ] 6.10 Docs and phase-end checks; status "DONE (awaiting my review)"
- [ ] 6.11 On the user's yes: push the branch, open the pull request, record it here, read the first CI run. Then stop for the review

## Exactly where I stopped

- Branch `phase-6-timeline`, cut from `main` at `89dfde3`; local only, nothing pushed. `main` equals `origin/main`.
- Steps 6.2 to 6.7 are committed on `phase-6-timeline` (local only, nothing pushed): everything of playback is built. At 00:48 on 24 Nov: `npm run check` (396 tests), `npm run build` (87.68 kB of JavaScript gzipped) and `make test` (252 tests) pass.
- Step 6.8 is done: the preview checks and the frame-time reading are in its entry above. After it (00:58): a fault check of the new code (thirty one-line faults, 27 noticed, two tests added, the third unobservable), ARCHITECTURE.md's rows on playback, and PLAN.md's section "Changed while building Phase 6". The user said "Continue" at 00:50 with the 5-hour window at 88%; the review did not fit into what was left.
- **NEXT:** 6.9, once the usage window has reset (03:00 IST on 24 Nov): the review by two agents, each held to 40 tool calls, then the fixes. Then 6.10: PLAN.md "Phase 6" as built with a section on what differs and what the review changed, BRIEF.md, the README's status line, ARCHITECTURE.md's mention of the clock, the commands table below, status "DONE (awaiting my review)", and the short manual test script for the closing message. Then ask once to push and open the pull request, and stop.

## Decisions and assumptions made

Data decisions are recorded with evidence in [DATA_NOTES.md](DATA_NOTES.md) (row numbers in brackets, assumptions as A1 to A9).

2026-11-22:
- Project folder `~/projects/lila-player-journeys`; GitHub repo public from the start; commits use the GitHub no-reply address, set in this repo only (user's choices).
- Python 3.12 or newer (numpy 2.5 dropped 3.11); developed on 3.14. Proof images are JPEG, not PNG. matplotlib is not installed until something needs it. DuckDB was used for cross-checking only.
- `ts` is Unix seconds [5]. Position is recorded about every 5 s and not while standing still [6, A6]. Sort by (`ts`, file order) [7].
- Human or bot is decided per journey by its movement event [8]. The 17 numeric-id human journeys carry per-map placeholder ids and are "anonymous humans" [8, A1].
- Events are read from the file owner's side, at the owner's position [9]. There is no verifiable player-versus-player kill [10].
- "Duration" is the observed span of the recorded files, not match length [12]. Day folders are UTC days by time of writing; the date filter uses the folder name [13].
- Cleaning, four rules in order: keep the February_11 copy of the journey stored twice (88 rows removed), first half of the three files written twice (190), drop Kill rows mirrored by a Killed row (3), drop movement rows after the death row (206). 88,617 rows and 1,242 journeys remain [14 to 17]. Repeated Loot and BotKill rows are kept [16, A2].
- No death row means "no death recorded" [18, A3]. Storm deaths are markers, not a heatmap [19].
- The README's coordinate transform and constants are used unchanged, with the real image sizes [20, 21, A8]. Elevation is kept in the app's data.
- Commit messages carry no `Co-Authored-By` line (user's choice; the rule is in `CLAUDE.md`). Earlier commit messages were rewritten to remove it.

2026-11-23, Phase 3 plan (approved in plan mode):
- ESLint with TypeScript 6.0.3 (user's choice): typescript-eslint 8.73 does not accept TypeScript 7 yet. The current Vite template uses TypeScript 7 with oxlint; not taken.
- Double-click zooms in at the pointer instead of resetting; the Fit button and `0` reset. The artwork inside each minimap is fitted, not the whole image; the pipeline writes its box into the manifest. Tabs show map names only; match counts join in Phase 5.
- A view is the image point at the viewport centre plus a zoom relative to fit, so it survives a resize and can go into the URL in Phase 5.
- Fonts are bundled with the app (three `@fontsource-variable` packages).

2026-11-23, while building Phase 3:
- The map may be moved only as far as the fitted map shows empty space on that side. A stricter rule (never more than the margin beyond the artwork) made the map slide sideways when zooming at a point near its edge, so the point under the cursor was lost.
- The map surface is plain DOM code (`web/src/components/mapSurface.ts`), not React: it draws, listens and writes the read-out without a render. React renders the frame around it.
- Double requests and slow image decodes seen in the preview pane were the pane running hidden, not the app.

2026-11-23, from the Phase 3 review (each is in PLAN.md's last section and waits for the user's review):
- The map's keys act while the focus is on the map or on one of its buttons, not on the map alone.
- A failed load keeps its kind. No answer: "Try again", which stays in place while it runs; when it works, the focus goes to the map. A data file this version cannot read: "Reload". A fault in the page: a message from an error boundary. The reason goes to the console.
- The manifest check also refuses values that would draw a wrong map: a size or scale of zero, an artwork box outside its image, two maps with one id, an event code that stands for no event.
- `noUncheckedIndexedAccess` stays off: Phases 4 to 7 read typed arrays in tight loops, where every read would need a fallback that hides a fault instead of catching it. The manifest's shape is checked where it enters the app.
- Minimap images stay in the store: nothing serialises it, and the URL of Phase 5 takes chosen fields.
- Pinch on a touch screen and Safari's trackpad pinch are not handled; decided in Phase 8. Neither can be tried in the preview pane.
- The elevation decoder left `projection.ts` until Phase 4 brings the tooltip that uses it (no dead code).
- `mapSurface.ts` (events and drawing) has no unit test: that needs a DOM test library, a new dependency. Its logic moved to `web/src/lib/` with tests; the rest was checked in the preview with real input.

2026-11-23, git flow (user's choice "Yes, per phase"):
- From Phase 3 on, each phase is done on its own branch and reaches `main` through one pull request that the user merges after review ("Rebase and merge"). `main` holds reviewed work only; once Vercel is connected, `main` is what is live and each pull request gets a preview link. Pull request descriptions carry no attribution line. Step 9.1 (creating the Vercel project) moves to right after the Phase 3 pull request is merged.

2026-11-23, from the Phase 2 review (each is described in PLAN.md's last sections or in DATA_FORMAT.md, and waits for the user's review):
- Every row is a point of its owner's path, not only the movement rows; a journey's path ends at its death row.
- kills count Kill and BotKill rows; bots' kills are counted as `bot_kills`. Every marker is counted once in the manifest.
- A journey has a `fate` from a closed list instead of the raw death event, and an `id`.
- The manifest's span is measured after cleaning (380 s median, 887 s maximum).
- A match filed under two day folders goes to the later one. A file out of time order after cleaning, or a journey with two death rows, stops the build.
- Python lines are at most 140 characters. A linter and a type checker (ruff, mypy) would need new dependencies: asked in the open questions.

2026-11-23:
- The user approved PLAN.md with the recommended answers: deadline Thu 26 Nov (end of day until the hour is known); the scope ladder as written; one data bundle per map with heatmaps binned in the browser; public ids are 8-character prefixes of player and match ids; the README's map constants; one review per phase.
- The stale "Contributors" box on GitHub: the user chose to wait for GitHub to refresh it.

2026-11-23, after the merge of Phase 3:
- Pull request #1 was merged with a merge commit (`884e78e`), not with "Rebase and merge" as the git flow in CLAUDE.md says. Left as it is: making `main` linear again would mean rewriting it. The hashes of the branch's commits are therefore still valid on `main`. What to do for the next pull requests is open question 6.
- The branch for step 9.1 was cut right after the merge without a separate go, so that this file can record the merge without a commit on `main` (assumption, told to the user).
- The merged branch `phase-3-app-shell` still exists locally and on GitHub. It is deleted only on the user's word.

2026-11-23, after step 9.1:
- Pull request #2 was merged with a merge commit as well; `main` is at `83d973c`. Open question 6 stands.
- The user chose to do Phase 4 in the same session rather than in a fresh one ("Do this task here").

2026-11-23, Phase 4 plan (approved in plan mode):
- The sidebar is built in Phase 4, with the match list, the journeys of the open match and the legend; every legend row is a switch. Phase 5 keeps the day and fate filters, the tab counts, the URL state, "copy link" and the empty states.
- A fate's wording is made from its own text ("killed_by_bot" reads "killed by bot"), so the app holds no second list of fates. Marker kinds are the keys of the manifest's `event_groups`.
- Hover works on markers (10 pixels) and on paths (6 pixels). Click focuses a journey; Esc or a click on empty map clears.
- A map's journeys are fetched when its tab is first opened.
- Planned and built without planning agents; one review at the end by two agents with a fixed budget. Ultracode is on in the session; the usage rule decided.

2026-11-23, while building Phase 4:
- Loot is a small ring, not a small square: in the greyscale check a square could not be told from a bot's square head. The design tokens in CLAUDE.md say so now.
- While all matches are open, heads and markers are drawn at 70% of their size and lines thinner and half transparent: at full size the 1,772 kill markers of Ambrose Valley hid the paths.
- Markers are drawn once and stamped, and the ring around the hovered thing has a canvas of its own: with shapes drawn every frame the 8,988 loot markers took 28 ms.
- In the preview pane the page draws about one frame a second while the pane is hidden, so a test there has to wait more than a second after each event before it reads the page. The app itself reacts on the next frame.

2026-11-23, from the Phase 4 review (each is in PLAN.md's last section and waits for the user's review):
- One marker stands for the events of one kind that a journey has at one spot, whatever their second. The approved plan said "same spot and second"; with that rule a tenth of the markers lay hidden under another one.
- The draw list holds the markers in drawing order (loot, storm deaths, deaths, kills), so the pointer finds the marker on top.
- A double-click zooms and leaves the focus alone. Each list in the sidebar is one Tab stop with arrow keys inside.
- Hiding humans or bots clears the focus. What a tooltip says about a single event has no keyboard route until Phase 8.

2026-11-23, after Phase 4:
- Pull request #3 was merged with a merge commit, like #1 and #2; `main` is at `fb2aa02`. Open question 6 stands.
- The user chose again to do the next phase in the same session ("Do this task here").
- After a switch of branches the dev server of the preview has to be restarted: Vite lost its styles once after one.

2026-11-23, from the Phase 5 review (each is in PLAN.md's last section and waits for the user's review):
- The match list offers only what the day and fate filters leave, and a match they rule out cannot be opened.
- A linked focus is kept only when its journey is drawn; a view from a link has to be closer than fit, at most 64 times, and on the image; a switch put back to shown is forgotten.
- "Clear filters" hands the keyboard focus to the filters or to the map.
- Left: a reload within 300 ms of a change loses that change.

2026-11-23, from looking at the review's fixes in the preview:
- An empty match list says why: the filters left no match on the map, or no id contains what was typed. The button above the list reads "All matches (566)", so that a single match left is not "All 1 matches".
- The note over the map is part of the map view and appears once the minimap is there; until then the match list and the legend say that nothing is left. In the hidden preview pane Lockdown's image took more than 4 s, so a check of the note has to wait until "Loading Lockdown…" is gone.

2026-11-24, after Phase 5:
- Pull request #4 was merged with a merge commit, like #1 to #3; `main` is at `89dfde3`. Open question 6 stands.
- The user chose again to do the next phase in the same session ("Do this task here"), with the 5-hour window at 66% and three hours before its reset.
- The merged branches `phase-3-app-shell`, `chore-first-deployment`, `phase-4-journeys` and `phase-5-filters` still exist locally and on GitHub. They are deleted only on the user's word.

2026-11-24, Phase 6 plan (approved in plan mode):
- The whole match is the resting state; `t` is in the address only before the end. Starting every match at 0:00 would open it as an empty map.
- The arrow keys stay with the map while it has the focus; the slider has its own. PLAN.md said "space, arrows" without saying where.
- The clock is a plain Zustand store of its own (`state/playback.ts`), so that the 60 updates a second reach only the map layer and the slider.
- No path in the data has a single row (0 of 1,242), so that case of the fixture is made up and marked so.
- Planned and built without planning agents; one review at the end by two agents with a fixed budget. Ultracode is on in the session; the usage rule decided.

2026-11-24, the user's correction to the order:
- The note the Phase 5 plan had been approved with (six changes) reached the session after the merge of Phase 5. I built it first, on a branch of its own; then the user said to skip that branch and to put the six items into Phase 8. The built work is kept on the local branch `fix-phase-5-approved-changes` and is not part of Phase 6.
- Until Phase 8 the address is always rewritten in place, `t` included, and Back and Forward leave the tool.

2026-11-24, while building Phase 6:
- Should 5 (all-matches playback) and Could 2 (density strip) are not built; the draw list already holds what they would need (the times of every marker).
- A double-click on the map still zooms without changing the focus; with playback nothing about it changed.
- The first frame after Play counts for no time: it only sets the moment to count from, so the clock needs no clock of its own to start.
- The commits `5b2fb2a` and `fcbf93b` of this branch fail `make test`: a line of the new test file was longer than 140 characters, which the hygiene test saw only once the file was tracked. Fixed in `1b963f5`. From now on `make test` runs after `git add`.

## Open questions for the user

1. Should `docs/PROGRESS.md`, `CLAUDE.md` and `.claude/` stay in the repo at submission? They show how the work was run with Claude Code, which the brief allows; they are also working notes in a public repo.
2. The "Outside claims about this dataset, tested" table in DATA_NOTES.md shows that claims from outside were checked. Keep it, or drop it before submission?
3. `/resume` is also the name of a built-in Claude Code command (reopen a past conversation). Keep the name, or rename it (for example `/where`)?
4. At what hour on Thu 26 Nov is the submission due?
5. The Phase 2 review asked for a linter and a type checker in CI (ruff and mypy, development-only dependencies). Add them? The code already keeps to one line length and has type hints, but nothing checks them. Not blocking.
6. Pull request #1 was merged with a merge commit. For the next pull requests: keep "Rebase and merge" as the rule (the repo can be set to offer only that method: one `gh repo edit` command, on the user's yes), or accept merge commits and change the rule in CLAUDE.md?

## Commands that work

| Command | What it does | Last passed |
|---|---|---|
| `unzip _inbox/player_data.zip -d data/raw` | restores the raw data | 2026-11-22 |
| `make setup` | creates `.venv`, installs pinned dependencies | 2026-11-22, in a fresh clone |
| `make test` | 252 tests, no raw data needed; creates `.venv` on first use. Run it after `git add`: the hygiene tests see tracked files only | 2026-11-24 00:58 |
| `cd web && npm run check` | type check, ESLint with no warning allowed, 397 Vitest tests | 2026-11-24 00:58 |
| `cd web && npm run build` | production build into `web/dist/` (not committed); JavaScript 87.68 kB gzipped | 2026-11-24 00:58 |
| `cd web && npm run dev` | the app on http://localhost:5173 | 2026-11-23 17:41 |
| `make profile` | measures the raw data → `docs/profile/` (235 metrics) | 2026-11-23 13:10 |
| `make data` | builds `web/public/data/` and the two test fixtures (projection, playback); writes nothing unless every check passes, the profile report included; 3 s | 2026-11-24 00:35 |
| `make overlay` | proof images → `docs/img/`, about 30 s | 2026-11-23 13:10 |

## Known issues / TODO later

- The frame-time reading of Phase 6 was taken in the browser pane, which shows about 30 frames a second and stalls now and then. It shows the work per frame (0.7 ms at most for a draw, no React commit while playing), not that frames come every 16 ms. A reading at 60 Hz, in Chrome's Performance panel as PLAN.md names it, is still to take: by the user, or in the user's Chrome if they ask for it.
- **For Phase 8, set aside by the user on 24 Nov:** the six changes the Phase 5 plan was approved with. (1) `pushState` for discrete changes (map, match, focus, days, fates, switches), `replaceState` for moving, zooming and `t`. (2) A notice when a filter hides the open match. (3) A test that the 8-character match id prefixes are unique. (4) Filter chips as `<button>` with `aria-pressed` and focus styles, which they are since Phase 5. (5) The journey id's format ("-anon", "botNNNN") in a comment and in DATA_NOTES.md. (6) The folder-day assumption (`e325a53a` belongs to February_10) in DATA_NOTES.md. All but (4) were already built and tested when they were set aside: they wait on the local branch `fix-phase-5-approved-changes` (`9a2f0a4`, `8e13ce5`; not pushed). Phase 8 takes them from there. The branch is deleted only on the user's word.
- Commits stay local until the user approves each push.
- CI: all three checks passed on pull request #1, the app job and the `@v7` actions included. The run on `main` after the merge has not been read.
- Screenshots for pull requests and for the walkthrough: the preview pane's screenshots are not files the repo can hold. Phase 10 needs a way to write them (Playwright, a development dependency: ask first).
- The preview pane of this session reads `~/YesudasZ/.claude/launch.json`, where the entry `lila-web` (port 5183) was added. `.claude/launch.json` in this repo (entry `web`, port 5173) is for sessions started in this folder. Vite reloads the page when a file under `web/public/` changes, so a failure test that moves a data file away cannot show the retry working; set the failure in the app's own store instead.
- Usage: the 5-hour limit was reached on 23 Nov shortly before 17:00 IST while three planning agents ran next to a long conversation, and the two-agent review of Phase 3 took about 40% of a window. Keep agent use low, and prefer a fresh session per phase, started with the resume protocol. The limit was reached again at 22:00 IST the same day, at the very end of step 9.1, in a conversation that had grown long; nothing was lost.
- One of the reviewers' one-line faults is still not noticed by a test: removing the guard in `scaleBar` for `Math.log10` landing just under a whole number. No input reaches it in this JavaScript engine.
- GitHub's "Contributors" box still showed two contributors on 2026-11-23 10:45 IST, about 11 hours after the rewrite was pushed; GitHub's API lists one. The user chose to wait. Recheck before submission (also a Phase 11 check). Fallbacks: recreate the repo, or GitHub Support.
- `ARCHITECTURE.md` is a first draft of about 1,000 words. It has to fit one printed page by Phase 10: trim it then.
- The README's map constants may be 1.5 to 2% too large in x on two maps (`docs/profile/crosscheck.md`, section 4). Kept as documented, by the user's decision.
- 60 of the profiler's 235 metrics were added after the blind cross-check and were not re-derived by it (the cleaning counts among them were confirmed by a skeptic).
