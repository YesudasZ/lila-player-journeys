# Progress Log

Last updated: 2026-11-22 23:41 IST

## Current phase

Phase 1, Data discovery and repo setup. Status: **IN PROGRESS** (all analysis and documents done; leak check, GitHub repo and push remain)

## Phase checklist

| # | Phase | Status | Commit |
|---|---|---|---|
| 1 | Data discovery and repo setup | IN PROGRESS | |
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
- [x] 1.2 `.venv` with pinned dependencies; repo initialised with the no-reply author (`c50cd6d`)
- [x] 1.3 `pipeline/maps.py` and `pipeline/dataset.py` with 22 unit tests (`2f4f3fc`)
- [x] 1.4 `pipeline/profile_data.py` → `docs/profile/profile_report.{json,md}` (`6448721`, `7811c25`; 231 metrics since `b241d7b`)
- [x] 1.5 `pipeline/verify_overlay.py` → `docs/img/overlay_*.jpg`, `orientation_*.jpg`, `docs/profile/orientation_check.json` (`6490f2a`)
- [x] 1.6 Docs drafted: `BRIEF.md`, `DATA_NOTES.md`, `PLAN.md`, `CLAUDE.md`, `README.md` stub (`a017a8b`)
- [x] 1.7 Resumable progress system: this file, `/resume`, protocol and rules in `CLAUDE.md` (`90e00e1`)
- [x] 1.8 Review (3 reviewers) and cross-check (5 blind re-derivations, 4 skeptics, 2 blind overlay judges) finished. Raw results in `.local/` (git-ignored); summary in `docs/profile/crosscheck.md`
- [x] 1.9 All findings applied: `BRIEF.md` (`2ca4968`), profiler and overlay script (`b241d7b`), `crosscheck.md` and `DATA_NOTES.md` (`a161474`), `PLAN.md` second version and `CLAUDE.md` data facts (this commit)
- [ ] 1.10 Leak check: no raw data, PDF, work email, home-folder path or full player UUID in the tree or the history
- [ ] 1.11 Create the public GitHub repo `lila-player-journeys` and push `main` (the user chose public; the push itself still asks)
- [ ] 1.12 Phase report to the user; status to "DONE (awaiting my review)"; stop

## Exactly where I stopped

- Last completed: 1.9, every review and cross-check finding is applied (this commit). The working tree is clean after it. `make test`, `make profile` and `make overlay` pass and their outputs are committed.
- Nothing is half-edited. `docs/DATA_NOTES.md`, `docs/PLAN.md` and `CLAUDE.md` agree with each other and with `docs/profile/profile_report.json`.
- Not done: nothing is pushed. No GitHub repo exists yet.
- **NEXT:** 1.10. Run the leak check on the tree and on `git log -p` (patterns: `.nakama-0` files, `.pdf`, `.zip`, the work email domain, `/Users/`, 36-character UUIDs other than the two made-up ones in `pipeline/tests/test_dataset.py`). Then 1.11: `gh repo create lila-player-journeys --public --source=. --remote=origin --push`, then write the phase report.

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
- Proposed in PLAN.md, not yet approved: the scope ladder, one data bundle per map, heatmaps binned in the browser, first deployment right after Phase 3.

## Open questions for the user

1. Is Thu 26 Nov the right deadline, and at what hour?
2. The scope ladder in PLAN.md: agreed? It turns the storm heatmap into markers, adds a loot heatmap, and puts the dwell layer, density strip and all-matches playback below the core.
3. One data bundle per map and in-browser heatmaps, instead of per-match files and precomputed grids: agreed?
4. Public ids as 8-character prefixes: agreed?
5. Map constants: keep the README's (recommended), or apply the fitted x scale on Ambrose Valley and Lockdown? See `docs/profile/crosscheck.md`, section 4.
6. One review per phase, or one per day?
7. Should `docs/PROGRESS.md`, `CLAUDE.md` and `.claude/` stay in the repo at submission? They show how the work was run with Claude Code, which the brief allows; they are also working notes in a public repo.
8. `/resume` is also the name of a built-in Claude Code command (reopen a past conversation). The documentation says a project skill of the same name replaces the built-in in a terminal session; for a `.claude/commands` file it does not say. Keep the name, or rename it (for example `/where`)?

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

- There is no git remote yet. Nothing is pushed; the work exists only on this machine.
- No CI yet (planned in Phase 2).
- The README's map constants may be 1.5 to 2% too large in x on two maps (open question 5). The proof images use the README constants.
- 41 of the profiler's metrics were added after the blind cross-check and were not re-derived by it (the cleaning counts among them were confirmed by a skeptic).
- The cross-check's scratch files (DuckDB environment, agents' scripts, shuffled overlays) sit in a temporary folder that a reboot can clear. Nothing in the repo depends on them.
