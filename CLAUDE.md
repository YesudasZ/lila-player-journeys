# LILA BLACK Player Journeys

Take-home assignment for LILA Games (Product Engineer). A hosted browser tool that lets **Level Designers** (not data scientists) explore player telemetry from LILA BLACK, an extraction shooter: where players move, where fights break out, where people die to the storm, which map areas are ignored. Requirements as a checklist: `docs/BRIEF.md`. Phase plan: `docs/PLAN.md`.

## Session resume protocol

All project state lives in files and git, never only in a conversation: a session can be cut off at any moment. At the start of every session, before anything else:

1. Read `docs/PROGRESS.md` (imported below) and `docs/PLAN.md`.
2. Run `git status` and `git log --oneline -10`. `git status` names the branch: a phase in progress lives on its own branch (see "Git flow").
3. Tell the user in 5 lines where the project stands and what the next action is. Then wait for "go".

Do not redo finished work. If PROGRESS.md and the code disagree, trust the code, report the mismatch and fix PROGRESS.md. The `/resume` command (`.claude/commands/resume.md`) runs this protocol on demand.

@docs/PROGRESS.md

## Stack

- **Pipeline:** Python 3.12+ (pyarrow, pandas, numpy, Pillow, pytest). Runs offline, writes static files into `web/public/data/`.
- **App:** Vite 8 + React 19 + TypeScript (strict) + Tailwind CSS v4 + Zustand, drawing on layered HTML Canvas 2D.
- **Hosting:** Vercel, static. No backend, no environment variables.

## Layout

```
pipeline/     offline data code: dataset.py (loader), clean.py (the four rules), journeys.py (actor, fate, match counts), maps.py (projection),
              encode.py, minimap.py, playback.py (the reference for the app's playback), build_data.py (writes web/public/data/ and the test fixtures), profile_data.py and profile/ (measurements, one module per topic),
              verify_overlay.py (mapping proof), tests/
analysis/     statistics behind INSIGHTS.md (Phase 10)
web/          the app: src/lib/ (pure functions with their Vitest files), src/state/ (Zustand), src/data/ (loading), src/testing/ (the committed manifest for tests), src/components/
              (React frame; mapSurface.ts is the plain DOM code that handles input and holds the layers of layers/, which draw); public/data/ is written by `make data` and committed
docs/         PROGRESS.md (status, single source of truth), BRIEF.md, DATA_NOTES.md, DATA_FORMAT.md (the files the app loads), PLAN.md, profile/ (measurements), img/ (mapping proof)
.claude/      settings.json (permission rules), commands/resume.md
data/raw/     unzipped player_data (git-ignored)
_inbox/       the assignment PDF and zip (git-ignored)
.local/       machine-specific session notes and raw agent output (git-ignored)
```

## Commands

```bash
make test       # pytest, no raw data needed; creates .venv on first use
make data       # raw data -> web/public/data/ and the two test fixtures; writes nothing unless every check passes
make profile    # measure the raw data -> docs/profile/
make overlay    # mapping proof images -> docs/img/
make help       # all targets
cd web && npm run check   # type check + ESLint + Vitest; `npm run dev` serves the app, `npm run build` builds it
```

Run pipeline modules as `.venv/bin/python -m pipeline.<module>` from the repo root.

## Working rules

