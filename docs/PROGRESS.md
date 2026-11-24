# Progress Log

Last updated: 2026-11-24 18:42 IST

## Current phase

Step 9.2 and Phase 10 (deployment check; insights and docs), done together on the branch `phase-10-docs` as the user set them on 24 Nov. Status: **IN PROGRESS**, stopped for the user to pick three of the eight candidate insights. No pull request yet.

Phases 1 to 8 and step 9.1 are merged: pull requests #1 to [#7](https://github.com/YesudasZ/lila-player-journeys/pull/7) were reviewed and merged by the user, the last one (Phase 8) on 24 Nov at 18:01 IST as merge commit `603c5ef`. The tool is live at https://lila-player-journeys-psi.vercel.app and shows Phase 8; production on Vercel follows `main`.

Repo: https://github.com/YesudasZ/lila-player-journeys (public).

## Phase checklist

| # | Phase | Status | Commit or pull request |
|---|---|---|---|
| 1 | Data discovery and repo setup | APPROVED | `bc63f0e` |
| 2 | Pipeline | APPROVED | `ccc2369` |
| 3 | App shell and map canvas (ends with the first deployment, step 9.1) | APPROVED (merged and hosted) | pull request [#1](https://github.com/YesudasZ/lila-player-journeys/pull/1) |
| 4 | Journeys, humans versus bots, markers | APPROVED (merged) | pull request [#3](https://github.com/YesudasZ/lila-player-journeys/pull/3) |
| 5 | Filters and URL state | APPROVED (merged) | pull request [#4](https://github.com/YesudasZ/lila-player-journeys/pull/4) |
| 6 | Timeline and playback | APPROVED (merged) | pull request [#5](https://github.com/YesudasZ/lila-player-journeys/pull/5) |
| 7 | Heatmaps | APPROVED (merged) | pull request [#6](https://github.com/YesudasZ/lila-player-journeys/pull/6) |
| 8 | Polish | APPROVED (merged) | pull request [#7](https://github.com/YesudasZ/lila-player-journeys/pull/7) |
| 9 | Deployment (9.1 after Phase 3, 9.2 with Phase 10) | 9.1 APPROVED (merged); 9.2 checked on 24 Nov, awaiting my review with Phase 10 | pull request [#2](https://github.com/YesudasZ/lila-player-journeys/pull/2); branch `phase-10-docs` |
| 10 | Insights and docs | IN PROGRESS | branch `phase-10-docs` |
| 11 | Final QA | NOT STARTED | |

[PLAN.md](PLAN.md) was approved by the user on 2026-11-23. Phase 2 was approved with the user's go for Phase 3 the same day, the changed plan lines included.

## Current phase task list

Step 9.2 and Phase 10 are done together; the user's brief for them is in PLAN.md, at the end of "Phase 10". The task lists of Phases 2 to 8 and of step 9.1 are in the history of this file (`git log -p docs/PROGRESS.md`).

- [x] 9.2 Production checked on 24 Nov. `main` is `603c5ef`, the merge of pull request #7; its three CI jobs and its Vercel status are green. Production serves `index-CKbSPsBA.js` and `index-DyQpQSEB.css`, the very file names a local build of `603c5ef` gives, so it runs this build. In the browser: the root shows "566 matches, 836 journeys" and the button "Data and keys"; `?map=Lockdown&heat=death` opens Lockdown with the Deaths layer ("183 deaths of 102 matches, incl. 17 storm deaths"); `?match=fbbc5d02&t=118&journey=fbbc5d02-5787de75` opens the match at "1:58 / 8:43" with the journey focused; `?map=GrandRift&days=February_10&fate=killed_by_storm&heat=movement` opens one match with one journey and all four choices pressed. No request failed in any of the four loads, the console had no error, and at 375 px the page loads with the desktop notice. The live URL is the first line under the README's title. The repo's About field already has it as its homepage (set in step 9.1), so no `gh repo edit` was needed; its description still ends in "Work in progress."
- [x] 10.1 `analysis/insights.py` (`make insights`): eight candidate findings, A to H, counted from the committed manifest and bundles in the cells of the app's heat layers, a path followed between its rows. Its totals are the manifest's (2,236 kills by humans, 170 by bots, 39 storm deaths, 781 journeys of humans with an account id, 12,829 loot events, 52 matches with a bot's journey), and its Kills numbers are what the tool's legend says on each map (441, 42 and 122 matches; the fullest cell holds 29, 8 and 7). Tests in `pipeline/tests/test_insights.py`: the helpers on small cases, the totals, and that the cell size is the app's. `make test`: 261 tests
- [x] 10.2 The user picked B, D and E (24 Nov)
- [x] 10.3 INSIGHTS.md: (1) on Lockdown the storm kills half of the players who stay late (candidate B); (2) bots are fought where the loot is (D, with the kill concentration of C); (3) each map has a quiet quarter (E). E is worded more carefully than the candidate was: the screenshot of Lockdown showed that the artwork's rectangle holds sea and empty corners, so "cells no journey crosses" (45.9% / 46.1% / 64.6%) is a loose upper limit. The insight rests on what needs no mask (crossings per quarter, the busiest tenth, cells under one journey in a hundred) and says the limit. The script got the numbers the text needs: how the late journeys ended, the cells that hold half of the loot and the cells next to them, crossings by quarter. Tests: every number the text quotes is pinned, and every decimal in INSIGHTS.md has to be one the script prints. Each insight has deep links and a screenshot of the live tool. Three screenshots were looked at and show what the text says: Lockdown with 17 storm deaths of 17 matches, `fbbc5d02` at 1:58, Lockdown's traffic
- [x] 10.4 ARCHITECTURE.md rewritten for one page (929 words): stack and why; data flow; the coordinate mapping with the constants of the three maps, UV storage, the Y flip, the proof and the tests; seven assumptions as "README says / data shows / decision"; eight trade-offs. Not verified yet: that GitHub's view of it prints on one A4 page, which is checked once the branch is pushed
- [x] 10.5 README: the live URL first, what the tool does in three lines, tech stack, run the app, rebuild the data (the zip in `_inbox/`), "Env vars: none", tests, project structure, a walkthrough of nine steps with deep links and eight screenshots, and the note on AI tools. Screenshots: 11 JPEG files (1.9 MB) in `docs/img/walkthrough/` and `docs/img/insights/`, taken from the live tool at 1440 x 900 with Playwright 1.65.1 and the installed Chrome; nothing was added to `package.json`. `docs/media/walkthrough.mp4` is linked and not there yet: the user records and adds it
- [ ] 10.6 Phase-end docs and checks; status "DONE (awaiting my review)"; ask once to push and open the pull request; stop

## Exactly where I stopped

- Branch `phase-10-docs`, cut from `main` at `603c5ef`; local only, nothing pushed.
- Steps 9.2 and 10.1 are committed. The eight candidates and their numbers were shown to the user, who picks three.
- **NEXT:** when the user has picked: step 10.3. For each picked finding, make its numbers the ones INSIGHTS.md quotes (add what a claim needs to `analysis/insights.py`, never a number by hand), pin them in `pipeline/tests/test_insights.py`, and open every deep link once to see that the tool shows what the text says. Then 10.4, 10.5 and 10.6, a commit after each.

## Decisions and assumptions made

Data decisions are recorded with evidence in [DATA_NOTES.md](DATA_NOTES.md) (row numbers in brackets, assumptions as A1 to A10).

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

2026-11-24, from the Phase 6 review (each is in PLAN.md's last section and waits for the user's review):
- What a moment shows is decided in `lib/playback.ts` (`momentAt`), not in the canvas layer; picking takes the heads, so a moving head can be pointed at and clicked.
- The map is drawn in the clock's own frame, so the map and the slider show one time.
- A held Space toggles once. Deaths are marked below the slider's track. What assistive technology is told about the time is written when the time comes to rest.
- Left: the paused time is not kept per map; a match that is opened starts whole.

2026-11-24, after Phase 6:
- Pull request #5 was merged with a merge commit, like #1 to #4; `main` is at `78197e9`. Open question 6 stands.
- The user chose again to do the next phase in the same session ("Do this task here"), against the recommendation: the conversation held about 800,000 tokens, and this model's weekly limit stood at 76% with Phases 7 to 11 ahead.
- Still unverified from Phase 6, for Phase 8 or the final QA: frames arriving every 16 ms (Chrome's Performance panel), a real pointer drag of the time slider, the clipboard write of "Copy link".

2026-11-24, Phase 7 (the plan, the user's five changes, and what was decided while building):
- One heat layer at a time, none at first; fed by the journeys that are drawn; cells of 10 x 10 world units; the heat does not follow playback.
- Deaths include storm deaths, and the legend says how many (the user's choice). The legend also lists the rows of each event by its name in the data, which is how it says that every kill left after cleaning is a kill of a bot.
- The Heat control is the first section of the sidebar, and the minimap is dimmed by 40% under a heat layer (the user's choices).
- The "no recorded path" layer is not built: it needs a mask of the playable area. ARCHITECTURE.md has it as a trade-off.
- No review agents; grid sums, twenty one-line faults and the preview instead. Vitest 5.1.1 has no `bench()`, so the 50 ms criterion is a timed test.
- The sidebar scrolls when it is taller than the window.

2026-11-24, after Phase 7:
- Pull request #6 was merged with a merge commit, like #1 to #5; `main` is at `94bf1fb`. Open question 6 stands.
- The user chose again to do the next phase in the same session ("Do this task here"), against the recommendation.
- In a hidden browser pane no animation frame runs until something asks for one: after the merge the heat canvas of the live site still held 1.68 million pixels with the heat switched off, and was empty as soon as a script asked for a frame. A check that reads a canvas has to wait for a frame first.

2026-11-24, Phase 8 (the plan, the user's scope note, and what was decided while building):
- The user's scope note reached the session at about 14:27, after steps 8.4 and 8.5 had been built: history and notice, ids and notes, the panel and the notice in a narrow window; the events of the focused journey as text cut ("not built — tooltips cover it"); the panel short and plain; no review agents; Lighthouse, the reading at 60 Hz, the drag of the slider and the click on "Copy link" done by the user. The events list was taken out with `git revert`, so its code stays in the history, and the panel was shortened from 20 entries to 14.
- The store counts the user's steps (`steps`), so the address code does not have to guess who caused a change. Choosing a heat layer is a step.
- Back and Forward bring back the time of playback through the link the store keeps (`asked`), the way the link the page was opened with always did; there is no function of its own for it.
- A step taken while a match plays is written at once, with the moment. A step that changes nothing in the address adds no entry.
- A write to the history that the browser refuses is caught and logged as a warning.

2026-11-24, after Phase 8, and Phases 9 and 10:
- Pull request #7 was merged with a merge commit, like #1 to #6; `main` is at `603c5ef`. Open question 6 stands.
- The user set step 9.2 and Phase 10 to be done together, on the branch `phase-10-docs`, in the same session, with a brief of their own (PLAN.md, at the end of "Phase 10") instead of plan mode.
- "Check the deployed commit": GitHub lists no deployment records for this repo, so the check is the Vercel status on `main`'s commit together with the file names of the build, which carry a hash of their content and are the same in production and in a local build of that commit.
- The statistics count in the cells of the app's heat layers, so a number of the script is a number of the tool's legend. A cell counts as crossed when a path passes through it between two rows, not only when a row lies in it.

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
| `make test` | 261 tests, no raw data needed; creates `.venv` on first use. Run it after `git add`: the hygiene tests see tracked files only | 2026-11-24 18:42 |
| `make insights` | prints the statistics behind INSIGHTS.md from the committed data files; no raw data needed | 2026-11-24 18:42 |
| `cd web && npm run check` | type check, ESLint with no warning allowed, 476 Vitest tests | 2026-11-24 14:33 |
| `cd web && npm run build` | production build into `web/dist/` (not committed); JavaScript 91.57 kB gzipped | 2026-11-24 14:33 |
| `cd web && npm run dev` | the app on http://localhost:5173 | 2026-11-23 17:41 |
| `make profile` | measures the raw data → `docs/profile/` (235 metrics) | 2026-11-23 13:10 |
| `make data` | builds `web/public/data/` and the two test fixtures (projection, playback); writes nothing unless every check passes, the profile report included; 3 s | 2026-11-24 00:35 |
| `make overlay` | proof images → `docs/img/`, about 30 s | 2026-11-23 13:10 |

## Known issues / TODO later

- **Usage, 24 Nov:** the weekly limit for this model stood at 89% at the start of step 9.2 (86% near the end of Phase 8), with the rest of Phase 10 and Phase 11 still to do before 26 Nov; it resets on 28 Nov. Keep every step lean and use no review agents. A long conversation costs most when it is woken after more than an hour: a fresh session that starts from this file is cheaper then.
- In the dev server, after a hot update of `web/src/state/playback.ts` or of what imports it, the timeline bar can show "Open a match to play it back." although a match is open: reload the page before reading the preview. A build has no hot updates.
- The frame-time reading of Phase 6 was taken in the browser pane, which shows about 30 frames a second and stalls now and then. It shows the work per frame (0.7 ms at most for a draw, no React commit while playing), not that frames come every 16 ms. A reading at 60 Hz, in Chrome's Performance panel as PLAN.md names it, is still to take: by the user, or in the user's Chrome if they ask for it.
- **For Phases 10 and 11:** the user's note with the changes to an approved plan has reached the session late four times (after the merge for Phase 5, while building for Phases 6, 7 and 8). In Phase 8 a step was built and had to be taken out again because the note cut it. So: after a plan is approved, build the steps the plan puts first, and do not start a step that the plan itself calls cuttable before the note is there; say in the status line that the step waits for it.
- The local branch `fix-phase-5-approved-changes` is no longer needed: Phase 8 took its work (history, notice, id tests, notes). It is deleted only on the user's word, like the merged phase branches.
- Left to the user in Phase 8, the results to be recorded here: Lighthouse on the hosted URL (performance at least 90, desktop preset), the frame-time reading at 60 Hz in Chrome's Performance panel, one real drag of the time slider, one click on "Copy link".
- In the dev server of the preview, removing a source file leaves two errors in the console of the page that was open (the hot reload asks for the file that is gone). A fresh load is clean; to tell, look at the failed requests of that page load, not at the console's history.
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
