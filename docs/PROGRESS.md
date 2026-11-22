# Progress Log

Last updated: 2026-11-22 23:25 IST

## Current phase

Phase 1, Data discovery and repo setup. Status: **IN PROGRESS**

## Phase checklist

| # | Phase | Status | Commit |
|---|---|---|---|
| 1 | Data discovery and repo setup | IN PROGRESS | |
| 2 | Pipeline | NOT STARTED | |
| 3 | App scaffold, theme, map canvas | NOT STARTED | |
| 4 | Journeys, humans versus bots, markers | NOT STARTED | |
| 5 | Filters and URL state | NOT STARTED | |
| 6 | Timeline and playback | NOT STARTED | |
| 7 | Heatmaps | NOT STARTED | |
| 8 | Polish and performance | NOT STARTED | |
| 9 | Deploy | NOT STARTED | |
| 10 | Insights and docs | NOT STARTED | |
| 11 | Final QA | NOT STARTED | |

Phases 2 to 11 are described in [PLAN.md](PLAN.md), which is still a draft awaiting approval.

## Current phase task list

- [x] 1.1 Project folder; PDF and zip copied to `_inbox/`; zip unzipped to `data/raw/` (both git-ignored)
- [x] 1.2 `.venv` with pinned dependencies; repo initialised with the no-reply author (`c50cd6d`)
- [x] 1.3 `pipeline/maps.py` and `pipeline/dataset.py` with 22 unit tests (`2f4f3fc`)
- [x] 1.4 `pipeline/profile_data.py` → `docs/profile/profile_report.{json,md}`, 177 metrics (`6448721`, `7811c25`)
- [x] 1.5 `pipeline/verify_overlay.py` → `docs/img/overlay_*.jpg`, `orientation_*.jpg`, `docs/profile/orientation_check.json` (`6490f2a`)
- [x] 1.6 Docs drafted: `BRIEF.md`, `DATA_NOTES.md`, `PLAN.md`, `CLAUDE.md`, `README.md` stub (`a017a8b`)
- [x] 1.7 Resumable progress system: this file, `/resume`, protocol and rules in `CLAUDE.md`
- [x] 1.8 Review (3 reviewers) and cross-check (5 blind re-derivations, 4 skeptics, 2 blind overlay judges) both finished. Raw results: `.local/phase1-review-result.raw`, `.local/phase1-crosscheck-result.raw`. Outcome: 175 of 175 metrics re-derived with no difference; 6 of 6 blind orientation picks correct; all four decisions "weakened" (core holds, details to fix)
- [x] 1.9a `BRIEF.md`: the 7 review findings applied
- [ ] 1.9b Profiler and overlay script: add the numbers the reviews asked for (cleaning preview with exact removals, movement across long gaps, placeholder ids per map, share of samples on the black surround instead of any black pixel)
- [ ] 1.9c `docs/profile/crosscheck.md`: what was checked independently and what it found
- [ ] 1.9d `DATA_NOTES.md`: 15 evidence-audit findings plus the skeptics' corrections
- [ ] 1.9e `PLAN.md`: 6 blockers and 22 should-fix items from the plan review
- [ ] 1.9f `CLAUDE.md`: data facts reworded to match
- [ ] 1.10 Leak check: no raw data, PDF, work email, home-folder path or full player UUID in the tree or the history
- [ ] 1.11 Create the public GitHub repo `lila-player-journeys` and push `main` (the user chose public; the push itself still asks)
- [ ] 1.12 Phase report to the user; status to "DONE (awaiting my review)"; stop

## Exactly where I stopped