1. One phase at a time. At the end of a phase: run the checks, update `docs/PLAN.md` and `docs/PROGRESS.md`, commit, ask to push the phase branch and open its pull request, summarise how to verify locally, then **stop and wait**. Never start the next phase unasked.
2. Never claim something works unless you ran it and saw the output. Show the key evidence.
3. The raw files are the source of truth. Where they disagree with the dataset README, trust the measurement, record it in `docs/DATA_NOTES.md` and say so.
4. Document every assumption. Do not get blocked: make a reasonable assumption and flag it.
5. Quality over quantity: no half-working features, no placeholder UI, no dead code. Small, typed, readable modules; pure logic apart from UI.
6. Raw data and the PDF stay out of git. No secrets. Ask before `git push`, `gh repo create`, installing a dependency, deleting files or deploying.
7. Coordinate mapping lives in one tested function per language. The per-map constants exist only in `pipeline/maps.py`; the app gets them through the manifest. The same goes for event groups, fates and the sample step (`pipeline/dataset.py`, `pipeline/journeys.py`): the app reads them from the manifest and repeats none of them.
8. Do not copy code from other people's public solutions to this assignment.
9. Player ids are production data: never print, commit or publish a full user UUID. A player's public id is the first eight characters of the UUID and a match's public id the first eight of its match id (both unique in this dataset; the build checks it). Bot numbers are not personal and are used as they are.
10. Update `docs/PROGRESS.md` after **every** completed sub-step, not only at phase end. Keep its "Exactly where I stopped" section current at all times.
11. Commit early and often with clear messages, for example `phase-3: add MapCanvas zoom/pan (WIP)`. Put `WIP:` in the message when a step is unfinished, and never leave uncommitted work for long. Local commits need no permission; ask before `git push`.
12. Never leave the working tree broken without a note under "Known issues" in `docs/PROGRESS.md`.
13. When the user says "I'm about to hit my limit" or "checkpoint": finish or safely stop the current edit, update `docs/PROGRESS.md`, commit, and print a 3-line status. Do nothing else.
14. At each phase end: set the status to "DONE (awaiting my review)", record the commit hash and, once it exists, the pull request, run the checks, then stop.
15. Do not repeat research, profiling or file reads whose results are already recorded in `docs/DATA_NOTES.md`, `docs/PLAN.md` or `docs/PROGRESS.md`. Use the recorded results.

## Git flow (user's decision, 2026-11-23; from Phase 3 on)

Phases 1 and 2 were committed straight to `main`. From Phase 3 on:

- `main` holds reviewed phases only. Once Vercel is connected, `main` is what is live.
- Each phase is done on its own branch, cut from an up-to-date `main` and named `phase-N-<short-name>`, for example `phase-3-app-shell`. A change outside a phase gets a branch of its own (`chore-...`, `fix-...`).
- Commits on the branch follow the conventions below and need no permission. Every `git push` still needs a yes.
- At the end of the phase, ask once, then push the branch and open one pull request into `main` (`gh pr create`). Its description says what the phase delivers, the evidence for each acceptance criterion and how to verify. CI runs on the pull request; once Vercel is connected it adds a preview link, and the phase is checked there.
- Then stop. The user reviews and merges on GitHub with "Rebase and merge", which keeps the history linear. Never merge a pull request and never turn on auto-merge. Changes asked for in the review go onto the same branch.
- After the merge: switch to `main`, `git pull --ff-only`, and cut the next branch only on the user's go. A merge by rebase gives the commits new hashes, so refer to a merged phase by its pull request, not by a hash from the branch. Delete a merged branch only on the user's word.
- `docs/PROGRESS.md` travels with the branch: it names the branch and, once it exists, the pull request.

## Data facts (evidence, row by row: `docs/DATA_NOTES.md`; independent check: `docs/profile/crosscheck.md`)

Measured unless marked as an assumption (A1 to A9 in DATA_NOTES.md).

