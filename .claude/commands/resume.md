---
description: Pick this project up from docs/PROGRESS.md and report where it stands
---

Resume this project from its recorded state. Do not start any new work inside this command.

1. Read `docs/PROGRESS.md`, `docs/PLAN.md` and `CLAUDE.md`.
2. Run `git status` and `git log --oneline -10`.
3. Check the "Exactly where I stopped" section of `docs/PROGRESS.md` against the working tree and the last commits. Are the files it names in the state it describes? Is anything uncommitted? Does the newest commit match the last ticked task?
4. If `docs/PROGRESS.md` and the code disagree, trust the code, tell me what differs, and correct `docs/PROGRESS.md`.
5. Summarise the state in exactly 5 lines:
   - current phase and its status
   - the last thing completed, with its commit hash
   - anything uncommitted or still in flight
   - the next concrete action
   - open questions that block it
6. Ask me to confirm before continuing, and wait for my answer.

Do not repeat research, profiling or file reads whose results are already recorded in `docs/DATA_NOTES.md`, `docs/PLAN.md` or `docs/PROGRESS.md`. Use the recorded results.
