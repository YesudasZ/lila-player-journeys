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
- [ ] 1.8 Apply the review findings (3 reviewers: brief coverage, evidence audit, plan realism) to `BRIEF.md`, `DATA_NOTES.md`, `PLAN.md`, `CLAUDE.md`. Review finished; findings not applied yet
- [ ] 1.9 Cross-check (5 blind re-derivations of the metrics, 4 skeptics on the decisions, 2 blind overlay judges): still running. Write the outcome to `docs/profile/crosscheck.md` and fix whatever it disproves
- [ ] 1.10 Leak check: no raw data, PDF, work email, home-folder path or full player UUID in the tree or the history
- [ ] 1.11 Create the public GitHub repo `lila-player-journeys` and push `main` (the user chose public; the push itself still asks)
- [ ] 1.12 Phase report to the user; status to "DONE (awaiting my review)"; stop

## Exactly where I stopped

- Last completed: 1.7, the progress system (this commit). The working tree is clean after it; no file is half-edited.
- Review output (1.8) is saved, unapplied, in `.local/phase1-review-result.raw` (git-ignored). Its two "should fix" items seen so far: the brief wants the deployed URL written in the repo, and "position is sampled only while moving" is an inference that needs its own metric or an assumption row.
- The cross-check (1.9) runs in the background of the 22 Nov session. If that session is gone, `.local/session-pointers.md` says where its result file and transcripts are.
- **NEXT:** read `.local/phase1-review-result.raw` in full, apply the findings, re-run `make profile` if the profiler changes, commit as `phase-1: apply review findings`.

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