- Last completed: 1.9a, BRIEF.md fixes (this commit). The working tree is clean after it.
- Both background checks are done and saved in `.local/` (git-ignored). Nothing from the cross-check is applied yet. What it changes, in short:
  - the 17 numeric-id human journeys use per-map placeholder ids (1429 Ambrose Valley, 1379 Grand Rift, 1402 Lockdown): anonymous humans, not 3 players; id 1429 as a bot is a Lockdown bot, a collision;
  - cleaning needs 4 rules: drop one copy of the journey stored twice (keep the February_11 copy, where the rest of its match is), drop second halves of 3 doubled files, drop the 3 Kill rows that mirror a Killed row, drop movement rows after the death row in (ts, file order). Expected rows out: 88,617, to be confirmed by the profiler;
  - "match duration" is the observed span of the recorded files (one human's journey in 743 matches), not match length;
  - a registration fit suggests the map x-scale is 1.5 to 2% smaller than the README's on Ambrose Valley and Lockdown, and Grand Rift's scale is uncertain to about 3.5%. Not verified by me yet; README constants stay unless a zoomed check shows a visible misfit.
- **NEXT:** 1.9b. In `pipeline/profile_data.py` add a "cleaning" topic and the other numbers listed in 1.9b; in `pipeline/verify_overlay.py` count samples on the border-connected black surround. Run `make profile overlay test`, commit as `phase-1: profile numbers requested by the reviews`.

## Decisions and assumptions made

All dated 2026-11-22. Data decisions are recorded with evidence in [DATA_NOTES.md](DATA_NOTES.md) (row numbers in brackets).

- Project folder `~/projects/lila-player-journeys`; GitHub repo `YesudasZ/lila-player-journeys`, public from the start; commits use the GitHub no-reply address, set in this repo only (user's choices).
- Deadline assumed to be Thu 26 Nov 2026, five days after the zip was downloaded. Not confirmed.
- Python 3.12 or newer (numpy 2.5 dropped 3.11); developed on 3.14.
- Proof images are JPEG, not PNG: 0.5 to 0.9 MB each instead of several MB.
- matplotlib is not installed until something needs it. DuckDB is used for cross-checking only and is not a project dependency.
- `ts` is Unix seconds [5]. Human or bot is decided per journey by its movement event, not by the id format [8]. Events are read from the file owner's side [9]. A Kill row with a Killed twin is one death [10]. The date filter uses the folder name [13].
- Cleaning: drop the journey stored twice [14]; keep the first half of the three files written twice [15]; keep repeated Loot and BotKill rows [16]; a path ends at the death row [17]; no death row means "survived" [18].
- The README's coordinate transform is used unchanged, with the real image sizes [20, 21].
- Player ids are cut to eight characters in everything committed.
- Proposed in PLAN.md, not yet approved: one data bundle per map, heatmaps binned in the browser, a dwell-time layer, player aliases in the published data.

## Open questions for the user

1. Is Thu 26 Nov the right deadline?
2. One bundle per map and in-browser heatmaps, instead of per-match files and precomputed grids: agreed?
3. Keep the dwell-time heatmap, or hold it for the buffer?
4. Player aliases instead of ids in the published data: agreed?
5. Should `docs/PROGRESS.md`, `CLAUDE.md` and `.claude/` stay in the repo at submission? They show how the work was run with Claude Code, which the brief allows; they are also notes between us in a public repo.
6. `/resume` is also the name of a built-in Claude Code command (reopen a past conversation). In this project the name now runs the project command. Keep the name, or rename it (for example `/where`)?

## Commands that work

| Command | What it does | Last passed |
|---|---|---|
| `unzip _inbox/player_data.zip -d data/raw` | restores the raw data | 2026-11-22 |
| `make setup` | creates `.venv`, installs pinned dependencies | 2026-11-22, in a fresh clone |
| `make test` | 22 unit tests, no raw data needed | 2026-11-22 23:24 |
| `make profile` | measures the raw data → `docs/profile/` | 2026-11-22, output identical on re-run |
| `make overlay` | proof images → `docs/img/` | 2026-11-22, output identical on re-run |

Not available yet: data rebuild (`make data`, Phase 2); dev server and `npm run check` (Phase 3).

## Known issues / TODO later

- `DATA_NOTES.md` and `PLAN.md` are drafts until tasks 1.8 and 1.9 are done.
- There is no git remote yet. Nothing is pushed; the work exists only on this machine.
- No CI yet (planned in Phase 2).
- Grand Rift shows 3.1% of samples "on black" in the orientation check because the minimap's zone labels and outlines are black. It is not a mapping error.
- The cross-check's scratch files (DuckDB environment, agents' scripts, shuffled overlays) sit in a temporary folder that a reboot can clear. Nothing in the repo depends on them.