- 1,243 Parquet files (no extension), 89,104 rows, 796 matches, 3 maps. One file is one journey, one player or bot in one match; one journey is stored twice.
- `ts` is **Unix seconds** in a `timestamp[ms]` column. Read the raw int64; never let a library convert it.
- `event` is bytes; decode as UTF-8. Eight values: Position, BotPosition, Kill, Killed, BotKill, BotKilled, KilledByStorm, Loot.
- **Human or bot is decided per journey by its movement event** (Position = human, BotPosition = bot), not by the user_id format. 17 journeys have Position rows under a numeric id; those ids are per-map placeholders (1429, 1379, 1402), not players. They are treated as anonymous humans (assumption A1): drawn, flagged, left out of player counts and survival rates. Key actors by match and id, never by id alone.
- Events are logged from the file owner's side at the owner's own position: `*Kill` = the owner killed, `*Killed` = the owner died. In bot files `BotKilled` is the bot's death.
- 743 of 796 matches contain a single file. Only 52 matches have bot journeys. No player-versus-player kill is verifiable: the 3 Kill rows each mirror a Killed row of the same file.
- Position is recorded about every 5 s and not while the player stands still. Across a longer gap the player is taken to hold still, then move in the last 5 s (assumption A6).
- **Cleaning, four rules in order** (expected removals from the profiler's `cleaning` topic): keep one copy of the journey stored twice, the one filed with most of its match (88 rows); keep the first half of the three files written twice (190); drop a Kill row mirrored by a Killed row (3); drop movement rows after a death row in (`ts`, file order) (206). 88,617 rows and 1,242 journeys remain. Repeated Loot and BotKill rows are kept.
- Always sort by (`ts`, row order in the file): `ts` has one-second resolution. After cleaning no file has rows out of time order and no journey has two death rows; the build stops if either appears.
- **The app's data is described in `docs/DATA_FORMAT.md`.** Every row, whatever its event, is where the journey's owner stood in that second. A journey's path is its rows up to and including its death row. A match entry counts every marker once: kills, deaths, storm_deaths and loot, plus bot_kills and bot_deaths. A journey's `fate` is one of a closed list. Ids are text, and only `actor` says human or bot.
- A changed number in `web/public/data/` has to be accepted in `pipeline/tests/test_committed_data.py`, which holds the Phase 2 numbers as literals.
- No extraction or match-end event exists. A human journey without a death row is "no death recorded". Match length is not in the data: the measurable quantity is the observed span of the recorded files (382 s at the median in the raw files; 380 s after cleaning, which is what the manifest holds).
- Mapping uses the README's formula and constants: `u = (x - origin_x) / scale`, `v = (z - origin_z) / scale`, pixel `(u * W, (1 - v) * H)`. Orientation is proven; scale and origin are right to about 1 to 2% of the map width (assumption A8). Minimaps are 4320x4320, 2160x2158 and 9000x9000, not 1024x1024. All rows land inside the image. `y` is elevation and is kept in the app's data.
- Day folders are UTC days, by time of writing. The date filter uses the folder name.

## Coding conventions

- **Python:** type hints, small pure functions, pathlib, no bare `except`, no notebooks, no line over 140 characters (a test checks it). Tests in `pipeline/tests/` must run without the raw data.
- **TypeScript:** `strict`, no `any`, pure functions in `web/src/lib/` with Vitest tests, small components, state in Zustand, the playback clock outside React.
- **Styling:** Tailwind v4 with the tokens below only; no ad-hoc hex values in components.
- **Docs:** short, tables where they help, real numbers only, each number traceable to `docs/profile/`.
- **Commits:** small and working; subject starts with `phase-N:` (or `chore:`, `docs:`, `fix:`) and says what changed; the body says why when it is not obvious. No `Co-Authored-By` line or any other attribution trailer (user's decision, 2026-11-22). The same goes for pull request descriptions.

## Design tokens ("LILA Night")

| Token | Value | Use |
|---|---|---|
| bg | `#0C0C0D` | app background |
| surface / surface-2 | `#141418` / `#1C1D23` | panels / cards and inputs |
| border | `#2A2C35` | dividers |
| text / text-muted | `#F2F1EC` / `#9A9CA8` | text / labels |
| accent | `#E23C8C` | magenta: active tab, play button, focus ring |
| accent-2 | `#2EC4B6` | teal: secondary highlights, links |
| highlight | `#F4E27A` | selected player, time needle |
| human | `#56B4E9` | solid path, round head |
| bot | `#E69F00` | dashed path, square head |
| kill | `#F0E442` | triangle |
| death | `#D55E00` | cross |
| storm death | `#CC79A7` | diamond |
| loot | `#009E73` | small ring (a square could not be told from a bot's square head in greyscale); on in single-match view, off in all-matches view |

Every marker gets a dark outline. Fonts: Space Grotesk (headings), Inter (UI), JetBrains Mono (numbers).

## Definition of done, every phase

- Acceptance criteria in `docs/PLAN.md` met and shown with evidence (command output, screenshots).
- `make test` green; from Phase 3 also `npm run check` (tsc + eslint + vitest) in `web/`.
- No console errors in the app; no dead code; docs updated.
- Committed on the phase branch; `docs/PROGRESS.md` shows "DONE (awaiting my review)" with the commit hash; pushed and a pull request opened once the user has agreed; summary written; stopped for review.
