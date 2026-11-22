# Progress Log

Last updated: 2026-11-22 23:56 IST

## Current phase

Phase 1, Data discovery and repo setup. Status: **DONE (awaiting my review)**

Repo: https://github.com/YesudasZ/lila-player-journeys (public). `main` was pushed on 2026-11-22 after the user said "Yes, push".

## Phase checklist

| # | Phase | Status | Commit |
|---|---|---|---|
| 1 | Data discovery and repo setup | DONE (awaiting my review) | `bc63f0e` |
| 2 | Pipeline | NOT STARTED | |
| 3 | App shell and map canvas (ends with the first deployment, step 9.1) | NOT STARTED | |
| 4 | Journeys, humans versus bots, markers | NOT STARTED | |
| 5 | Filters and URL state | NOT STARTED | |
| 6 | Timeline and playback | NOT STARTED | |
| 7 | Heatmaps | NOT STARTED | |
| 8 | Polish | NOT STARTED | |
| 9 | Deployment (9.1 after Phase 3, 9.2 on the last day) | NOT STARTED | |
| 10 | Insights and docs | NOT STARTED | |
| 11 | Final QA | NOT STARTED | |

Phases 2 to 11 are described in [PLAN.md](PLAN.md), a draft awaiting approval.

## Current phase task list

- [x] 1.1 Project folder; PDF and zip copied to `_inbox/`; zip unzipped to `data/raw/` (both git-ignored)
- [x] 1.2 `.venv` with pinned dependencies; repo initialised with the no-reply author (`0e02ae3`)
- [x] 1.3 `pipeline/maps.py` and `pipeline/dataset.py` with 22 unit tests (`7f697a3`)
- [x] 1.4 `pipeline/profile_data.py` → `docs/profile/profile_report.{json,md}` (`0084a38`, `596e694`; 231 metrics since `ec5f537`)
- [x] 1.5 `pipeline/verify_overlay.py` → `docs/img/overlay_*.jpg`, `orientation_*.jpg`, `docs/profile/orientation_check.json` (`89800f0`)
- [x] 1.6 Docs drafted: `BRIEF.md`, `DATA_NOTES.md`, `PLAN.md`, `CLAUDE.md`, `README.md` stub (`d22e705`)
- [x] 1.7 Resumable progress system: this file, `/resume`, protocol and rules in `CLAUDE.md` (`2171c5a`)
- [x] 1.8 Review (3 reviewers) and cross-check (5 blind re-derivations, 4 skeptics, 2 blind overlay judges) finished. Raw results in `.local/` (git-ignored); summary in `docs/profile/crosscheck.md`
- [x] 1.9 All findings applied: `BRIEF.md` (`6dff70b`), profiler and overlay script (`ec5f537`), `crosscheck.md` and `DATA_NOTES.md` (`c3cfe0d`), `PLAN.md` second version and `CLAUDE.md` data facts (this commit)
- [x] 1.10 Leak check passed on the tree and the whole history: 29 tracked files, 4.1 MB; no raw data, PDF or zip; no private email address, home-folder path, token or full player UUID; the only author is the no-reply address
- [x] 1.11 Public GitHub repo created and `main` pushed, on the user's go: https://github.com/YesudasZ/lila-player-journeys
- [x] 1.12 Phase report given to the user; stopped for review

## Exactly where I stopped

