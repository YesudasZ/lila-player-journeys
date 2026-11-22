# What the data really contains

The dataset README (inside `player_data.zip`, not in git) is checked here against the 1,243 raw files. Where they disagree, the measurement wins.

- Numbers come from `make profile` → [profile/profile_report.md](profile/profile_report.md), which lists every metric with its exact definition. Names in `code style` are metric keys in that report.
- Mapping evidence comes from `make overlay` → [img/](img/) and [profile/orientation_check.json](profile/orientation_check.json).
- `ts` values are the raw integers stored in the files. "Human" and "bot" mean the journey's movement event (row 8), unless a row says "id".

## The five things that matter most

1. **`ts` is Unix time in seconds**, not "milliseconds elapsed within the match". Read as documented, every match would last under one second.
2. **Human or bot is a property of a journey, not of a user_id.** 17 files with a numeric id carry human events, and one numeric id is a human in 14 matches and a bot in 3.
3. **Almost every match is one human and nothing else.** 743 of 796 matches consist of a single file; only 52 include bot journeys; there is no real player-versus-player combat.
4. **The minimaps are not 1024×1024**, and one is not square. The README's formula is right once it is applied to the real image size.
5. **Position is sampled only while a player moves.** Standing still leaves a gap, so sample counts show movement, not time spent.

## README against the data

