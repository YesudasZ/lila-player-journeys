# Progress Log

Last updated: 2026-11-23 11:26 IST

## Current phase

Phase 2, Pipeline. Status: **IN PROGRESS**

Repo: https://github.com/YesudasZ/lila-player-journeys (public).

## Phase checklist

| # | Phase | Status | Commit |
|---|---|---|---|
| 1 | Data discovery and repo setup | APPROVED | `bc63f0e` |
| 2 | Pipeline | IN PROGRESS | |
| 3 | App shell and map canvas (ends with the first deployment, step 9.1) | NOT STARTED | |
| 4 | Journeys, humans versus bots, markers | NOT STARTED | |
| 5 | Filters and URL state | NOT STARTED | |
| 6 | Timeline and playback | NOT STARTED | |
| 7 | Heatmaps | NOT STARTED | |
| 8 | Polish | NOT STARTED | |
| 9 | Deployment (9.1 after Phase 3, 9.2 on the last day) | NOT STARTED | |
| 10 | Insights and docs | NOT STARTED | |
| 11 | Final QA | NOT STARTED | |

[PLAN.md](PLAN.md) was approved by the user on 2026-11-23.

## Current phase task list

Phase 2 deliverables and acceptance numbers are in PLAN.md, "Phase 2".

- [x] 2.1 `pipeline/clean.py`: the four cleaning rules, with 14 tests. On the real data: 88, 190, 3 and 206 rows removed, 88,617 left, as expected
- [x] 2.2 `pipeline/journeys.py`: actor, anonymous flag, death event, public ids, match table, checks; 9 tests
- [x] 2.3 `pipeline/encode.py` (u, v on a 65,535-step grid; elevation in tenths), `uv_to_world` in `maps.py`, `pipeline/minimap.py` (shared image loader); tests
- [x] 2.4 `pipeline/build_data.py`: manifest, map bundles, minimaps, cleaning report, projection fixtures, validation; 14 end-to-end tests on synthetic files; `make data`
- [x] 2.5 Real data built in 3 s, byte-identical on a second run. Counts agree with the profiler and with PLAN.md: 796 matches (284/201/162/112/37 per day), 798 human journeys (17 anonymous), 444 bot journeys, 2,236 kills, 404 deaths, 39 storm deaths, 12,829 loot rows, 296 bot deaths. Bundles gzipped: 463, 53 and 160 kB. `web/public/data/` committed
- [x] 2.6 Profiler uses `clean.py`, `EVENTS` and `actor_by_file` (one implementation of each rule); `make profile` left `docs/profile/` byte-identical
- [x] 2.7 `.github/workflows/ci.yml` (pytest on Python 3.12 and 3.14) and `pipeline/tests/test_repo_hygiene.py`. The workflow has never run: it needs a push
- [x] 2.8 `ARCHITECTURE.md` first draft (stack, data flow, coordinate mapping, assumptions, trade-offs); README has a data pipeline section and a CI badge; BRIEF.md statuses updated
- [x] 2.9 Independent review of the phase (3 reviewers: recomputation, mutation testing, consumer and code quality). No blocker: all 1,242 journeys and 796 match entries were recomputed independently and agree. 59 findings (14 + 19 + 26), saved in `.local/phase2-review-result.raw`. CI run #1 on `2f0d706` is green
- [ ] 2.9 fixes, in commits of their own:
  - [x] a. Loader and cleaning rules: one expected schema, every sub-folder read (not only `February_*`), hidden files skipped, `ts` checked to be Unix seconds, a file without rows reported, rules 2 and 3 no longer rely on row labels, rule 1 accepts a copy that was also written twice, the build stops on a file out of time order or a journey with two death rows, messages show 8-character ids. `make data` and `make profile` output unchanged
  - [ ] b. Data format for the app: `fate`, journey ids, bot kills, event groups and the sample step in the manifest, integer codes in the projection fixture, `docs/DATA_FORMAT.md`
  - [ ] c. The build checks everything before it writes; a test reads the committed data and pins the accepted numbers
  - [ ] d. Tests for the mutants that survived
  - [ ] e. Docs, CLAUDE.md, Makefile, CI
  - [ ] f. Profiler tidy-up; a second check of the fixes
- [ ] 2.10 Phase-end checks; status to "DONE (awaiting my review)"; stop

## Exactly where I stopped

- Last completed: 2.9a (loader and cleaning fixes from the review), committed. `make test` passes (100 tests); `make data` and `make profile` still write byte-identical files.
- In progress: 2.9b, the data format changes. They touch `pipeline/journeys.py`, `pipeline/build_data.py`, their tests, and regenerate `web/public/data/`.
- The review result is in `.local/phase2-review-result.raw` (not in git). Findings are numbered there per reviewer; the list above says which are done.
- Nothing is pushed since `2f0d706`. Ask before pushing.
- **NEXT:** 2.9b to 2.9f in order, each ending with `make test`, `make data`, a commit and this file updated. Then 2.10.

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

2026-11-23:
- The user approved PLAN.md with the recommended answers: deadline Thu 26 Nov (end of day until the hour is known); the scope ladder as written; one data bundle per map with heatmaps binned in the browser; public ids are 8-character prefixes of player and match ids; the README's map constants; one review per phase.
- The stale "Contributors" box on GitHub: the user chose to wait for GitHub to refresh it.

## Open questions for the user

1. Should `docs/PROGRESS.md`, `CLAUDE.md` and `.claude/` stay in the repo at submission? They show how the work was run with Claude Code, which the brief allows; they are also working notes in a public repo.
2. The "Outside claims about this dataset, tested" table in DATA_NOTES.md shows that claims from outside were checked. Keep it, or drop it before submission?
3. `/resume` is also the name of a built-in Claude Code command (reopen a past conversation). Keep the name, or rename it (for example `/where`)?
4. At what hour on Thu 26 Nov is the submission due?

## Commands that work

| Command | What it does | Last passed |
|---|---|---|
| `unzip _inbox/player_data.zip -d data/raw` | restores the raw data | 2026-11-22 |
| `make setup` | creates `.venv`, installs pinned dependencies | 2026-11-22, in a fresh clone |
| `make test` | 78 unit tests, no raw data needed | 2026-11-23 10:54 |
| `make profile` | measures the raw data → `docs/profile/` (231 metrics) | 2026-11-23 10:54 |
| `make data` | builds `web/public/data/` and the projection fixtures, then reconciles with the profile report; 3 s | 2026-11-23 10:53 |
| `make overlay` | proof images → `docs/img/`, about 30 s | 2026-11-22 23:33 |

Not available yet: dev server and `npm run check` (Phase 3).

## Known issues / TODO later

- Commits stay local until the user approves each push.
- GitHub's "Contributors" box still showed two contributors on 2026-11-23 10:45 IST, about 11 hours after the rewrite was pushed; GitHub's API lists one. The user chose to wait. Recheck before submission (also a Phase 11 check). Fallbacks: recreate the repo, or GitHub Support.
- `ARCHITECTURE.md` is a first draft of about 900 words. It has to fit one printed page by Phase 10: trim it then.
- The README's map constants may be 1.5 to 2% too large in x on two maps (`docs/profile/crosscheck.md`, section 4). Kept as documented, by the user's decision.
- 56 of the profiler's 231 metrics were added after the blind cross-check and were not re-derived by it (the cleaning counts among them were confirmed by a skeptic).
