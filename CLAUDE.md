# LILA BLACK Player Journeys

Take-home assignment for LILA Games (Product Engineer). A hosted browser tool that lets **Level Designers** (not data scientists) explore player telemetry from LILA BLACK, an extraction shooter: where players move, where fights break out, where people die to the storm, which map areas are ignored. Requirements as a checklist: `docs/BRIEF.md`. Phase plan: `docs/PLAN.md`.

## Session resume protocol

All project state lives in files and git, never only in a conversation: a session can be cut off at any moment. At the start of every session, before anything else:

1. Read `docs/PROGRESS.md` (imported below) and `docs/PLAN.md`.
2. Run `git status` and `git log --oneline -10`.
3. Tell the user in 5 lines where the project stands and what the next action is. Then wait for "go".

Do not redo finished work. If PROGRESS.md and the code disagree, trust the code, report the mismatch and fix PROGRESS.md. The `/resume` command (`.claude/commands/resume.md`) runs this protocol on demand.

@docs/PROGRESS.md

## Stack

- **Pipeline:** Python 3.12+ (pyarrow, pandas, numpy, Pillow, pytest). Runs offline, writes static files into `web/public/data/`.
- **App:** Vite 8 + React 19 + TypeScript (strict) + Tailwind CSS v4 + Zustand, drawing on layered HTML Canvas 2D.
- **Hosting:** Vercel, static. No backend, no environment variables.

## Layout

```
pipeline/     offline data code: maps.py (projection), dataset.py (loader), profile_data.py, verify_overlay.py, tests/
analysis/     statistics behind INSIGHTS.md (Phase 10)
web/          the app (Phase 3 onward)
docs/         PROGRESS.md (status, single source of truth), BRIEF.md, DATA_NOTES.md, PLAN.md, profile/ (measurements), img/ (mapping proof)
.claude/      settings.json (permission rules), commands/resume.md
data/raw/     unzipped player_data (git-ignored)
_inbox/       the assignment PDF and zip (git-ignored)
.local/       machine-specific session notes and raw agent output (git-ignored)
```

## Commands

```bash
make setup      # .venv + pinned dependencies
make test       # pytest, no raw data needed
make profile    # measure the raw data -> docs/profile/
make overlay    # mapping proof images -> docs/img/
```

Run pipeline modules as `.venv/bin/python -m pipeline.<module>` from the repo root.

## Working rules

1. One phase at a time. At the end of a phase: run the checks, update `docs/PLAN.md` and `docs/PROGRESS.md`, commit, summarise how to verify locally, then **stop and wait**. Never start the next phase unasked.
2. Never claim something works unless you ran it and saw the output. Show the key evidence.
3. The raw files are the source of truth. Where they disagree with the dataset README, trust the measurement, record it in `docs/DATA_NOTES.md` and say so.
4. Document every assumption. Do not get blocked: make a reasonable assumption and flag it.
5. Quality over quantity: no half-working features, no placeholder UI, no dead code. Small, typed, readable modules; pure logic apart from UI.
6. Raw data and the PDF stay out of git. No secrets. Ask before `git push`, `gh repo create`, installing a dependency, deleting files or deploying.
7. Coordinate mapping lives in one tested function per language. The per-map constants exist only in `pipeline/maps.py`; the app gets them through the manifest.
8. Do not copy code from other people's public solutions to this assignment.
9. Player ids are production data: never print or commit full user UUIDs. Use the first eight characters.
10. Update `docs/PROGRESS.md` after **every** completed sub-step, not only at phase end. Keep its "Exactly where I stopped" section current at all times.
11. Commit early and often with clear messages, for example `phase-3: add MapCanvas zoom/pan (WIP)`. Put `WIP:` in the message when a step is unfinished, and never leave uncommitted work for long. Local commits need no permission; ask before `git push`.
12. Never leave the working tree broken without a note under "Known issues" in `docs/PROGRESS.md`.
13. When the user says "I'm about to hit my limit" or "checkpoint": finish or safely stop the current edit, update `docs/PROGRESS.md`, commit, and print a 3-line status. Do nothing else.
14. At each phase end: set the status to "DONE (awaiting my review)", record the commit hash, run the checks, then stop.
15. Do not repeat research, profiling or file reads whose results are already recorded in `docs/DATA_NOTES.md`, `docs/PLAN.md` or `docs/PROGRESS.md`. Use the recorded results.

## Verified data facts (details and evidence: `docs/DATA_NOTES.md`)

- 1,243 Parquet files (no extension), 89,104 rows, 796 matches, 3 maps. One file is one journey: one player or bot in one match.
- `ts` is **Unix seconds** in a `timestamp[ms]` column. Read the raw int64; never let a library convert it.
- `event` is bytes; decode as UTF-8. Eight values: Position, BotPosition, Kill, Killed, BotKill, BotKilled, KilledByStorm, Loot.
- **Human or bot is decided per journey by its movement event** (Position = human, BotPosition = bot), not by the user_id format. 17 numeric-id journeys are human; id 1429 appears in both roles.
- Events are logged from the file owner's side at the owner's own position: `*Kill` = the owner killed, `*Killed` = the owner died. In bot files `BotKilled` is the bot's death.
- 743 of 796 matches contain a single file. Only 52 matches have bot journeys. Player-versus-player is absent in practice (3 Kill rows, each twinned with a Killed row in the same file).
- Position is sampled every 5 s **only while the player moves**; a longer gap means standing still.
- Cleaning: drop the one journey stored twice, drop the second half of the three files written twice, drop Position rows after a death. Keep repeated Loot/BotKill rows (real repeated events).
- No extraction event exists. A human journey without a death row counts as "survived".
- Mapping is exactly the README's: `u = (x - origin_x) / scale`, `v = (z - origin_z) / scale`, pixel `(u * W, (1 - v) * H)`. Minimaps are 4320x4320, 2160x2158 and 9000x9000, not 1024x1024. All rows land inside the image.
- Day folders are UTC days. The date filter uses the folder name.

## Coding conventions

- **Python:** type hints, small pure functions, pathlib, no bare `except`, no notebooks. Tests in `pipeline/tests/` must run without the raw data.
- **TypeScript:** `strict`, no `any`, pure functions in `web/src/lib/` with Vitest tests, small components, state in Zustand, the playback clock outside React.
- **Styling:** Tailwind v4 with the tokens below only; no ad-hoc hex values in components.
- **Docs:** short, tables where they help, real numbers only, each number traceable to `docs/profile/`.
- **Commits:** small and working; subject starts with `phase-N:` (or `chore:`, `docs:`, `fix:`) and says what changed; the body says why when it is not obvious.

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
| loot | `#009E73` | small square, off by default |

Every marker gets a dark outline. Fonts: Space Grotesk (headings), Inter (UI), JetBrains Mono (numbers).

## Definition of done, every phase

- Acceptance criteria in `docs/PLAN.md` met and shown with evidence (command output, screenshots).
- `make test` green; from Phase 3 also `npm run check` (tsc + eslint + vitest) in `web/`.
- No console errors in the app; no dead code; docs updated.
- Committed; `docs/PROGRESS.md` shows "DONE (awaiting my review)" with the commit hash; summary written; stopped for review.