| Topic | README says | Data shows | Evidence | Decision for the pipeline |
|---|---|---|---|---|
| 1. File format and naming | Parquet without an extension; `{user_id}_{match_id}.nakama-0`; 1,243 files in five day folders | Confirmed. Every file starts and ends with `PAR1`, opens with pyarrow and DuckDB, and is named exactly `user_id + "_" + match_id` from its own columns | `files_total` 1,243; `files_par1_magic` 1,243; `files_unreadable` 0; `files_name_differs_from_columns` 0; folders 437/293/268/166/79 | Read every file in `February_*`; fail the build on an unreadable file. Take ids from the columns |
| 2. Schema | Three strings, three float32, `ts` timestamp (ms), `event` binary | Confirmed, one schema for all files, written by parquet-go, every column non-null | `distinct_schemas` 1; `null_values_total` 0 | Assert the schema in the loader |
| 3. Bytes | `event` is bytes; decode as UTF-8 | Confirmed. Eight distinct values, all valid UTF-8, exactly the README's eight | `distinct_event_values` 8; `event_values_not_utf8` 0 | Decode once in the loader; an unknown or undecodable value fails the build |
| 4. Event mix | Position events are "~85%+" of rows | Position and BotPosition together are 82.0% (57.6% + 24.4%). Loot 14.5%, BotKill 2.7%, BotKilled 0.8%, KilledByStorm 39 rows, Kill 3, Killed 3 | `rows_event_*`; `rows_total` 89,104 | Loot is the only noisy marker layer: off by default |
| 5. Timestamps | Milliseconds elapsed within the match, not wall-clock | **Unix seconds.** Raw range 1,770,681,535 to 1,771,081,300 = 2026-02-09 23:58:55 to 2026-02-14 15:01:40 UTC, matching the folder dates. A file spans 306 raw units at the median and 890 at most: five to fifteen minutes as seconds, under one second as milliseconds. Bots never exceed exactly 5.0 world units per raw unit | `raw_ts_min`, `raw_ts_max`; `file_span_median` 306; `file_span_max` 890; `max_speed_BotPosition` 5.0008; all data files in the zip are stamped 20:36 on 14 Feb, five minutes after the last event in Indian time | Read the raw int64 (`cast` in Arrow) and treat it as epoch seconds. Match time = `ts` minus the smallest `ts` of the match |
| 6. Sampling | Position "sampled periodically" | Nominal 5 s (86.9% of consecutive samples are exactly 5 apart), **but only while moving**: just 0.15% of 5 s steps cover less than half a unit, while 12.8% of human gaps exceed 6 s and hold 30% of human time. Humans' first gap is 20 s at the median, bots' 5 s | `movement_gaps_equal_5` 62,421 of 71,816; `movement_pairs_gap_5_moving_under_half_unit` 91; `Position_pairs_gap_over_6` 6,461; `Position_gap_sum_in_gaps_over_6` 94,921 of 315,851 | Playback: across a long gap the player holds still, then moves during its last 5 s. Heatmaps: a dwell-time layer next to traffic |
| 7. Timestamp resolution and order | Sort by `ts` to rebuild a timeline | One-second resolution; 3,738 rows share their `ts` with the previous row | `rows_same_ts_as_previous_row` 3,738 | Sort by (`ts`, row order in the file), never by `ts` alone |
| 8. Humans and bots | UUID id = human, numeric id = bot | True for 1,226 of 1,243 files. **17 files with a numeric id contain Position rows** (ids 1429, 1379, 1402). They move like humans (14.9% of steps faster than the bots' 5.0 cap; UUID files 14.4%), start like humans (first gap 20 s), loot (115 Loot rows; bot files have none), and 16 of them are the only human file of their match. Id 1429 is also a bot in 3 other files. No file mixes Position and BotPosition | `files_numeric_with_Position` 17; `numeric_user_ids_in_both_roles` 1; `rows_Loot_in_files_with_BotPosition` 0; `files_with_Position_and_BotPosition` 0; `matches_with_0_uuid_users` 16 | Classify each journey by its movement event: Position → human, BotPosition → bot. Keep the id format as a separate flag |
| 9. Who an event belongs to | Kill/Killed are human against human; BotKill = a human killed a bot; BotKilled = a human was killed by a bot. Elsewhere: bots "generate" BotKill and BotKilled | Events are written from the file owner's side, at the owner's own position. In any file, `*Kill` is a kill by the owner and `*Killed` is the owner's death; the `Bot` prefix says a bot was on one side. In bot files BotKilled is the bot dying (296 of 444 bot files have one) and BotKill is the bot killing. A kill and its matching death sit in two files about 12 units apart | Event rows lie 0.5 to 3 units (median) from the owner's nearest position sample; 35 human BotKill rows pair with a bot's BotKilled within 1 s at a median distance of 12.4; every death row is within 6 s of the end of its file | Kill markers show where the killer stood; death markers where the victim fell. "Kill zone" and "death zone" heatmaps are therefore different pictures |
| 10. Player versus player | Kill and Killed events exist | 3 Kill and 3 Killed rows in total. Each Kill has a Killed twin in the **same file, same second, same position**, the journey ends within 2 s, and each match holds one human | `rows_event_Kill` 3; `Kill_rows_with_Killed_twin_in_same_file` 3 | Draw each twin as one death. Kills in this dataset are kills of bots |
| 11. Match size | "Typically multiple human players and bots"; 10 humans and 40 bots make 50 files | 743 of 796 matches (93.3%) are a single file. 794 matches have exactly one human journey and 2 have two. 52 matches include bot journeys (4 to 14 each). Humans in single-file matches still log BotKill rows, so bots were present but not recorded | `matches_single_file` 743; `matches_with_1_Position_users` 794; `matches_with_BotPosition_files` 52; `matches_max_files` 16 | Aggregated views first. Match list sorted busiest first, with a flag on the 52 matches that have bots |
| 12. Matches and maps | 796 matches, three maps | Confirmed: Ambrose Valley 566, Lockdown 171, Grand Rift 59. A match lasts 6 to 7.5 minutes at the median and 14 min 50 s at most | `distinct_matches` 796; `matches_*`; `match_span_max` 890 | One bundle per map |
| 13. Day folders | Five days, 10 to 14 Feb 2026; 14 Feb is partial | Folders are **UTC days of when the file was written**, just after the journey ended: the folder equals the UTC date of the last row for 1,235 files (Indian time: 1,053). The 8 others ended within minutes of midnight. 14 Feb stops at 15:01 UTC | `files_last_row_date_differs_from_folder_utc` 8; `files_first_row_date_differs_from_folder_utc` 11; best-fitting offset 0 h | The date filter uses the folder name. The one match with files in two folders goes to the earlier day |
| 14. A journey stored twice | Not mentioned | One journey (`cfa03e9f_ac049b28`) exists as two identical 88-row files, in February_10 and February_11. Its match ended at 23:56:37 UTC | `journeys` 1,242; `journeys_in_several_files` 1; `matches_in_several_day_folders` 1 | Keep one copy |
| 15. Files written twice | Not mentioned | Three files hold their whole row sequence twice: the second half repeats the first row for row. These are the only files whose `ts` ever goes backwards | `files_written_twice` 3; `files_ts_goes_backwards` 3 (8, 78 and 294 rows) | Keep the first half |
| 16. Identical rows | Not mentioned | 1,505 surplus identical rows in the dataset, 1,420 inside a file. Outside the three doubled files **no movement row is ever duplicated**, yet 1,198 Loot and 30 BotKill rows are, 83% of them directly after their twin | `duplicate_rows_whole_dataset` 1,505; `duplicate_rows_within_file` 1,420 (Loot 1,237, Position 147, BotKill 34, BotKilled 2) | After rows 14 and 15, keep the rest: they are repeated events (several items picked up in one second), not write errors. The app shows one marker with a count |
| 17. Rows after death | Not mentioned | 175 Position rows carry a `ts` 1 to 6 s after their owner's death, and 34 more share the death's second but come later in the file. Two BotKill rows come 3 s and 5 s after the owner died | `rows_after_first_death` 177 (Position 175, BotKill 2); `rows_after_first_death_max_gap` 6 | A path ends at the death row; later Position rows are dropped. The two late kills are kept |
| 18. Fate | Players "must extract" | There is no extraction or match-end event. Of 799 human files, 444 end in a death (402 to a bot, 39 to the storm, 3 Kill/Killed twins) and 355 (44%) record none. A death can come long after the last position sample: 454 s at most | Files by actor and fate in the report; `death_row_max_gap_after_last_movement_row` 454 | Fate is "killed by bot", "killed by storm", "killed (player event)" or "survived (no death recorded)" |
| 19. Storm | A storm pushes across the map | 39 storm deaths, all between 655 and 887 s into the match, on all three maps (17, 5, 17) | Storm deaths by map in the report | A separate marker and heatmap layer |
| 20. Minimap size | 1024×1024 pixels | 4320×4320 (PNG), 2160×**2158** (PNG), 9000×9000 (JPEG) | `*_minimap_width`, `*_minimap_height` | Store positions as UV; multiply by the real width and height. Ship downscaled WebP |
| 21. Coordinate mapping | `u = (x - origin_x) / scale`, `v = (z - origin_z) / scale`, `pixel = (u * 1024, (1 - v) * 1024)`; `y` is elevation | The formula and all three sets of constants hold. Every row lands inside the image. Of the eight possible axis orientations only the README's keeps players off the black surround: 0.01% / 3.1% / 0.06% of samples on black (Ambrose Valley / Grand Rift / Lockdown) against at least 5.3% / 6.5% / 2.7% for the others. Zoomed in, paths cross the Ambrose Valley river on the bridge and flow around Lockdown's rocks | `*_rows_outside_image` 0; `readme_example_pixel_x` 78, `_y` 890; [orientation_check.json](profile/orientation_check.json); `img/overlay_*.jpg`, `img/orientation_*.jpg` | Use the README transform unchanged, in one function (`pipeline/maps.py`) |
| 22. Bad coordinates | Not mentioned | None: no NaN, no infinity, no row at the origin | `rows_with_nan_or_infinite_coordinate` 0; `rows_at_x0_z0` 0 | Keep the checks in the build as assertions |
| 23. Quick stats | ~89,000 rows; 339 unique players; 796 matches | 89,104 rows and 796 matches. "339 players" is the number of distinct ids, of which 94 are numeric. 248 ids have at least one human journey | `distinct_user_ids` 339; `distinct_uuid_user_ids` 245; `distinct_user_ids_with_Position` 248 | Report "248 players" in the tool, with the caveat of row 8 |

## Claims we were warned about, tested

Other candidates' public write-ups were treated as hypotheses only.

| Claim | Verdict | Numbers |
|---|---|---|
| 1,243 extensionless Parquet files, one per player per match | Confirmed | 1,243 files, 1,242 journeys (one stored twice) |
| Eight event types, `event` as bytes, `y` is elevation | Confirmed | Row 3, row 21 |
| Loot is about 78.9% of rows | **Rejected** | Loot is 14.5% of rows and 80.3% of the non-movement rows |
| Numeric id = bot, UUID = human | **Partly** | Fails for 17 files (row 8) |
| Some bot ids emit Position (636 rows) and Loot (115 rows) | Confirmed, reinterpreted | The counts are exact; the journeys are human |
| BotKill and BotKilled also appear in bots' own files | Confirmed | 170 and 296 rows in bot files |
| `ts` is epoch seconds inside a `timestamp[ms]` column | Confirmed | Row 5 |
| Positions are sampled about every 5 s | Confirmed, with a catch | Only while moving (row 6) |
| Day folders may not be UTC days | **Partly** | They are UTC days, by write time; 8 to 11 files near midnight differ |
| Minimaps are 4320², 2160×2158 and 9000² | Confirmed | Row 20 |
| 89,104 rows, 796 matches, 566 on Ambrose Valley | Confirmed | Rows 12 and 23 |
| 248 humans and 91 bots | **Partly** | 248 ids have human journeys, 92 have bot journeys; one id has both |
| One journey split across two day folders | **Partly** | Not split: stored twice, identical (row 14) |
| 1,505 exact duplicate rows, mostly loot | Confirmed | Row 16; most are real repeated events |
| About 175 rows after a player's death | Confirmed | 175 Position rows plus 2 kills (row 17) |
| Three files not sorted by time | Confirmed, explained | They are written twice (row 15) |
| About 93% of matches have one recorded human journey | Confirmed | 93.3% are a single file; 99.7% have exactly one human journey |

## Where the README contradicts itself

1. It calls `ts` time elapsed within the match, yet its two sample rows, from two different matches, read 2026-02-10 12:39:21 and 16:31:22 UTC as Unix seconds.
2. Its event table makes BotKill and BotKilled human events; its "Bots vs Humans" section gives them to bots.
3. It says a match typically has several humans and bots, but ships 1,243 files for 796 matches.
4. It says `match_id` includes a `.nakama-0` suffix, and presents `.nakama-0` as a file extension.
5. It opens with "battle-royale style game" and later says extraction shooter.

## Assumptions the data cannot settle

| # | Assumption | Why we make it | If it is wrong |
|---|---|---|---|
| A1 | The 17 numeric-id journeys with Position rows are human-controlled | Speed, start-up gap and looting match humans and never match bots | They would be a third kind of actor; the id-format flag is kept so they can be restyled |
| A2 | Identical Loot and BotKill rows are repeated events, not write errors | A write error would also duplicate movement rows, and outside the doubled files none is | Loot counts would be about 10% too high; markers are unaffected |
| A3 | A human journey with no death row survived | No extraction event exists | "Survived" would include disconnects |
| A4 | A Kill row with a Killed twin is one death, not a kill | Same file, second and position; the journey ends there; no second human in the match | Three kill markers would be missing |
| A5 | World units are roughly metres | Humans move at 2.3 units/s at the median, bots are capped at 5.0 | Nothing depends on it |

## What this means for the tool

- **Aggregated views carry the value.** With one human per match, "all matches on this map" answers a Level Designer's questions; single-match playback is richest in the 52 matches with bots.
- **Kill zones are places where players killed bots.** Death zones are mostly places where bots killed players.
- **Traffic and dwell are different.** Sample counts show where players pass through; time-weighted counts show where they stop.
- **Storm deaths are a late-match signal** (after the eleventh minute) on every map.
- **"Ignored areas" need a playable-area mask**, taken from the non-black part of each minimap.