- Phase 1 is complete at `bc63f0e` and waits for review. The working tree is clean.
- **Local `main` was rewritten on 2026-11-22 to remove the `Co-Authored-By` line from every commit message** (user's request). Files, authors and dates are unchanged, checked commit by commit. Every commit hash changed; the hashes in this file are the new ones.
- Until the user runs `git push --force-with-lease origin main`, local `main` and `origin/main` have diverged and GitHub still shows the old 16 commits. **Do not pull, merge or rebase onto `origin/main` before that.**
- The old history is kept locally in the branch `backup-before-trailer-rewrite` (and in `refs/original/`). Delete both once the force push is confirmed.
- `docs/PLAN.md` (second version) is a draft. No application code exists and none may be written until the user approves it.
- **NEXT:** when the user confirms the force push, check that `git status -sb` shows `main...origin/main` with nothing ahead or behind, then delete the backup branch. After that, wait for the review: once the user approves PLAN.md and answers the open questions below, start Phase 2 with `pipeline/clean.py` and its tests. Every further push needs the user's go.

## Decisions and assumptions made

All dated 2026-11-22. Data decisions are recorded with evidence in [DATA_NOTES.md](DATA_NOTES.md) (row numbers in brackets, assumptions as A1 to A8).

- Project folder `~/projects/lila-player-journeys`; GitHub repo `YesudasZ/lila-player-journeys`, public from the start; commits use the GitHub no-reply address, set in this repo only (user's choices).
- Deadline assumed to be Thu 26 Nov 2026, five days after the zip was downloaded. Not confirmed.
- Python 3.12 or newer (numpy 2.5 dropped 3.11); developed on 3.14. Proof images are JPEG, not PNG. matplotlib is not installed until something needs it. DuckDB was used for cross-checking only.
- `ts` is Unix seconds [5]. Position is recorded about every 5 s and not while standing still [6, A6]. Sort by (`ts`, file order) [7].
- Human or bot is decided per journey by its movement event [8]. The 17 numeric-id human journeys carry per-map placeholder ids and are "anonymous humans" [8, A1].
- Events are read from the file owner's side, at the owner's position [9]. There is no verifiable player-versus-player kill [10].
- "Duration" is the observed span of the recorded files, not match length [12]. Day folders are UTC days by time of writing; the date filter uses the folder name [13].
- Cleaning, four rules in order: keep the February_11 copy of the journey stored twice (88 rows removed), first half of the three files written twice (190), drop Kill rows mirrored by a Killed row (3), drop movement rows after the death row (206). 88,617 rows and 1,242 journeys remain [14 to 17]. Repeated Loot and BotKill rows are kept [16, A2].
- No death row means "no death recorded" [18, A3]. Storm deaths are markers, not a heatmap [19].
- The README's coordinate transform and constants are used unchanged, with the real image sizes; orientation is proven, scale and origin are right to about 1 to 2% [20, 21, A8]. Elevation is kept in the app's data.
- Public ids are 8-character prefixes of player and match ids (unique: 245 and 796). No full player UUID is committed.
- Commit messages carry no `Co-Authored-By` line (user's choice, 2026-11-22; the rule is in `CLAUDE.md`). Earlier commit messages were rewritten to remove it.
- Proposed in PLAN.md, not yet approved: the scope ladder, one data bundle per map, heatmaps binned in the browser, first deployment right after Phase 3.

## Open questions for the user

1. Is Thu 26 Nov the right deadline, and at what hour?
2. The scope ladder in PLAN.md: agreed? It turns the storm heatmap into markers, adds a loot heatmap, and puts the dwell layer, density strip and all-matches playback below the core.
3. One data bundle per map and in-browser heatmaps, instead of per-match files and precomputed grids: agreed?
4. Public ids as 8-character prefixes: agreed?
5. Map constants: keep the README's (recommended), or apply the fitted x scale on Ambrose Valley and Lockdown? See `docs/profile/crosscheck.md`, section 4.
6. One review per phase, or one per day?
7. Should `docs/PROGRESS.md`, `CLAUDE.md` and `.claude/` stay in the repo at submission? They show how the work was run with Claude Code, which the brief allows; they are also working notes in a public repo.
8. The "Outside claims about this dataset, tested" table in DATA_NOTES.md shows that claims from outside were checked. Keep it, or drop it before submission?
9. `/resume` is also the name of a built-in Claude Code command (reopen a past conversation). The documentation says a project skill of the same name replaces the built-in in a terminal session; for a `.claude/commands` file it does not say. Keep the name, or rename it (for example `/where`)?

## Commands that work

| Command | What it does | Last passed |
|---|---|---|
| `unzip _inbox/player_data.zip -d data/raw` | restores the raw data | 2026-11-22 |
| `make setup` | creates `.venv`, installs pinned dependencies | 2026-11-22, in a fresh clone |
| `make test` | 22 unit tests, no raw data needed | 2026-11-22 23:38 |
| `make profile` | measures the raw data → `docs/profile/` (231 metrics) | 2026-11-22 23:39 |
| `make overlay` | proof images → `docs/img/`, about 30 s | 2026-11-22 23:33 |

Not available yet: data rebuild (`make data`, Phase 2); dev server and `npm run check` (Phase 3).

## Known issues / TODO later

- Local `main` diverges from `origin/main` until the user force-pushes the rewritten history (see "Exactly where I stopped"). After that, commits stay local until the user approves each push.
- No CI yet (planned in Phase 2).
- The README's map constants may be 1.5 to 2% too large in x on two maps (open question 5). The proof images use the README constants.
- 56 of the profiler's 231 metrics were added after the blind cross-check and were not re-derived by it (the cleaning counts among them were confirmed by a skeptic).
- The cross-check's scratch files (DuckDB environment, agents' scripts, shuffled overlays) sit in a temporary folder that a reboot can clear. Nothing in the repo depends on them.
