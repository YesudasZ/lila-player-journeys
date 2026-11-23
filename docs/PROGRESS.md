# Progress Log

Last updated: 2026-11-23 13:12 IST

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
  - [x] b. Data format for the app, described in the new `docs/DATA_FORMAT.md`: each journey has an `id` and a `fate` (was: the raw death event); match entries and totals gain `bot_kills` (170), so every marker is counted once; the manifest carries `event_groups`, `fates` and `sample_step_seconds`; the projection fixture has the integer codes and what they decode to; a match filed under two day folders goes to the later one instead of stopping the build; bots are listed in numeric order. The row arrays are unchanged. Bundles are now 470, 54 and 162 kB gzipped
  - [x] c. The build writes nothing until the leak, size and profile checks have passed. `pipeline/tests/test_committed_data.py` reads the committed files and holds the accepted numbers as literals, so the check no longer depends on the profiler alone. The profiler gained 4 metrics on the span after cleaning (380 median, 887 max, 162 matches shorter by at most 5 s)
  - [x] d. Tests for every gap the mutation run found (storm deaths, positions in rules 1 to 3, rule order, manifest and report fields, raw-data checks, the full-id and size guards, minimap downscaling, fixture points): 149 tests in all. A second mutation run in 2.9f has to confirm them
  - [x] e. Documents brought in line: CLAUDE.md (layout, commands, data facts, loot default), README, ARCHITECTURE.md, DATA_NOTES.md (span after cleaning, path points, fate names, what the build now checks), PLAN.md (changed lines listed in its last section, for the user's review), BRIEF.md. Makefile creates `.venv` on first use, checks the Python version and has `make help`. CI token limited to read. No line over 140 characters outside the profiler; the overlay script uses the shared event groups (`make overlay` output unchanged)
  - [x] f. Workflow `phase2-fixes-verify` reported at 13:01 IST (result in `.local/phase2-fixes-verify-result.raw`):
    - The profiler is now `pipeline/profile/` (14 modules, longest function 40 lines) behind the unchanged command `pipeline/profile_data.py`; `make profile` output is byte-identical; 15 tests. Commit `fa27d45`
    - Recomputation without the pipeline's code: 0 differences on 11 fields of 1,242 journeys and 15 fields of 796 matches. 129 builds on odd inputs: 3 should-fix and 8 nits, all fixed (a bot file under an account id, unreadable-file and profile-file messages, stray entries in the data folder, files filed under the wrong day, two wrong sentences in DATA_FORMAT.md)
    - Second mutation run: 347 mutants against 149 tests, 61 gaps, 10 equivalent. Its 31 proposed tests are in, adapted. A test holds the 140-character line limit. 224 tests. Commit `2e28c2d`
  - [ ] g. Final mutation run: the same 347 mutants against the finished code, started 13:09 IST in the background (`scratchpad/verify2/mutation/rerun_final.py`, see `.local/session-pointers.md`); result not in yet
- [ ] 2.10 Phase-end checks; status to "DONE (awaiting my review)"; stop

## Exactly where I stopped

- Last completed: 2.9a to 2.9f, committed (last code commit `2e28c2d`). `make test` (224 tests), `make data`, `make profile` and `make overlay` pass and leave the committed files unchanged.
- In flight: 2.9g, a last mutation run on the finished code. It only reads the project. If its result is lost, re-run it or skip it: the second run already showed its proposed tests kill every non-equivalent mutant.
- Then 2.10: add the final run's numbers to `docs/profile/crosscheck.md` section 6, set Phase 2 to "DONE (awaiting my review)", commit, ask before pushing (CI on the new commits is part of the acceptance), stop.
- Nothing is pushed since `2f0d706`. Ask before pushing.
- **NEXT:** read the final mutation result, then 2.10.

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
5. The review asked for a linter and a type checker in CI (ruff and mypy, development-only dependencies). Add them? The code already keeps to one line length and has type hints, but nothing checks them.
6. PLAN.md's last section lists the lines the Phase 2 review changed after your approval. Do you agree with them, above all "every row is a point of the path"?

## Commands that work

| Command | What it does | Last passed |
|---|---|---|
| `unzip _inbox/player_data.zip -d data/raw` | restores the raw data | 2026-11-22 |
| `make setup` | creates `.venv`, installs pinned dependencies | 2026-11-22, in a fresh clone |
| `make test` | 224 tests, no raw data needed; creates `.venv` on first use | 2026-11-23 11:36 |
| `make profile` | measures the raw data → `docs/profile/` (235 metrics) | 2026-11-23 11:36 |
| `make data` | builds `web/public/data/` and the projection fixtures; writes nothing unless every check passes, the profile report included; 3 s | 2026-11-23 11:36 |
| `make overlay` | proof images → `docs/img/`, about 30 s | 2026-11-22 23:33 |

Not available yet: dev server and `npm run check` (Phase 3).

## Known issues / TODO later

- Commits stay local until the user approves each push.
- GitHub's "Contributors" box still showed two contributors on 2026-11-23 10:45 IST, about 11 hours after the rewrite was pushed; GitHub's API lists one. The user chose to wait. Recheck before submission (also a Phase 11 check). Fallbacks: recreate the repo, or GitHub Support.
- `ARCHITECTURE.md` is a first draft of about 1,000 words. It has to fit one printed page by Phase 10: trim it then.
- The README's map constants may be 1.5 to 2% too large in x on two maps (`docs/profile/crosscheck.md`, section 4). Kept as documented, by the user's decision.
- 60 of the profiler's 235 metrics were added after the blind cross-check and were not re-derived by it (the cleaning counts among them were confirmed by a skeptic).
