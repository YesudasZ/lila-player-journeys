# Independent cross-check of the Phase 1 findings

Before any application code was written, the profiler's numbers and the pipeline decisions built on them were checked by separate AI agents (Claude Code subagents with fresh context), run as two workflows on 22 Nov 2026. This file records what they checked and what came back.

Their scripts were throwaway and are not in this repo. Where a finding matters to the pipeline, the profiler now measures it, so it can be reproduced with `make profile`; the metric key is given. Findings that only the agents measured are marked "agent only".

## 1. Blind re-derivation of the metrics

Five agents each received the definitions of one topic's metrics, without the values, and recomputed them from the raw files. Three used DuckDB, a different Parquet reader from pyarrow; two used pyarrow without pandas. The workflow script compared the results in code: counts had to match exactly, other values to within 0.001.

| Topic | Engine | Metrics compared | Differences |
|---|---|---|---|
| files_schema | DuckDB | 29 | 0 |
| actors_events | pyarrow | 42 | 0 |
| time | DuckDB | 27 | 0 |
| matches_quality | DuckDB | 34 | 0 |
| coordinates | pyarrow | 43 | 0 |
| **Total** | | **175** | **0** |

The profiler has since grown to 216 metrics. The 41 newer ones were not part of this run. The cleaning counts among them (88, 190, 173 + 33, 1,227, 1,175) were measured independently by the cleaning skeptic below and agree.

Earlier, a plan reviewer decoded all 1,243 files with its own Parquet reader written against the standard library, a third implementation, and reported the same headline numbers (782 / 444 / 17 files by id kind and movement event, 1,505 and 1,420 duplicate rows, 88,826 rows after the first two cleaning rules).

## 2. Blind test of the map orientation

Two agents each looked at eight unlabeled overlays per map, one for each possible axis orientation, in shuffled order, and picked the one that fits. One judged by the edges (dots on the black surround, in open water, on rock), the other by the interior (trails on roads, bridges, building footprints).

Result: 6 of 6 picks were the README orientation, with stated confidence 0.90 to 0.97.

## 3. Four attempts to break the decisions

Four agents were each given one decision with the evidence for it and told to break it. All four came back "weakened": the core held, details did not.

