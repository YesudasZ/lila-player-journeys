# Progress Log

Last updated: 2026-11-23 19:44 IST

## Current phase

Phase 3, App shell and map canvas. Status: **DONE (awaiting my review)** in pull request [#1](https://github.com/YesudasZ/lila-player-journeys/pull/1), from the branch `phase-3-app-shell` (last code commit `73cb25f`). Pushed and opened on 23 Nov with the user's yes.

Repo: https://github.com/YesudasZ/lila-player-journeys (public).

## Phase checklist

| # | Phase | Status | Commit or pull request |
|---|---|---|---|
| 1 | Data discovery and repo setup | APPROVED | `bc63f0e` |
| 2 | Pipeline | APPROVED | `ccc2369` |
| 3 | App shell and map canvas (ends with the first deployment, step 9.1) | DONE (awaiting my review) | pull request [#1](https://github.com/YesudasZ/lila-player-journeys/pull/1), branch `phase-3-app-shell` |
| 4 | Journeys, humans versus bots, markers | NOT STARTED | |
| 5 | Filters and URL state | NOT STARTED | |
| 6 | Timeline and playback | NOT STARTED | |
| 7 | Heatmaps | NOT STARTED | |
| 8 | Polish | NOT STARTED | |
| 9 | Deployment (9.1 after Phase 3, 9.2 on the last day) | NOT STARTED | |
| 10 | Insights and docs | NOT STARTED | |
| 11 | Final QA | NOT STARTED | |

[PLAN.md](PLAN.md) was approved by the user on 2026-11-23. Phase 2 was approved with the user's go for Phase 3 the same day, the changed plan lines included.

## Current phase task list

Phase 3 deliverables, the screen design, the package versions and the acceptance criteria are in PLAN.md, "Phase 3". The task list of Phase 2 is in the history of this file (`git log -p docs/PROGRESS.md`).

- [x] 3.0 Plan approved by the user on 23 Nov (plan mode). Decided: ESLint with TypeScript 6.0.3; double-click zooms in; the artwork is fitted, with its box written into the manifest by the pipeline; fonts bundled; a two-agent review at the end. Branch cut from `main` at `24559ce`
- [x] 3.1 Pipeline: `black_surround` now lives in `pipeline/minimap.py` (one implementation, also used by the proof images); `artwork_box` gives each minimap's artwork as fractions of the image; the manifest holds it as `minimap.artwork`. Boxes: Ambrose Valley 0.022 / 0.0396 / 0.8037 / 0.9517, Grand Rift 0.0767 / 0.1911 / 0.9556 / 0.8773, Lockdown 0.0605 / 0.0327 / 0.8989 / 0.8926 (left / top / right / bottom), pinned in `test_committed_data.py`, which also checks that every recorded position lies inside its box. `make data` changed only `manifest.json`; `make overlay` output unchanged
- [x] 3.2 `web/` scaffolded: 21 packages at exactly the approved versions (239 in the lockfile), TypeScript 6.0.3 strict, ESLint 10 with type-aware rules and the React hooks rules, Vitest, Tailwind v4 with the LILA Night tokens and no default palette, fonts bundled
- [x] 3.3 `web/src/lib/`: `projection.ts`, `view.ts`, `scaleBar.ts`, `manifest.ts`, and after the review `readout.ts` and `mapKeys.ts`. All 13 fixture points match from their integer codes
- [x] 3.4 `state/store.ts` (Zustand) and `data/`: the manifest, then the open map's image, then the other two; a retry after a failure asks the server afresh
- [x] 3.5 Components: `TopBar`, `MapTabs`, `MapPanel`, `MapView` with `mapSurface.ts` (plain DOM code: canvas in device pixels, wheel, drag, double-click, keys), `MapReadout`, `ZoomControls`, `StatusMessage`, `ErrorBoundary`
- [x] 3.6 CI: a second job (`npm ci`, `npm run check`, `npm run build` on Node 22); `checkout`, `setup-python` and `setup-node` at v7. Not run yet: it runs on the pull request
- [x] 3.7 Checked in the preview pane at 1280 x 800 on all three maps: the artwork fits; the README's example point reads x -302, z -354 under the cursor (1 screenshot pixel is 2 units there); wheel zoom and drag keep the point under the cursor; double-click, the keys `+ - 0` and the arrows, and the three buttons work, with the buttons unavailable at their limits; tabs by click and by arrow keys; keyboard focus ring on the map; the error states; no console error. No screenshot files: the preview's screenshots cannot be written into the repo (see Known issues)
- [x] 3.8 Independent review by two agents (behaviour in a real browser and view maths; code quality and accessibility). No blocker; 7 findings to fix and 25 small ones, several raised by both. Fixed in `f0ad05d`, `4df79b5` and `73cb25f`; what was left as it is, and why, is in PLAN.md's last section. Every fix was checked again in the preview with real clicks and keys, the three failure screens included (a data file moved away and put back; `git status` clean after). Raw result: `.local/phase3-review-result.raw`
- [x] 3.9 README "run the app" and BRIEF.md statuses (`c78c13d`); PLAN.md and this file; phase-end checks pass
- [x] 3.10 Pushed and pull request #1 opened with the user's yes (23 Nov, 19:44); recorded here. CI runs on the pull request, the app job and the v7 actions for the first time

## Exactly where I stopped

- Branch `phase-3-app-shell`, cut from `main` at `24559ce`, is pushed; pull request #1 into `main` is open. `main` equals `origin/main`.
- Everything of Phase 3 is committed. At 19:23: `npm run check` (196 tests), `npm run build` and `make test` (237 tests) pass.
- Waiting for the user's review of pull request #1. The user merges it on GitHub with "Rebase and merge"; changes asked for in the review go onto the same branch.
- **NEXT:** nothing until the user has reviewed. If a check fails on the pull request: read the failing step, repair it on this branch, ask before pushing. After the user's merge and go: `git switch main`, `git pull --ff-only`, then step 9.1: the user creates the Vercel project with root directory `web`, the hosted URL is checked for console errors, and a one-line pull request puts the URL at the top of the README. Phase 4 starts only on the user's go, on a new branch cut from the updated `main`.

## Decisions and assumptions made

Data decisions are recorded with evidence in [DATA_NOTES.md](DATA_NOTES.md) (row numbers in brackets, assumptions as A1 to A8).

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

## Open questions for the user

1. Should `docs/PROGRESS.md`, `CLAUDE.md` and `.claude/` stay in the repo at submission? They show how the work was run with Claude Code, which the brief allows; they are also working notes in a public repo.
2. The "Outside claims about this dataset, tested" table in DATA_NOTES.md shows that claims from outside were checked. Keep it, or drop it before submission?
3. `/resume` is also the name of a built-in Claude Code command (reopen a past conversation). Keep the name, or rename it (for example `/where`)?
4. At what hour on Thu 26 Nov is the submission due?
5. The Phase 2 review asked for a linter and a type checker in CI (ruff and mypy, development-only dependencies). Add them? The code already keeps to one line length and has type hints, but nothing checks them. Not blocking.

## Commands that work

| Command | What it does | Last passed |
|---|---|---|
| `unzip _inbox/player_data.zip -d data/raw` | restores the raw data | 2026-11-22 |
| `make setup` | creates `.venv`, installs pinned dependencies | 2026-11-22, in a fresh clone |
| `make test` | 237 tests, no raw data needed; creates `.venv` on first use | 2026-11-23 19:23 |
| `cd web && npm run check` | type check, ESLint with no warning allowed, 196 Vitest tests | 2026-11-23 19:23 |
| `cd web && npm run build` | production build into `web/dist/` (not committed); JavaScript 76 kB gzipped | 2026-11-23 19:23 |
| `cd web && npm run dev` | the app on http://localhost:5173 | 2026-11-23 17:41 |
| `make profile` | measures the raw data → `docs/profile/` (235 metrics) | 2026-11-23 13:10 |
| `make data` | builds `web/public/data/` and the projection fixtures; writes nothing unless every check passes, the profile report included; 3 s | 2026-11-23 13:16 |
| `make overlay` | proof images → `docs/img/`, about 30 s | 2026-11-23 13:10 |

## Known issues / TODO later

- Commits stay local until the user approves each push.
- CI: the app job and the `@v7` actions run for the first time on pull request #1. If a set-up step fails there, the action versions are the first suspect (looked up on 23 Nov: checkout v7.0.1, setup-python v7.1.0, setup-node v7.1.0).
- Screenshots for pull requests and for the walkthrough: the preview pane's screenshots are not files the repo can hold. Phase 10 needs a way to write them (Playwright, a development dependency: ask first).
- The preview pane of this session reads `~/YesudasZ/.claude/launch.json`, where the entry `lila-web` (port 5183) was added. `.claude/launch.json` in this repo (entry `web`, port 5173) is for sessions started in this folder. Vite reloads the page when a file under `web/public/` changes, so a failure test that moves a data file away cannot show the retry working; set the failure in the app's own store instead.
- Usage: the 5-hour limit was reached on 23 Nov shortly before 17:00 IST while three planning agents ran next to a long conversation, and the two-agent review of Phase 3 took about 40% of a window. Keep agent use low, and prefer a fresh session per phase, started with the resume protocol.
- One of the reviewers' one-line faults is still not noticed by a test: removing the guard in `scaleBar` for `Math.log10` landing just under a whole number. No input reaches it in this JavaScript engine.
- GitHub's "Contributors" box still showed two contributors on 2026-11-23 10:45 IST, about 11 hours after the rewrite was pushed; GitHub's API lists one. The user chose to wait. Recheck before submission (also a Phase 11 check). Fallbacks: recreate the repo, or GitHub Support.
- `ARCHITECTURE.md` is a first draft of about 1,000 words. It has to fit one printed page by Phase 10: trim it then.
- The README's map constants may be 1.5 to 2% too large in x on two maps (`docs/profile/crosscheck.md`, section 4). Kept as documented, by the user's decision.
- 60 of the profiler's 235 metrics were added after the blind cross-check and were not re-derived by it (the cleaning counts among them were confirmed by a skeptic).
