# Progress Log

Last updated: 2026-11-23 17:10 IST

## Current phase

Phase 3, App shell and map canvas. Status: **IN PROGRESS** on the branch `phase-3-app-shell` (no pull request yet)

Repo: https://github.com/YesudasZ/lila-player-journeys (public).

## Phase checklist

| # | Phase | Status | Commit or pull request |
|---|---|---|---|
| 1 | Data discovery and repo setup | APPROVED | `bc63f0e` |
| 2 | Pipeline | APPROVED | `ccc2369` |
| 3 | App shell and map canvas (ends with the first deployment, step 9.1) | IN PROGRESS | branch `phase-3-app-shell` |
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

- [x] 3.0 Plan approved by the user on 23 Nov (plan mode). Decided: ESLint with TypeScript 6.0.3; double-click zooms in; the artwork is fitted, with its box written into the manifest by the pipeline; fonts bundled; a two-agent review at the end. Branch cut from `main` at `24559ce`. Nothing installed yet
- [ ] 3.1 Pipeline: `black_surround` moves from `verify_overlay.py` to `minimap.py`; artwork box per minimap into the manifest; pytest on a synthetic image; the three boxes pinned in `test_committed_data.py`; row in DATA_FORMAT.md; `make data`; `make overlay` output unchanged
- [ ] 3.2 Scaffold `web/`: `package.json` with the exact versions, Vite, TypeScript, ESLint, Vitest and Tailwind configuration, `npm install` (approved), `npm run check` and `npm run build` run
- [ ] 3.3 `web/src/lib/`: `projection.ts`, `view.ts`, `scaleBar.ts`, `manifest.ts`, each with its tests
- [ ] 3.4 Store and data loading: manifest, minimap images, selected map, one view per map
- [ ] 3.5 Components: TopBar and MapTabs, MapView with `useCanvasLayer`, MapReadout, ZoomControls, StatusMessage; theme tokens and fonts
- [ ] 3.6 CI: second job for the app; current versions of the GitHub actions
- [ ] 3.7 Check in the preview pane on all three maps; screenshots for the pull request
- [ ] 3.8 Independent review with two agents; fixes
- [ ] 3.9 README "run the app", BRIEF.md statuses, phase-end checks; ask once to push the branch and open the pull request; stop

## Exactly where I stopped

- Branch `phase-3-app-shell`, cut from `main` at `24559ce`. `main` equals `origin/main`. This commit records the approved Phase 3 plan; the branch is local, nothing of it is pushed.
- Last completed: 3.0. No code of Phase 3 exists yet and no package is installed.
- CI run #3 on `24559ce` (the last commit made on `main`) passed.
- One planning agent (tool configuration against current documentation) had not reported when this was written. Its result is optional: the configuration is verified by running `npm run check` and `npm run build`.
- **NEXT:** 3.1 (the artwork box in the pipeline), then 3.2 onward in order. Commit after each sub-step. `npm install` in `web/` is approved for exactly the versions in PLAN.md, Phase 3.

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

2026-11-23, git flow (user's choice "Yes, per phase"):
- From Phase 3 on, each phase is done on its own branch and reaches `main` through one pull request that the user merges after review ("Rebase and merge"). `main` holds reviewed work only; once Vercel is connected, `main` is what is live and each pull request gets a preview link. Pull request descriptions carry no attribution line. Step 9.1 (creating the Vercel project) moves to right after the Phase 3 pull request is merged.

2026-11-23, from the Phase 2 review (each is described in PLAN.md's last section or in DATA_FORMAT.md, and waits for the user's review):
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
5. The review asked for a linter and a type checker in CI (ruff and mypy, development-only dependencies). Add them? The code already keeps to one line length and has type hints, but nothing checks them. Not blocking.

## Commands that work

| Command | What it does | Last passed |
|---|---|---|
| `unzip _inbox/player_data.zip -d data/raw` | restores the raw data | 2026-11-22 |
| `make setup` | creates `.venv`, installs pinned dependencies | 2026-11-22, in a fresh clone |
| `make test` | 229 tests, no raw data needed; creates `.venv` on first use | 2026-11-23 13:16 |
| `make profile` | measures the raw data → `docs/profile/` (235 metrics) | 2026-11-23 13:10 |
| `make data` | builds `web/public/data/` and the projection fixtures; writes nothing unless every check passes, the profile report included; 3 s | 2026-11-23 13:16 |
| `make overlay` | proof images → `docs/img/`, about 30 s | 2026-11-23 13:10 |

Not available yet: dev server and `npm run check` (Phase 3).

## Known issues / TODO later

- Commits stay local until the user approves each push.
- Usage: the 5-hour limit was reached on 23 Nov shortly before 17:00 IST while three planning agents ran next to a long conversation. Keep agent use low (a two-agent review per phase), and prefer a fresh session per phase, started with the resume protocol.
- CI prints a warning, not a failure: `actions/checkout@v4` and `actions/setup-python@v5` target a deprecated Node version. Look up the current versions and update them with the next change to the workflow (Phase 3 adds `npm run check` to it).
- GitHub's "Contributors" box still showed two contributors on 2026-11-23 10:45 IST, about 11 hours after the rewrite was pushed; GitHub's API lists one. The user chose to wait. Recheck before submission (also a Phase 11 check). Fallbacks: recreate the repo, or GitHub Support.
- `ARCHITECTURE.md` is a first draft of about 1,000 words. It has to fit one printed page by Phase 10: trim it then.
- The README's map constants may be 1.5 to 2% too large in x on two maps (`docs/profile/crosscheck.md`, section 4). Kept as documented, by the user's decision.
- 60 of the profiler's 235 metrics were added after the blind cross-check and were not re-derived by it (the cleaning counts among them were confirmed by a skeptic).