| Decision | What held | What was wrong or overstated | What changed |
|---|---|---|---|
| **Actors.** Human or bot by movement event; events read from the file owner's side | Position marks the human slot. `*Kill` is the owner's kill and `*Killed` the owner's death in human and bot files alike. Classifying by id format would leave 16 matches with no human | The numeric ids on the 17 human files are not players: one fixed id per map, three below the lowest bot id (`actors > numeric_id_on_Position_files_against_bot_id_range_by_map`). "Id 1429 in both roles" is a collision with a Lockdown bot. These 17 journeys are short and almost never end in death: 1 of 17 against 443 of 782 (`files_numeric_with_Position_and_death_row`, `files_uuid_with_death_row`) | They are "anonymous human" journeys: drawn, but kept out of player counts and survival rates. Actors are keyed by match and id, never by id alone |
| **Cleaning.** Three rules; repeated Loot rows are real | Rules 1 and 2 reproduce exactly. Nothing else is replayed, overlapping or out of order afterwards. No teleports: the fastest step is 12.65 units/s. Repeated Loot rows behave like quick pickups, not write errors (agent only: same-spot Loot pairs one second apart are as common as same-second ones, 1,238 against 1,197; 50 same-second twins have a Position row between them) | A fourth rule was missing: all 3 Kill rows mirror a Killed row. The third rule removed 173 rows, not 175, once rules 1 and 2 ran first, and missed 33 rows in the death's own second. Rule 1 did not say which copy to keep. For 21 players a double-fired Loot event cannot be excluded from timing (agent only) | Four rules, measured in order by the profiler (topic `cleaning`): 88, 190, 3 and 206 rows; 88,617 rows remain. The February_11 copy is kept. Repeats are "kept because they cannot be told apart from real repeats" |
| **Time.** `ts` is Unix seconds; sampling pauses while standing still; time zero is the match's first row; folders are UTC days | Unix seconds in UTC is the only reading that fits: activity peaks from 09:00 UTC, mid-afternoon in India, and bottoms out from 21:00 UTC (`timestamps > human_file_starts_by_utc_hour`). All files of a match share one clock (agent only: 27 kill and death pairs fall in the same second, 1 after shuffling). Long gaps are standing still: distance covered does not grow with gap length (`timestamps > Position_distance_by_gap_length`). Every human file starts at its match's first second | "Duration" is the span of the recorded files, which in 743 matches is one human's journey: 372.5 s at the median, against 513.5 s where bot files exist (`match_span_median_without_bot_files`, `match_span_median_with_bot_files`). The folder follows the end of the match with a variable delay, tested at one midnight only. Filing the two-folder match under the earlier day contradicted the folder rule | "Observed span", never "match length". The two-folder match is filed under February_11, where 7 of its 8 files are. The day filter is labelled as UTC days |
| **Coordinates.** README transform, constants right to about 1% | Formula, orientation, vertical flip and real image sizes. No row falls outside the image. No other orientation fits, even with scale and offset left free. Grand Rift's two missing pixel rows shift nothing by more than 2 px | Scale is not pinned to 1%. A joint registration fit prefers an x scale 1.5 to 2% smaller on Ambrose Valley and Lockdown, with z unchanged, and about 3.5% smaller on both axes on Grand Rift, where it is least certain (agent only; see section 4). The river on Ambrose Valley is not a barrier: about 2% of samples are in the water (agent only). Grand Rift's "3.1% on black" was linework inside the map, not the surround | The orientation check now counts samples on the black surround only: 0.00% / 0.40% / 0.00% for the README orientation, at least 5.3% / 4.6% / 2.7% for the others (`orientation_check.json`). The 1% claim is withdrawn; DATA_NOTES states the tolerance. Elevation is carried into the app's data, because floors overlap in 2D (agent only: 4.35% of Ambrose Valley rows sit where two levels stack) |

## 4. Open: are the README's map constants slightly off?

One skeptic fitted scale and offset per map with a registration score (the colour class under each sample against a ring around it), with held-out matches and a bootstrap. The fit, not adopted:

| Map | README | Fitted (agent only) | Largest shift of a point |
|---|---|---|---|
| Ambrose Valley | scale 900, origin x -370 | x scale 882, origin x -365.4; z unchanged | 9 world units (1.0% of the map) |
| Lockdown | scale 1000, origin x -500 | x scale 985, origin x -497.4; z unchanged | 10 world units (1.0%) |
| Grand Rift | scale 581, origin (-290, -290) | scale about 561, origin about (-277, -278.5); provisional | 11 world units (1.9%) |

A second, independent signal on Ambrose Valley points the same way: samples at water level (`y` of about 100) coincide best with river pixels at a slightly smaller x scale. My own zoomed side-by-side of Ambrose Valley's east road agrees: with the README constants the samples run up to about 9 units west of the road, with the fitted ones they sit on it.

The tool uses the README constants, which are the studio's documented transform and right to first order. Whether to apply a calibration is a question for the project owner, recorded in `docs/PROGRESS.md`.

## 5. Review of the documents

Three more agents reviewed the Phase 1 documents with no access to the reasoning behind them.

| Reviewer | Checked | Findings | Outcome |
|---|---|---|---|
| Brief | `BRIEF.md` against the 6-page PDF | 2 should-fix, 5 nits; no requirement missing; no hidden or AI-directed text in the PDF | Applied |
| Evidence | every number in `DATA_NOTES.md`, `CLAUDE.md`, `PLAN.md` against the profile report | 11 should-fix, 4 nits: statements without a source, claims wider than their number, two outright errors | Applied; missing numbers added to the profiler |
| Plan | `PLAN.md` as a studio reviewer would read it | 6 blockers, 22 should-fix, 6 nits: acceptance criteria that could not be checked, hosting and all documents left to the last two days | Applied in the revised plan |
